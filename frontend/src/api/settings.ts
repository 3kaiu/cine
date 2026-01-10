import api from './client'

export interface SettingsResponse {
  settings: Record<string, string>
}

export interface UpdateSettingsRequest {
  settings: Record<string, string>
}

export interface UpdateSettingsResponse {
  message: string
  updated: string[]
}

export const settingsApi = {
  // 获取设置
  getSettings: (category?: string) =>
    api.get<SettingsResponse>('/settings', { params: { category } }),

  // 更新设置
  updateSettings: (data: UpdateSettingsRequest) =>
    api.post<UpdateSettingsResponse>('/settings', data),
}
