import type { TaskInfo } from '@/api/tasks'

export type ParsedCandidate = {
  provider: string
  external_id: string
  media_type: string
  title: string
  score: number
}

export function buildTaskSummary(task: TaskInfo): string | null {
  const parsed = parseTaskResult(task)

  if (parsed.type === 'identify_preview') {
    const total = parsed.results.length
    const review = parsed.results.filter((item) => item.needs_review).length
    const recommended = parsed.results.filter((item) => item.recommended).length
    const candidates = parsed.results.reduce((sum, item) => sum + item.candidates.length, 0)
    return `识别预览 ${total} 个文件 / 推荐 ${recommended} / 待确认 ${review} / 候选 ${candidates}`
  }

  if (parsed.type === 'identify_apply') {
    return `批量应用 ${parsed.applied.length} 个识别结果`
  }

  return parsed.type === 'raw' ? parsed.text : null
}

export function parseTaskResult(task: TaskInfo):
  | { type: 'identify_preview'; results: Array<{ file_id: string; file_name: string; parse: { title: string; year?: number; parser_provider: string; confidence: number }; recommended?: ParsedCandidate; needs_review: boolean; candidates: ParsedCandidate[] }> }
  | { type: 'identify_apply'; applied: Array<{ file_id: string; metadata: Record<string, unknown> }> }
  | { type: 'raw'; text: string }
  | { type: 'empty' } {
  if (task.status.status !== 'completed' || !task.result) {
    return { type: 'empty' }
  }

  try {
    const parsed = JSON.parse(task.result) as {
      results?: Array<{
        file_id: string
        file_name: string
        parse: { title: string; year?: number; parser_provider: string; confidence: number }
        recommended?: ParsedCandidate
        needs_review: boolean
        candidates?: ParsedCandidate[]
      }>
      applied?: Array<{ file_id: string; metadata: Record<string, unknown> }>
    }

    if (Array.isArray(parsed.results)) {
      return {
        type: 'identify_preview',
        results: parsed.results.map((item) => ({
          ...item,
          candidates: item.candidates || [],
        })),
      }
    }

    if (Array.isArray(parsed.applied)) {
      return { type: 'identify_apply', applied: parsed.applied }
    }
  } catch {
    return { type: 'raw', text: task.result }
  }

  return { type: 'raw', text: task.result }
}

export function candidateKey(candidate: ParsedCandidate): string {
  return `${candidate.provider}:${candidate.external_id}:${candidate.media_type}`
}
