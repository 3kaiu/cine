import { toast } from 'sonner'

/**
 * Toast 通知工具函数
 * 统一管理应用中的所有通知提示
 */

/**
 * 显示成功提示
 */
export function showSuccess(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 3000,
  })
}

/**
 * 显示错误提示
 */
export function showError(message: string, description?: string) {
  toast.error(message, {
    description,
    duration: 5000,
  })
}

/**
 * 显示警告提示
 */
export function showWarning(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 4000,
  })
}

/**
 * 显示信息提示
 */
export function showInfo(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 3000,
  })
}

/**
 * 显示加载提示
 */
export function showLoading(message: string) {
  return toast.loading(message)
}

/**
 * 解除加载提示并显示结果
 */
export function dismissLoading(
  toastId: string | number,
  message: string,
  type: 'success' | 'error' = 'success',
  description?: string
) {
  toast.dismiss(toastId)
  if (type === 'success') {
    showSuccess(message, description)
  } else {
    showError(message, description)
  }
}

/**
 * 批量操作进度提示
 */
export function showBatchProgress(
  current: number,
  total: number,
  message: string = '处理中...'
) {
  const percentage = Math.round((current / total) * 100)
  return toast.loading(`${message} ${current}/${total} (${percentage}%)`, {
    duration: Infinity,
  })
}

/**
 * 更新批量操作进度
 */
export function updateBatchProgress(
  toastId: string | number,
  current: number,
  total: number,
  message: string = '处理中...'
) {
  const percentage = Math.round((current / total) * 100)
  toast.loading(`${message} ${current}/${total} (${percentage}%)`, {
    id: toastId,
    duration: Infinity,
  })
}
