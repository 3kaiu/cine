import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../../api/tasks'
import { buildTaskSummary, parseTaskResult } from '../tasksResult'

function createTask(task: Partial<TaskInfo> & Pick<TaskInfo, 'id' | 'status'>): TaskInfo {
  return {
    id: task.id,
    task_type: task.task_type || 'scrape',
    status: task.status,
    created_at: task.created_at || '2026-04-22T00:00:00.000Z',
    updated_at: task.updated_at || '2026-04-22T00:00:00.000Z',
    description: task.description || 'identify task',
    result: task.result ?? null,
    retry_count: task.retry_count ?? 0,
    lease_until: task.lease_until ?? null,
    lease_renewed_at: task.lease_renewed_at ?? null,
  }
}

describe('Tasks helpers', () => {
  it('解析 identify preview 任务结果并生成摘要', () => {
    const task = createTask({
      id: 'preview-task',
      status: { status: 'completed', duration_secs: 1, result: null },
      result: JSON.stringify({
        results: [
          {
            file_id: 'f1',
            file_name: 'Movie A.mkv',
            parse: { title: 'Movie A', parser_provider: 'rules', confidence: 0.92 },
            recommended: {
              provider: 'tmdb',
              external_id: '101',
              media_type: 'movie',
              title: 'Movie A',
              score: 0.95,
            },
            needs_review: false,
            candidates: [
              {
                provider: 'tmdb',
                external_id: '101',
                media_type: 'movie',
                title: 'Movie A',
                score: 0.95,
              },
            ],
          },
          {
            file_id: 'f2',
            file_name: 'Movie B.mkv',
            parse: { title: 'Movie B', parser_provider: 'rules', confidence: 0.61 },
            needs_review: true,
            candidates: [
              {
                provider: 'bangumi',
                external_id: '202',
                media_type: 'tv',
                title: 'Movie B',
                score: 0.67,
              },
              {
                provider: 'tmdb',
                external_id: '303',
                media_type: 'movie',
                title: 'Movie B',
                score: 0.54,
              },
            ],
          },
        ],
      }),
    })

    const parsed = parseTaskResult(task)

    expect(parsed.type).toBe('identify_preview')
    if (parsed.type !== 'identify_preview') {
      throw new Error('unexpected parsed type')
    }
    expect(parsed.results).toHaveLength(2)
    expect(parsed.results[1].candidates).toHaveLength(2)
    expect(buildTaskSummary(task)).toContain('识别预览 2 个文件')
    expect(buildTaskSummary(task)).toContain('待确认 1')
    expect(buildTaskSummary(task)).toContain('候选 3')
  })

  it('解析 identify apply 任务结果并生成摘要', () => {
    const task = createTask({
      id: 'apply-task',
      status: { status: 'completed', duration_secs: 1, result: null },
      result: JSON.stringify({
        applied: [
          {
            file_id: 'f1',
            metadata: {
              title: 'Movie A',
              provider: 'tmdb',
            },
          },
          {
            file_id: 'f2',
            metadata: {
              title: 'Movie B',
              provider: 'bangumi',
            },
          },
        ],
      }),
    })

    const parsed = parseTaskResult(task)

    expect(parsed.type).toBe('identify_apply')
    if (parsed.type !== 'identify_apply') {
      throw new Error('unexpected parsed type')
    }
    expect(parsed.applied).toHaveLength(2)
    expect(buildTaskSummary(task)).toBe('批量应用 2 个识别结果')
  })
})
