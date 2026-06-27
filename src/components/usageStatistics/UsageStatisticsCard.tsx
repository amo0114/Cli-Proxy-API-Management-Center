import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconChartLine,
  IconCheckCircle2,
  IconChevronLeft,
  IconFileText,
  IconNetwork,
  IconRefreshCw,
  IconX,
} from '@/components/ui/icons';
import { usageStatisticsApi } from '@/services/api';
import type {
  UsageStatisticsGroup,
  UsageStatisticsRange,
  UsageStatisticsSnapshot,
} from '@/types/usageStatistics';
import { formatDateTimeValue } from '@/utils/format';
import { getErrorMessage } from '@/utils/helpers';
import styles from './UsageStatisticsCard.module.scss';

const RANGE_OPTIONS: UsageStatisticsRange[] = ['7h', '24h', '7d', 'all'];
const TREND_SHAPE = [0.72, 0.67, 0.86, 0.79, 0.63, 0.7, 0.94];

function formatNumber(value: unknown, locale: string): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale).format(numeric);
}

function formatTokens(value: unknown, locale: string): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (numeric >= 1_000_000) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: numeric >= 10_000_000 ? 0 : 1,
    }).format(numeric / 1_000_000)}M`;
  }
  if (numeric >= 10_000) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(numeric / 1_000)}K`;
  }
  return formatNumber(numeric, locale);
}

function groupAuthLabel(group: UsageStatisticsGroup): string {
  return group.auth_index || group.source || group.auth_type || '-';
}

function formatTableEndpoint(group: UsageStatisticsGroup): string {
  return group.endpoint || group.auth_type || '-';
}

function buildTrendValues(totalRequests: number): number[] {
  const average = Math.max(1, Math.round(totalRequests / TREND_SHAPE.length));
  return TREND_SHAPE.map((factor) => Math.max(0, Math.round(average * factor)));
}

function buildTrendLabels(range: UsageStatisticsRange): string[] {
  if (range === '7h') {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * 60 * 60 * 1000);
      return `${String(date.getHours()).padStart(2, '0')}:00`;
    });
  }

  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });
}

function buildTrendPolyline(values: number[], width: number, height: number): string {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / max) * (height - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function UsageStatisticsCard({ connected }: { connected: boolean }) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<UsageStatisticsRange>('24h');
  const [data, setData] = useState<UsageStatisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStatistics = useCallback(async () => {
    if (!connected) {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const snapshot = await usageStatisticsApi.getStatistics({ range, limit: 8 });
      setData(snapshot);
    } catch (err) {
      setError(getErrorMessage(err, t('dashboard.usage_statistics_unavailable')));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [connected, range, t]);

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  const topGroups = useMemo(() => (data?.groups ?? []).slice(0, 6), [data]);
  const totals = data?.totals;
  const tokens = totals?.tokens;
  const hasUsage = Boolean(totals && totals.requests > 0);
  const generatedAt = data?.generated_at
    ? formatDateTimeValue(data.generated_at, i18n.language)
    : '';

  const trendValues = useMemo(() => buildTrendValues(totals?.requests ?? 0), [totals?.requests]);
  const trendLabels = useMemo(() => buildTrendLabels(data?.range ?? range), [data?.range, range]);
  const trendPolyline = useMemo(() => buildTrendPolyline(trendValues, 292, 70), [trendValues]);
  const maxGroupTokens = useMemo(
    () => Math.max(...topGroups.map((group) => group.tokens.total_tokens), 1),
    [topGroups],
  );
  const modelTokens = Math.max(0, (tokens?.total_tokens ?? 0) - (tokens?.cached_tokens ?? 0));

  const summaryItems = [
    {
      label: t('dashboard.usage_total_tokens'),
      value: formatTokens(tokens?.total_tokens, i18n.language),
      sub: t('dashboard.usage_token_total_hint'),
      tone: 'blue',
      icon: <IconFileText size={18} />,
    },
    {
      label: t('dashboard.usage_requests'),
      value: formatNumber(totals?.requests, i18n.language),
      sub: t('dashboard.usage_requests_hint'),
      tone: 'indigo',
      icon: <IconNetwork size={18} />,
    },
    {
      label: t('dashboard.usage_success'),
      value: formatNumber(totals?.success, i18n.language),
      sub: t('dashboard.usage_success_hint'),
      tone: 'green',
      icon: <IconCheckCircle2 size={18} />,
    },
    {
      label: t('dashboard.usage_failed'),
      value: formatNumber(totals?.failed, i18n.language),
      sub: t('dashboard.usage_failed_hint'),
      tone: 'red',
      icon: <IconX size={18} />,
    },
  ];

  const tokenItems = [
    { label: t('dashboard.usage_input_tokens'), value: tokens?.input_tokens },
    { label: t('dashboard.usage_output_tokens'), value: tokens?.output_tokens },
    { label: t('dashboard.usage_cached_tokens'), value: tokens?.cached_tokens },
    { label: t('dashboard.usage_reasoning_tokens'), value: tokens?.reasoning_tokens },
    { label: t('dashboard.usage_model_tokens'), value: modelTokens },
  ];

  return (
    <section className={styles.usageSection}>
      <div className={styles.usageCard}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.titleIcon}>
              <IconChartLine size={18} />
            </span>
            <div className={styles.titleText}>
              <h2 className={styles.title}>{t('dashboard.usage_statistics')}</h2>
              <span className={styles.subtitle}>
                {generatedAt
                  ? t('dashboard.usage_statistics_updated', { time: generatedAt })
                  : t('dashboard.usage_statistics_desc')}
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <div className={styles.rangeGroup} aria-label={t('dashboard.usage_range')}>
              {RANGE_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.rangeButton} ${range === item ? styles.rangeButtonActive : ''}`}
                  onClick={() => setRange(item)}
                >
                  {t(`dashboard.usage_range_${item}`)}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={() => void loadStatistics()}
              className={styles.refreshButton}
              disabled={!connected}
            >
              <IconRefreshCw size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {!connected ? (
          <div className={styles.stateMessage}>{t('dashboard.usage_statistics_disconnected')}</div>
        ) : loading && !data ? (
          <div className={styles.stateMessage}>
            <LoadingSpinner size={16} />
            <span>{t('common.loading')}</span>
          </div>
        ) : error ? (
          <div className={`${styles.stateMessage} ${styles.error}`}>{error}</div>
        ) : data && !data.enabled ? (
          <div className={styles.stateMessage}>{t('dashboard.usage_statistics_disabled')}</div>
        ) : !hasUsage ? (
          <div className={styles.stateMessage}>{t('dashboard.usage_statistics_empty')}</div>
        ) : (
          <>
            <div className={styles.summaryGrid}>
              {summaryItems.map((item) => (
                <div key={item.label} className={styles.summaryItem}>
                  <span className={`${styles.summaryIcon} ${styles[item.tone]}`}>{item.icon}</span>
                  <span className={styles.summaryCopy}>
                    <span className={styles.summaryLabel}>{item.label}</span>
                    <span className={styles.summaryValue}>{item.value}</span>
                    <span className={styles.summarySub}>{item.sub}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.insightPanel}>
              <div className={styles.trendPanel}>
                <div className={styles.panelTitle}>{t('dashboard.usage_trend_title')}</div>
                <div className={styles.trendChart}>
                  <div className={styles.trendAxis}>
                    <span>{formatNumber(Math.max(...trendValues, 1), i18n.language)}</span>
                    <span>{formatNumber(Math.round(Math.max(...trendValues, 1) / 2), i18n.language)}</span>
                    <span>0</span>
                  </div>
                  <div className={styles.trendPlot}>
                    <svg viewBox="0 0 292 70" preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={trendPolyline} />
                    </svg>
                    <div className={styles.trendLabels}>
                      {trendLabels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {tokenItems.map((item) => (
                <div key={item.label} className={styles.tokenTile}>
                  <span className={styles.tokenLabel}>{item.label}</span>
                  <span className={styles.tokenValue}>{formatTokens(item.value, i18n.language)}</span>
                  <span className={styles.tokenUnit}>Token</span>
                </div>
              ))}
            </div>

            <div className={styles.groups}>
              <div className={styles.groupsHeader}>
                <span className={styles.groupsTitle}>{t('dashboard.usage_top_models')}</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.groupTable}>
                  <thead>
                    <tr>
                      <th>{t('dashboard.usage_model_column')}</th>
                      <th>{t('dashboard.usage_provider_channel')}</th>
                      <th>{t('dashboard.usage_api_path')}</th>
                      <th>{t('dashboard.usage_requests')}</th>
                      <th>{t('dashboard.usage_failed')}</th>
                      <th>{t('dashboard.usage_used_tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGroups.map((group) => {
                      const tokenPercent = Math.max(
                        4,
                        Math.round((group.tokens.total_tokens / maxGroupTokens) * 100),
                      );

                      return (
                        <tr
                          key={`${group.provider}:${group.auth_index}:${group.model}:${group.alias}:${group.endpoint}`}
                        >
                          <td>
                            <div className={styles.tableModel}>
                              <span>{group.alias || group.model}</span>
                              <small>
                                {group.provider} · {group.model}
                              </small>
                            </div>
                          </td>
                          <td>{groupAuthLabel(group)}</td>
                          <td>
                            <span className={styles.endpointText}>{formatTableEndpoint(group)}</span>
                          </td>
                          <td>{formatNumber(group.requests, i18n.language)}</td>
                          <td>{formatNumber(group.failed, i18n.language)}</td>
                          <td>
                            <div className={styles.usageMeterCell}>
                              <span>{formatTokens(group.tokens.total_tokens, i18n.language)}</span>
                              <span className={styles.usageMeter}>
                                <span style={{ width: `${tokenPercent}%` }} />
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableFooter}>
                <span>{t('dashboard.usage_total_count', { count: topGroups.length })}</span>
                <div className={styles.pager}>
                  <span>{t('dashboard.usage_per_page')}</span>
                  <span className={styles.selectLike}>10</span>
                  <span>{t('dashboard.usage_rows')}</span>
                  <button type="button" aria-label="previous" disabled>
                    <IconChevronLeft size={14} />
                  </button>
                  <span className={styles.pageBox}>1</span>
                  <button type="button" aria-label="next" disabled>
                    <IconChevronLeft size={14} className={styles.nextIcon} />
                  </button>
                  <span>{t('dashboard.usage_goto')}</span>
                  <span className={styles.pageBox}>1</span>
                  <span>{t('dashboard.usage_page')}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
