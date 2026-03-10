import api from './client'

export interface DashboardMetrics {
  active_tasks: number
  total_hashes_bytes: number
  total_scrapes: number
  cpu_usage: number
  memory_used_bytes: number
  memory_total_bytes: number
  uptime_seconds?: number
}

export const metricsApi = {
  get: () => api.get<DashboardMetrics>('/metrics'),
}
