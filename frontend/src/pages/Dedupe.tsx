import { Button, Accordion } from "@heroui/react";
import { TrashBin, ArrowRotateLeft, CircleExclamation, Filmstrip, CircleInfo, Check } from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import clsx from "clsx";
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export default function Dedupe() {
  const { data, refetch, isPending } = useQuery({
    queryKey: ['duplicate-movies'],
    queryFn: async () => {
      const res = await mediaApi.findDuplicateMovies()
      return res
    },
    enabled: false,
  })

  const trashMutation = useMutation({
    mutationFn: (id: string) => mediaApi.moveToTrash(id),
    onSuccess: () => {
      refetch()
    },
  })

  // Calculate stats
  const totalDuplicates = data ? data.reduce((acc: number, group: any) => acc + group.files.length - 1, 0) : 0;
  const duplicateGroups = data ? data.length : 0;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-5 pt-2 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-warning/5 rounded-lg text-warning/80 shadow-sm border border-warning/10">
            <CircleExclamation className="w-[16px] h-[16px]" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-[16px] font-black tracking-tight text-foreground/90 uppercase">重复管理</h2>
            <p className="text-[11px] text-default-400 font-medium">智能分析并清理影片的冗余副本。</p>
          </div>
        </div>

        <div className="flex flex-col gap-5 ml-9">
          <div className="flex items-center gap-4">
            <Button
              variant="primary"
              size="md"
              onPress={() => refetch()}
              isPending={isPending}
              className="font-bold shadow-md px-6 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {!isPending && <ArrowRotateLeft className="w-[15px] h-[15px]" />}
              扫描重复文件
            </Button>
            {data && (
              <div className="flex gap-2.5">
                <div className="flex items-center gap-2 px-3 h-8 bg-warning/5 border border-warning/10 rounded-lg">
                  <span className="text-[10px] font-black text-warning/80 uppercase tracking-tighter">找到 {duplicateGroups} 组重复</span>
                </div>
                <div className="flex items-center gap-2 px-3 h-8 bg-danger/5 border border-danger/10 rounded-lg">
                  <span className="text-[10px] font-black text-danger/80 uppercase tracking-tighter">{totalDuplicates} 个冗余文件</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-start gap-3 text-default-500 bg-default-50/50 border border-divider/10 p-4 rounded-xl text-[11px] leading-relaxed max-w-2xl shadow-sm">
            <CircleInfo className="mt-0.5 flex-shrink-0 text-primary/70 w-[14px] h-[14px]" />
            <p className="font-medium">系统通过分析分辨率、码率、HDR 元数据和字幕对每个版本进行评分。建议保留分数最高的版本，清理其余质量较低的冗余副本。</p>
          </div>
        </div>
      </div>

      {data && (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 border-t border-divider/5 pt-6">
          <h3 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em] px-1">重复组列表</h3>
          <Accordion
            variant="surface"
            allowsMultipleExpanded
            defaultExpandedKeys={new Set(data.map((g: any) => String(g.tmdb_id)))}
            className="px-0 gap-4"
          >
            {data.map((group: any) => (
              <Accordion.Item key={String(group.tmdb_id)} id={String(group.tmdb_id)} className="border border-divider/5 rounded-2xl overflow-hidden bg-default-50/10">
                <Accordion.Heading>
                  <Accordion.Trigger className="px-5 py-4 hover:bg-default-100/40 transition-colors w-full text-left">
                    <div className="flex items-center gap-3">
                      <div className="p-1 px-1.5 bg-default-100/80 rounded-lg border border-divider/20 text-default-500 shadow-sm">
                        <Filmstrip className="w-[14px] h-[14px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black text-[14px] tracking-tight">{group.title}</span>
                        <span className="text-[9px] text-default-400 font-mono tracking-widest uppercase opacity-60">ID: {group.tmdb_id}</span>
                      </div>
                      <div className="ml-auto flex items-center gap-2 pr-4">
                        <span className="text-[11px] font-black text-primary">{group.files.length}</span>
                        <span className="text-[10px] text-default-400 font-bold tracking-tight uppercase">Versions</span>
                      </div>
                    </div>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="px-5 pb-5 pt-2 flex flex-col gap-3">
                    {group.files.map((file: MediaFile, index: number) => {
                      const isBest = index === 0 && group.files.length > 1;
                      const vInfo = file.video_info;

                      return (
                        <div
                          key={file.id}
                          className={clsx(
                            "flex flex-col md:flex-row gap-4 p-4 rounded-xl border transition-all duration-300",
                            isBest
                              ? "bg-success/5 border-success/10 shadow-sm"
                              : "bg-default-100/30 border-divider/5 hover:border-divider/20"
                          )}
                        >
                          <div className="flex-1 flex flex-col gap-2 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[13px] tracking-tight truncate flex-1 min-w-0 text-foreground/80">{file.name}</span>
                              {isBest && (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-success/10 rounded-lg border border-success/20">
                                  <Check className="w-[10px] h-[10px]" />
                                  <span className="text-[9px] font-black uppercase text-success tracking-tighter">Best Quality</span>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-[10px] font-mono text-default-400/80 font-bold">{formatSize(file.size)}</span>
                              <span className="w-1 h-1 rounded-full bg-default-300" />
                              {vInfo && (
                                <>
                                  <span className="text-[10px] font-black text-default-500 uppercase">{vInfo.codec}</span>
                                  <span className="w-1 h-1 rounded-full bg-default-300" />
                                  <span className="text-[10px] font-black text-default-500">{vInfo.width}x{vInfo.height}</span>
                                  {vInfo.has_chinese_subtitle && <span className="text-[9px] font-black text-primary/70 border border-primary/10 bg-primary/5 px-1 rounded">SUB</span>}
                                  {vInfo.is_dolby_vision && <span className="text-[9px] font-black text-secondary/70 border border-secondary/10 bg-secondary/5 px-1 rounded">DV</span>}
                                  {(vInfo.is_hdr || vInfo.is_hdr10_plus) && !vInfo.is_dolby_vision && <span className="text-[9px] font-black text-warning/70 border border-warning/10 bg-warning/5 px-1 rounded">HDR</span>}
                                </>
                              )}
                              <span className="truncate max-w-[200px] text-[10px] text-default-400/50 font-mono italic ml-auto" title={file.path}>{file.path}</span>
                            </div>
                          </div>

                          <div className="flex flex-row md:flex-col items-center justify-between gap-4 md:gap-3 w-full md:w-48 shrink-0">
                            {file.quality_score !== undefined && (
                              <div className="flex flex-col w-full gap-1.5">
                                <div className="flex justify-between items-center text-[9px] font-black">
                                  <span className="text-default-400/60 uppercase tracking-widest">Quality Score</span>
                                  <span className={isBest ? "text-success" : "text-warning"}>{file.quality_score}</span>
                                </div>
                                <div className="h-1.5 w-full bg-default-200/50 rounded-full overflow-hidden">
                                  <div
                                    className={clsx("h-full transition-all duration-1000 rounded-full", isBest ? "bg-success" : "bg-warning")}
                                    style={{ width: `${file.quality_score}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              isPending={trashMutation.isPending}
                              isDisabled={isBest}
                              className={clsx(
                                "w-full font-bold transition-all flex items-center justify-center gap-2",
                                !isBest ? "bg-danger/5 hover:bg-danger/10 border border-danger/10 text-danger" : "opacity-0 pointer-events-none"
                              )}
                              onPress={() => trashMutation.mutate(file.id)}
                            >
                              <TrashBin className="w-[13px] h-[13px]" />
                              {isBest ? "保留此份" : "移入回收站"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
