/**
 * 数据导出工具函数
 */

/**
 * 导出数据为 CSV 文件
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
) {
  if (data.length === 0) return

  const headers = columns ? columns.map(c => c.label) : Object.keys(data[0])
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0])

  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      keys.map(key => {
        const value = row[key as string]
        // 处理包含逗号或引号的值
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value ?? ''
      }).join(',')
    )
  ].join('\n')

  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;')
}

/**
 * 导出数据为 JSON 文件
 */
export function exportToJSON<T extends Record<string, any>>(
  data: T[],
  filename: string
) {
  const jsonContent = JSON.stringify(data, null, 2)
  downloadFile(jsonContent, filename, 'application/json;charset=utf-8;')
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 导出表格数据
 */
export function exportTableData<T extends Record<string, any>>(
  data: T[],
  format: 'csv' | 'json' = 'csv',
  filename?: string
) {
  const timestamp = new Date().toISOString().slice(0, 10)
  const defaultFilename = `export-${timestamp}.${format}`

  if (format === 'json') {
    exportToJSON(data, filename || defaultFilename)
  } else {
    exportToCSV(data, filename || defaultFilename)
  }
}
