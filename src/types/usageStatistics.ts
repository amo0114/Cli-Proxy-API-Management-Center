export type UsageStatisticsRange = '7h' | '24h' | '7d' | 'all';

export interface UsageTokenStats {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
}

export interface UsageCounters {
  requests: number;
  success: number;
  failed: number;
  latency_ms: number;
  ttft_ms: number;
  tokens: UsageTokenStats;
}

export interface UsageStatisticsGroup extends UsageCounters {
  provider: string;
  executor_type: string;
  model: string;
  alias: string;
  auth_index: string;
  auth_type: string;
  source: string;
  endpoint: string;
  reasoning_effort: string;
  service_tier: string;
  last_request_at: string;
}

export interface UsageStatisticsSnapshot {
  enabled: boolean;
  generated_at: string;
  range: UsageStatisticsRange;
  recent_limit: number;
  truncated: boolean;
  totals: UsageCounters;
  groups: UsageStatisticsGroup[];
}
