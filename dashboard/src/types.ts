export interface LogEntry {
  data: {
    created_at: string;
    model: string;
    latency: number;
    generation_time: number;
    tokens_prompt: number;
    tokens_completion: number;
    total_cost: number;
    provider_name: string;
    url?: string;
    article_title?: string;
    id: string;
    native_tokens_reasoning?: number;
  };
}

export interface DashboardStats {
  totalRequests: number;
  totalCost: number;
  avgLatency: number;
  totalTokens: number;
}
