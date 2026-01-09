import { Card, CardHeader, CardBody, Button, Chip, Progress, Divider, Accordion, AccordionItem } from "@heroui/react";
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, Film, Info } from 'react-feather'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import clsx from "clsx";

export default function Dedupe() {
  const { data, refetch, isPending } = useQuery({
    queryKey: ['duplicate-movies'],
    queryFn: async () => {
      const res = await mediaApi.findDuplicateMovies()
      return res
    },
    enabled: false,
  })

  // Move to trash
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex gap-3">
          <div className="p-2 bg-warning/10 rounded-lg text-warning">
            <AlertTriangle size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-md font-bold">Duplicate Manager</p>
            <p className="text-small text-default-500">Intelligently identify and clean up redundant movie copies.</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex items-center gap-4">
            <Button
              color="primary"
              onPress={() => refetch()}
              isLoading={isPending}
              startContent={!isPending && <RefreshCw size={18} />}
            >
              Scan for Duplicates
            </Button>
            {data && (
              <div className="flex gap-2">
                <Chip variant="flat" color="warning">Found {duplicateGroups} Groups</Chip>
                <Chip variant="flat" color="danger">{totalDuplicates} Redundant Files</Chip>
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 text-default-400 bg-default-100 p-3 rounded-lg text-sm">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <p>The system analyzes resolution, bitrate, HDR metadata, and subtitles to score each version. Higher scores indicate better quality.</p>
          </div>
        </CardBody>
      </Card>

      {data && (
        <div className="flex flex-col gap-4">
          <Accordion variant="splitted" selectionMode="multiple" defaultExpandedKeys="all">
            {data.map((group: any) => (
              <AccordionItem
                key={group.tmdb_id}
                aria-label={group.title}
                title={
                  <div className="flex items-center gap-2">
                    <Film size={18} className="text-default-500" />
                    <span className="font-semibold">{group.title}</span>
                    <span className="text-xs text-default-400 font-mono">(ID: {group.tmdb_id})</span>
                  </div>
                }
                subtitle={
                  <span className="text-xs text-default-400">{group.files.length} versions found</span>
                }
              >
                <div className="flex flex-col gap-3 pb-2">
                  {group.files.map((file: MediaFile, index: number) => {
                    const isBest = index === 0 && group.files.length > 1;
                    const vInfo = file.video_info;

                    return (
                      <div key={file.id} className={clsx(
                        "flex flex-col md:flex-row gap-4 p-4 rounded-lg border transition-colors",
                        isBest ? "bg-success/5 border-success/20" : "bg-default-50 border-default-200"
                      )}>
                        <div className="flex-1 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm break-all">{file.name}</span>
                            {isBest && <Chip size="sm" color="success" startContent={<CheckCircle size={12} />} variant="flat">Best Quality</Chip>}
                            {!isBest && <Chip size="sm" color="warning" variant="flat">Redundant</Chip>}
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs text-default-500">
                            <span className="font-mono bg-default-200 px-1.5 py-0.5 rounded">{formatSize(file.size)}</span>
                            {vInfo && (
                              <>
                                <span className="bg-default-200 px-1.5 py-0.5 rounded">{vInfo.width}x{vInfo.height}</span>
                                <span className="bg-default-200 px-1.5 py-0.5 rounded">{vInfo.codec}</span>
                                {vInfo.has_chinese_subtitle && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">CN Subs</span>}
                                {vInfo.is_dolby_vision && <span className="bg-secondary/10 text-secondary px-1.5 py-0.5 rounded">Dolby Vision</span>}
                                {(vInfo.is_hdr || vInfo.is_hdr10_plus) && !vInfo.is_dolby_vision && <span className="bg-warning/10 text-warning px-1.5 py-0.5 rounded">HDR</span>}
                              </>
                            )}
                            <span className="truncate max-w-[300px] text-default-400">{file.path}</span>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col items-center justify-between gap-4 md:gap-2 md:w-48">
                          {file.quality_score !== undefined && (
                            <div className="flex flex-col w-full gap-1">
                              <div className="flex justify-between text-xs text-default-500">
                                <span>Score</span>
                                <span>{file.quality_score}</span>
                              </div>
                              <Progress
                                size="sm"
                                value={file.quality_score}
                                color={isBest ? "success" : "warning"}
                                className="max-w-md"
                              />
                            </div>
                          )}

                          <Button
                            color="danger"
                            variant={isBest ? "flat" : "solid"}
                            size="sm"
                            startContent={<Trash2 size={16} />}
                            onPress={() => trashMutation.mutate(file.id)}
                            isLoading={trashMutation.isPending}
                            isDisabled={isBest}
                            className="w-full md:w-auto"
                          >
                            {isBest ? "Keep" : "Trash"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </AccordionItem>
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
