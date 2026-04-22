import api from './client'

export interface SettingsResponse {
  settings: Record<string, string>
  masked_settings: Record<string, string>
  configured_keys: string[]
}

export interface UpdateSettingsRequest {
  settings: Record<string, string>
}

export interface UpdateSettingsResponse {
  message: string
  updated: string[]
}

export interface SettingsHealthCheckRequest {
  provider: string
  settings?: Record<string, string>
}

export interface SettingsHealthCheckResponse {
  provider: string
  ok: boolean
  message: string
  details: Record<string, string>
}

export const settingsApi = {
  // 获取设置
  getSettings: (category?: string) =>
    api.get<SettingsResponse>('/settings', { params: { category } }),

  // 更新设置
  updateSettings: (data: UpdateSettingsRequest) =>
    api.post<UpdateSettingsResponse>('/settings', data),

  testConnection: (data: SettingsHealthCheckRequest) =>
    api.post<SettingsHealthCheckResponse>('/settings/health-check', data),
}
