import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { authFilesApi, type OpenCodeGoCredentialPayload } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, OpenCodeGoQuotaResult, OpenCodeGoQuotaWindow } from '@/types';
import { formatDateTimeValue } from '@/utils/format';
import styles from '@/pages/AuthFilesPage.module.scss';

type FormState = {
  name: string;
  workspaceId: string;
  authCookie: string;
  clearAuthCookie: boolean;
  enabled: boolean;
  showRolling: boolean;
  showWeekly: boolean;
  showMonthly: boolean;
  refreshIntervalSec: string;
};

export type OpenCodeGoCredentialModalProps = {
  open: boolean;
  file: AuthFileItem | null;
  disableControls: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const DEFAULT_FORM: FormState = {
  name: 'OpenCode',
  workspaceId: 'Default',
  authCookie: '',
  clearAuthCookie: false,
  enabled: true,
  showRolling: true,
  showWeekly: true,
  showMonthly: true,
  refreshIntervalSec: '60',
};

const readObjectField = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const readTextField = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const readBooleanField = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const readNumberField = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const resolveCredentialId = (file: AuthFileItem): string => {
  const credential = readObjectField(file.opencode_go);
  return readTextField(credential?.id) || readTextField(file.id) || file.name;
};

const resolveMaskedCookie = (file: AuthFileItem | null): string => {
  if (!file) return '';
  const credential = readObjectField(file.opencode_go);
  return (
    readTextField(file.masked_auth_cookie) ||
    readTextField(file.auth_cookie) ||
    readTextField(credential?.auth_cookie)
  );
};

const buildInitialForm = (file: AuthFileItem | null): FormState => {
  if (!file) return DEFAULT_FORM;
  const credential = readObjectField(file.opencode_go);
  const enabled = readBooleanField(
    credential?.enabled,
    file.disabled === undefined ? DEFAULT_FORM.enabled : !file.disabled
  );

  return {
    name:
      readTextField(file.credential_name) ||
      readTextField(file.display_name) ||
      readTextField(credential?.name) ||
      file.name,
    workspaceId:
      readTextField(file.workspace_id) ||
      readTextField(credential?.workspace_id) ||
      DEFAULT_FORM.workspaceId,
    authCookie: '',
    clearAuthCookie: false,
    enabled,
    showRolling: readBooleanField(file.show_rolling ?? credential?.show_rolling, true),
    showWeekly: readBooleanField(file.show_weekly ?? credential?.show_weekly, true),
    showMonthly: readBooleanField(file.show_monthly ?? credential?.show_monthly, true),
    refreshIntervalSec: String(
      readNumberField(file.refresh_interval_sec ?? credential?.refresh_interval_sec, 60)
    ),
  };
};

const normalizeRefreshInterval = (value: string): number | null => {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(15, Math.round(parsed));
};

const formatQuotaWindow = (window: OpenCodeGoQuotaWindow | null | undefined): string => {
  if (!window) return '';
  const usage = Number(window.usage_percent);
  const remaining = Number(window.remaining_percent);
  const usageLabel = Number.isFinite(usage) ? `${Math.round(usage)}%` : '--';
  const remainingLabel = Number.isFinite(remaining) ? `${Math.round(remaining)}%` : '--';
  return `${usageLabel} / ${remainingLabel}`;
};

export function OpenCodeGoCredentialModal({
  open,
  file,
  disableControls,
  onClose,
  onSaved,
}: OpenCodeGoCredentialModalProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testError, setTestError] = useState('');
  const [testResult, setTestResult] = useState<OpenCodeGoQuotaResult | null>(null);

  const isEdit = Boolean(file);
  const maskedCookie = useMemo(() => resolveMaskedCookie(file), [file]);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(file));
    setError('');
    setTestError('');
    setTestResult(null);
  }, [file, open]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const buildPayload = (requireCookie: boolean): OpenCodeGoCredentialPayload | null => {
    const name = form.name.trim();
    const workspaceId = form.workspaceId.trim() || DEFAULT_FORM.workspaceId;
    const refreshIntervalSec = normalizeRefreshInterval(form.refreshIntervalSec);
    const authCookie = form.authCookie.trim();

    if (!name) {
      setError(t('auth_files.opencode_go_name_required'));
      return null;
    }
    if (refreshIntervalSec === null) {
      setError(t('auth_files.opencode_go_refresh_invalid'));
      return null;
    }
    if (requireCookie && !authCookie) {
      setError(t('auth_files.opencode_go_cookie_required'));
      return null;
    }

    const payload: OpenCodeGoCredentialPayload = {
      name,
      workspace_id: workspaceId,
      enabled: form.enabled,
      show_rolling: form.showRolling,
      show_weekly: form.showWeekly,
      show_monthly: form.showMonthly,
      refresh_interval_sec: refreshIntervalSec,
    };
    if (authCookie) {
      payload.auth_cookie = authCookie;
    } else if (isEdit && form.clearAuthCookie) {
      payload.clear_auth_cookie = true;
    }
    return payload;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disableControls || saving) return;
    setError('');

    const payload = buildPayload(!isEdit);
    if (!payload) return;

    setSaving(true);
    try {
      if (isEdit && file) {
        const credentialId = resolveCredentialId(file);
        await authFilesApi.patchOpenCodeGoCredential(credentialId, payload);
        showNotification(t('auth_files.opencode_go_update_success'), 'success');
      } else {
        await authFilesApi.createOpenCodeGoCredential(payload);
        showNotification(t('auth_files.opencode_go_create_success'), 'success');
      }
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (disableControls || testing) return;
    setError('');
    setTestError('');
    setTestResult(null);

    const payload = buildPayload(true);
    if (!payload) return;

    setTesting(true);
    try {
      const response = await authFilesApi.testOpenCodeGoCredential(payload);
      setTestResult(response.quota ?? null);
      showNotification(t('auth_files.opencode_go_test_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      setTestError(message);
      showNotification(t('auth_files.opencode_go_test_failed', { message }), 'error');
    } finally {
      setTesting(false);
    }
  };

  const footer = (
    <div className={styles.opencodeGoFormActions}>
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving || testing}>
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void handleTest()}
        disabled={disableControls || saving || testing || !form.authCookie.trim()}
        loading={testing}
      >
        {t('auth_files.opencode_go_test_button')}
      </Button>
      <Button type="submit" form="opencode-go-credential-form" disabled={disableControls || testing} loading={saving}>
        {isEdit ? t('common.save') : t('auth_files.opencode_go_create_button')}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      title={
        isEdit
          ? t('auth_files.opencode_go_edit_title', { name: file?.name ?? '' })
          : t('auth_files.opencode_go_create_title')
      }
      onClose={saving || testing ? () => {} : onClose}
      closeDisabled={saving || testing}
      footer={footer}
      width={640}
    >
      <form id="opencode-go-credential-form" className={styles.opencodeGoForm} onSubmit={handleSubmit}>
        <div className={styles.opencodeGoFieldGrid}>
          <Input
            label={t('auth_files.opencode_go_name_label')}
            value={form.name}
            onChange={(event) => updateForm('name', event.currentTarget.value)}
            placeholder="OpenCode"
            disabled={disableControls || saving}
          />
          <Input
            label={t('auth_files.opencode_go_workspace_label')}
            value={form.workspaceId}
            onChange={(event) => updateForm('workspaceId', event.currentTarget.value)}
            placeholder="Default"
            hint={t('auth_files.opencode_go_workspace_hint')}
            disabled={disableControls || saving}
          />
        </div>

        <Input
          label={t('auth_files.opencode_go_cookie_label')}
          type="password"
          value={form.authCookie}
          onChange={(event) => {
            updateForm('authCookie', event.currentTarget.value);
            if (event.currentTarget.value.trim()) {
              updateForm('clearAuthCookie', false);
            }
          }}
          placeholder={isEdit ? t('auth_files.opencode_go_cookie_edit_placeholder') : ''}
          hint={
            isEdit && maskedCookie
              ? t('auth_files.opencode_go_cookie_edit_hint', { cookie: maskedCookie })
              : t('auth_files.opencode_go_cookie_create_hint')
          }
          autoComplete="off"
          disabled={disableControls || saving || form.clearAuthCookie}
        />

        {isEdit && (
          <div className={styles.opencodeGoToggleItem}>
            <ToggleSwitch
              checked={form.clearAuthCookie}
              onChange={(value) => {
                updateForm('clearAuthCookie', value);
                if (value) updateForm('authCookie', '');
              }}
              disabled={disableControls || saving}
              ariaLabel={t('auth_files.opencode_go_clear_cookie_label')}
              label={<span>{t('auth_files.opencode_go_clear_cookie_label')}</span>}
            />
            <div className="hint">{t('auth_files.opencode_go_clear_cookie_hint')}</div>
          </div>
        )}

        <div className={styles.opencodeGoToggleGrid}>
          <div className={styles.opencodeGoToggleItem}>
            <ToggleSwitch
              checked={form.enabled}
              onChange={(value) => updateForm('enabled', value)}
              disabled={disableControls || saving}
              ariaLabel={t('auth_files.status_toggle_label')}
              label={<span>{t('auth_files.status_toggle_label')}</span>}
            />
          </div>
          <div className={styles.opencodeGoToggleItem}>
            <ToggleSwitch
              checked={form.showRolling}
              onChange={(value) => updateForm('showRolling', value)}
              disabled={disableControls || saving}
              ariaLabel={t('auth_files.opencode_go_show_rolling')}
              label={<span>{t('auth_files.opencode_go_show_rolling')}</span>}
            />
          </div>
          <div className={styles.opencodeGoToggleItem}>
            <ToggleSwitch
              checked={form.showWeekly}
              onChange={(value) => updateForm('showWeekly', value)}
              disabled={disableControls || saving}
              ariaLabel={t('auth_files.opencode_go_show_weekly')}
              label={<span>{t('auth_files.opencode_go_show_weekly')}</span>}
            />
          </div>
          <div className={styles.opencodeGoToggleItem}>
            <ToggleSwitch
              checked={form.showMonthly}
              onChange={(value) => updateForm('showMonthly', value)}
              disabled={disableControls || saving}
              ariaLabel={t('auth_files.opencode_go_show_monthly')}
              label={<span>{t('auth_files.opencode_go_show_monthly')}</span>}
            />
          </div>
        </div>

        <Input
          label={t('auth_files.opencode_go_refresh_interval_label')}
          type="number"
          min={15}
          step={1}
          value={form.refreshIntervalSec}
          onChange={(event) => updateForm('refreshIntervalSec', event.currentTarget.value)}
          hint={t('auth_files.opencode_go_refresh_interval_hint')}
          disabled={disableControls || saving}
        />

        {error && <div className={styles.opencodeGoModalError}>{error}</div>}
        {testError && <div className={styles.opencodeGoModalError}>{testError}</div>}
        {testResult && (
          <div className={styles.opencodeGoTestResult}>
            <div className={styles.opencodeGoTestHeader}>
              <span>{t('auth_files.opencode_go_test_result')}</span>
              {testResult.plan && <strong>{testResult.plan}</strong>}
            </div>
            <div className={styles.opencodeGoWindowList}>
              {(['rolling', 'weekly', 'monthly'] as const).map((key) => {
                const value = formatQuotaWindow(testResult[key]);
                if (!value) return null;
                return (
                  <div key={key} className={styles.opencodeGoWindowRow}>
                    <span className={styles.opencodeGoWindowLabel}>
                      {t(`opencode_go_quota.${key}_limit`)}
                    </span>
                    <span className={styles.opencodeGoWindowMeta}>{value}</span>
                  </div>
                );
              })}
            </div>
            {testResult.fetched_at && (
              <div className="hint">
                {t('opencode_go_quota.fetched_at')} {formatDateTimeValue(testResult.fetched_at)}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
