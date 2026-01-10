import { showError } from './toast'

/**
 * 错误消息映射表 - 将技术错误转换为用户友好的提示
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // 网络与连接错误
  'Network error': '网络连接失败，请检查网络后重试',
  'Failed to fetch': '无法连接到服务器，请检查网络或代理设置',
  'Network request failed': '网络异常，请确认服务器可连接',
  'timeout': '请求超时，请重试',

  // 业务状态错误
  'Unauthorized': '登录已失效，请重新登录',
  'Forbidden': '当前无权访问，请联系管理员',
  'Not Found': '请求的资源不存在',
  'File not found': '文件未找到',
  'Directory not found': '目录未找到',

  // 文件操作错误
  'File I/O error': '文件操作失败，请检查文件权限',
  'Permission denied': '权限不足，请检查文件权限',
  'No space left': '磁盘空间不足',

  // 数据库错误
  'Database error': '数据库操作失败，请稍后重试',

  // 配置错误
  'TMDB API key not configured': 'TMDB API Key 未配置，请在设置中配置',
  'Configuration error': '配置错误，请检查配置',

  // 通用错误
  'Internal server error': '服务器内部错误，请稍后重试',
  'Unknown error': '发生未知错误，请查看日志',
}

/**
 * 格式化错误消息
 */
export function formatErrorMessage(error: Error | string | unknown): string {
  if (!error) return '未知错误'

  let errorMessage = ''

  // 处理字符串类型的错误
  if (typeof error === 'string') {
    errorMessage = error
  }
  // 处理 Error 对象
  else if (error instanceof Error) {
    errorMessage = error.message || error.name || '未知错误'
  }
  // 处理对象类型的错误
  else if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>
    errorMessage = String(
      err.message || err.error || err.errorMsg || '未知错误'
    )
  }
  // 其他类型转为字符串
  else {
    errorMessage = String(error)
  }

  // 检查错误消息映射表
  for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorMessage.includes(key)) {
      return message
    }
  }

  // 如果是很长的技术性错误，简化显示
  if (errorMessage.length > 100) {
    return '操作失败，请稍后重试'
  }

  return errorMessage || '未知错误'
}

/**
 * 处理错误并显示错误提示
 */
export function handleError(
  error: Error | string | unknown,
  fallbackMessage?: string,
  showToast = true
): string {
  // 如果 error 为 null/undefined，优先使用 fallbackMessage
  let errorMessage: string
  if (error == null && fallbackMessage) {
    errorMessage = fallbackMessage
  } else {
    errorMessage = formatErrorMessage(error) || fallbackMessage || '操作失败'
  }

  if (showToast) {
    showError(errorMessage)
  }

  // 记录错误日志
  console.error('[ErrorHandler]', error)

  return errorMessage
}

/**
 * 处理 API 错误响应
 */
export function handleApiError(
  response: { error?: string; code?: number },
  fallbackMessage = '操作失败'
): string {
  if (response.error) {
    return handleError(response.error, fallbackMessage)
  }
  return ''
}

/**
 * 处理 Promise 错误
 */
export function handlePromiseError(
  error: unknown,
  fallbackMessage: string,
  showToast = true
): string {
  return handleError(error, fallbackMessage, showToast)
}
