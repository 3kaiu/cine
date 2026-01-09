import { useState, useMemo } from 'react'
import { Button, Chip, Modal, Checkbox } from "@heroui/react";
import { Copy, TrashBin, ArrowRight, File, HardDrive, TriangleExclamation } from '@gravity-ui/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

export default function FileManager() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]) // IDs
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [copyModalVisible, setCopyModalVisible] = useState(false)
  const [trashModalVisible, setTrashModalVisible] = useState(false)
  const [targetDir, setTargetDir] = useState('')
  const [page] = useState(1)

  const { data: filesData, refetch, isPending } = useQuery({
    queryKey: ['files', page],
    queryFn: () => mediaApi.getFiles({ page_size: 50, page: page }) // Ensure API supports page
  })

  const selectedFiles = useMemo(() => {
    return (filesData?.files || []).filter(f => selectedRowKeys.includes(f.id))
  }, [filesData, selectedRowKeys])

  const totalSelectedSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  // Mutations
  const moveMutation = useMutation({
    mutationFn: mediaApi.moveFile,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, 'Move failed'),
  })

  const copyMutation = useMutation({
    mutationFn: mediaApi.copyFile,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, 'Copy failed'),
  })

  const batchMoveMutation = useMutation({
    mutationFn: mediaApi.batchMoveFiles,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, 'Batch move failed'),
  })

  const batchCopyMutation = useMutation({
    mutationFn: mediaApi.batchCopyFiles,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, 'Batch copy failed'),
  })

  const handleMove = () => {
    if (!targetDir.trim()) return
    if (selectedRowKeys.length === 1) {
      moveMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchMoveMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleCopy = () => {
    if (!targetDir.trim()) return
    if (selectedRowKeys.length === 1) {
      copyMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchCopyMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleBatchTrash = async () => {
    // Batch trash isn't supported by backend as a single atomic op in the original code, but we can loop or use a batch endpoint if it exists. 
    // Original code looped. We'll loop here too inside the confirm handler.
    // But wait, the original code had a confirm dialog. We'll do that here too.

    let success = 0
    let failed = 0
    for (const id of selectedRowKeys) {
      try {
        await mediaApi.moveToTrash(id)
        success++
      } catch (e) {
        failed++
      }
    }
    setSelectedRowKeys([])
    refetch()
    setTrashModalVisible(false)
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
            <HardDrive className="w-[20px] h-[20px]" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight text-foreground">文件管理器</h2>
            <p className="text-xs text-default-500">浏览并管理您的媒体库文件。</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onPress={() => setMoveModalVisible(true)}
            isDisabled={selectedRowKeys.length === 0}
            variant="primary"
            size="md"
            className="font-bold flex items-center gap-2"
          >
            <ArrowRight className="w-[16px] h-[16px]" />
            移动所选
          </Button>
          <Button
            onPress={() => setCopyModalVisible(true)}
            isDisabled={selectedRowKeys.length === 0}
            variant="secondary"
            size="md"
            className="font-bold flex items-center gap-2"
          >
            <Copy className="w-[16px] h-[16px]" />
            复制所选
          </Button>
          <Button
            onPress={() => setTrashModalVisible(true)}
            isDisabled={selectedRowKeys.length === 0}
            variant="danger"
            size="md"
            className="font-bold flex items-center gap-2"
          >
            <TrashBin className="w-[16px] h-[16px]" />
            移入回收站
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-divider/10 pt-4">
        <div className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5">
          <LoadingWrapper loading={isPending}>
            <div className="w-full overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-default-100/50 text-default-500 font-bold uppercase text-[10px] tracking-widest h-12 border-b border-divider/5">
                    <th className="px-4 w-[50px]">
                      <Checkbox
                        isSelected={filesData?.files?.length ? selectedRowKeys.length === filesData.files.length : false}
                        isIndeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < (filesData?.files?.length || 0)}
                        onChange={(selected: boolean) => {
                          if (selected) {
                            setSelectedRowKeys(filesData?.files.map(f => f.id) || [])
                          } else {
                            setSelectedRowKeys([])
                          }
                        }}
                      />
                    </th>
                    <th className="px-4">名称</th>
                    <th className="px-4 w-[100px]">大小</th>
                    <th className="px-4 w-[100px]">类型</th>
                    <th className="px-4">路径</th>
                  </tr>
                </thead>
                <tbody>
                  {(filesData?.files || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-default-500">未找到文件。</td>
                    </tr>
                  ) : (
                    (filesData?.files || []).map((file) => (
                      <tr key={file.id} className="hover:bg-default-100/40 transition-colors border-b border-divider/5 last:border-0">
                        <td className="px-4 py-4">
                          <Checkbox
                            isSelected={selectedRowKeys.includes(file.id)}
                            onChange={() => {
                              setSelectedRowKeys(prev =>
                                prev.includes(file.id)
                                  ? prev.filter(id => id !== file.id)
                                  : [...prev, file.id]
                              )
                            }}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-1 px-1.5 bg-default-100 rounded-lg">
                              <File className="w-[14px] h-[14px] text-default-400" />
                            </div>
                            <span className="font-bold text-sm text-foreground/90 line-clamp-1">{file.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-[11px] text-default-500 font-medium">{formatSize(file.size)}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Chip size="sm" variant="soft" className="h-5 text-[10px] font-bold px-2">
                            {file.file_type === 'video' ? '视频' :
                              file.file_type === 'subtitle' ? '字幕' :
                                file.file_type === 'image' ? '图片' :
                                  file.file_type === 'nfo' ? '信息' : file.file_type}
                          </Chip>
                        </td>
                        <td className="px-4 py-4">
                          <div className="truncate max-w-xs text-[11px] text-default-400 font-mono opacity-60" title={file.path}>
                            {file.path}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {filesData?.total && (
                <div className="flex w-full justify-center mt-4">
                  {/* Pagination temporarily disabled in v3 Beta
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={page}
                    total={Math.ceil((filesData.total || 0) / (filesData.page_size || 100))}
                    onChange={(page) => setPage(page)}
                  />
                  */}
                </div>
              )}
            </div>
          </LoadingWrapper>
        </div>
      </div>

      {/* Move/Copy Modal */}
      <Modal isOpen={moveModalVisible || copyModalVisible} onOpenChange={(open) => { if (!open) { setMoveModalVisible(false); setCopyModalVisible(false) } }}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header className="flex gap-2 items-center">
                  {moveModalVisible ? <ArrowRight /> : <Copy />}
                  {moveModalVisible ? '移动文件' : '复制文件'}
                </Modal.Header>
                <Modal.Body>
                  <p className="text-sm text-default-500">已选择 {selectedFiles.length} 个文件 ({formatSize(totalSelectedSize)})</p>
                  {/* ScrollShadow temporarily disabled in v3 Beta */}
                  {/* <ScrollShadow className="max-h-32 border border-default-200 rounded-lg p-2"> */}
                  <div className="max-h-32 border border-default-200 rounded-lg p-2 overflow-y-auto">
                    {selectedFiles.map(f => (
                      <div key={f.id} className="text-xs py-1 line-clamp-1">{f.name}</div>
                    ))}
                  </div>
                  {/* </ScrollShadow> */}
                  {/* TextField temporarily disabled in v3 Beta */}
                  {/* <TextField
                    value={targetDir}
                    onChange={setTargetDir}
                  >
                    <Label>目标目录</Label>
                    <Input placeholder="请输入目标的绝对路径" />
                  </TextField> */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-default-700">目标目录</label>
                    <input
                      type="text"
                      value={targetDir}
                      onChange={(e) => setTargetDir(e.target.value)}
                      placeholder="请输入目标的绝对路径"
                      className="px-3 py-2 border border-default-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" size="md" onPress={close}>取消</Button>
                  <Button
                    variant="primary"
                    size="md"
                    onPress={moveModalVisible ? handleMove : handleCopy}
                    isPending={moveMutation.isPending || batchMoveMutation.isPending || copyMutation.isPending || batchCopyMutation.isPending}
                  >
                    {moveModalVisible ? '移动' : '复制'}
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal>

      {/* Trash Modal */}
      <Modal isOpen={trashModalVisible} onOpenChange={(open) => setTrashModalVisible(open)}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header className="flex gap-2 items-center">
                  <TriangleExclamation className="text-warning" />
                  确认移入回收站
                </Modal.Header>
                <Modal.Body>
                  <p>确定要将选中的 {selectedFiles.length} 个文件移入回收站吗？</p>
                  <p className="text-xs text-default-500">总大小：{formatSize(totalSelectedSize)}</p>
                  {/* ScrollShadow temporarily disabled in v3 Beta */}
                  {/* <ScrollShadow className="max-h-32 border border-default-200 rounded-lg p-2"> */}
                  <div className="max-h-32 border border-default-200 rounded-lg p-2 overflow-y-auto">
                    {selectedFiles.map(f => (
                      <div key={f.id} className="text-xs py-1 line-clamp-1">{f.name}</div>
                    ))}
                  </div>
                  {/* </ScrollShadow> */}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" size="md" onPress={close}>取消</Button>
                  <Button variant="danger" size="md" onPress={handleBatchTrash}>移入回收站</Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
