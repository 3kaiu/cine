import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
)

// 响应拦截器：统一返回 data，错误时增强 error 信息
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      const msg = (data as { error?: string })?.error || error.message
      if (status === 401) {
        // 未授权，可在此跳转登录
      } else if (status >= 500) {
        console.error('[API] Server error:', status, msg)
      }
      // 将后端错误信息挂到 error 上，便于 handleError 使用
      error.apiMessage = msg
    }
    return Promise.reject(error)
  }
)

export default api
