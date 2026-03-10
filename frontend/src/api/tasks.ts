import api from './client'

export type TaskStatus =
  | { status: 'pending' }
  | { status: 'running'; progress: number; message: string | null }
  | { status: 'paused'; progress: number }
  | { status: 'completed'; duration_secs: number; result: string | null }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' }

export interface TaskInfo {
  id: string
  task_type: string
  status: TaskStatus
  created_at: string
  updated_at: string
  description: string | null
}

export interface TaskListResponse {
  success: boolean
  data: {
    tasks: TaskInfo[]
    total: number
    page: number
    page_size: number
    active: number
  }
  error?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const tasksApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api.get<TaskListResponse>('/tasks', { params }),

  get: (id: string) =>
    api.get<ApiResponse<TaskInfo>>(`/tasks/${id}`),

  pause: (id: string) =>
    api.post<ApiResponse<string>>(`/tasks/${id}/pause`),

  resume: (id: string) =>
    api.post<ApiResponse<string>>(`/tasks/${id}/resume`),

  cancel: (id: string) =>
    api.delete<ApiResponse<string>>(`/tasks/${id}`),

  cleanup: () =>
    api.post<ApiResponse<string>>('/tasks/cleanup'),
}
