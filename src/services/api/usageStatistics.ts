import { apiClient } from './client';
import type { UsageStatisticsRange, UsageStatisticsSnapshot } from '@/types/usageStatistics';

const USAGE_STATISTICS_TIMEOUT_MS = 15 * 1000;

export interface UsageStatisticsParams {
  range?: UsageStatisticsRange;
  limit?: number;
}

export const usageStatisticsApi = {
  getStatistics: ({ range = '24h', limit = 8 }: UsageStatisticsParams = {}) => {
    const params = new URLSearchParams();
    params.set('range', range);
    params.set('limit', String(limit));
    return apiClient.get<UsageStatisticsSnapshot>(`/usage-statistics?${params.toString()}`, {
      timeout: USAGE_STATISTICS_TIMEOUT_MS,
    });
  },
};
