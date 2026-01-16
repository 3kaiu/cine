import { useState, useMemo, useEffect } from 'react'
import { Button, Modal, SearchField, Select, ListBox, Chip, Surface } from "@heroui/react";
import { Copy, TrashBin, ArrowRight, File, HardDrive, TriangleExclamation, Video, Picture, ArrowDownToLine } from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import SkeletonCard from '@/components/SkeletonCard'
import ContextMenu from '@/components/ContextMenu'
import StorageChart from '@/components/StorageChart'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import { exportTableData } from '@/utils/export'

export default function FileManager() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [copyModalVisible, setCopyModalVisible] = useState(false)
  const [trashModalVisible, setTrashModalVisible] = useState(false)
  const [targetDir, setTargetDir] = useState('')
  const [page] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all')
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; position: { x: number; y: number }; fileId: string | null }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    fileId: null
  })

  const { data: filesData, refetch, isPending } = useQuery({
    queryKey: ['files', page, searchTerm, fileTypeFilter],
    queryFn: () => {
      const params: any = { page_size: 50, page: page }
      if (searchTerm) params.name = searchTerm
      if (fileTypeFilter !== 'all') params.file_type = fileTypeFilter
      return mediaApi.getFiles(params)
    }
  })

  const filteredFiles = useMemo(() => {
    if (!filesData?.files) return []
    let result = [...filesData.files]

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(f => f.name.toLowerCase().includes(term))
    }

    if (fileTypeFilter !== 'all') {
      result = result.filter(f => f.file_type === fileTypeFilter)
    }

    return result
  }, [filesData, searchTerm, fileTypeFilter])

  const selectedFiles = useMemo(() => {
    return filteredFiles.filter(f => selectedRowKeys.includes(f.id))
  }, [filteredFiles, selectedRowKeys])

  const totalSelectedSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  const stats = useMemo(() => {
    if (!filesData?.files) return { total: 0, totalSize: 0, video: 0, subtitle: 0, image: 0, other: 0 }
    const files = filesData.files
    return {
      total: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      video: files.filter(f => f.file_type === 'video').length,
      subtitle: files.filter(f => f.file_type === 'subtitle').length,
      image: files.filter(f => f.file_type === 'image').length,
      other: files.filter(f => !['video', 'subtitle', 'image'].includes(f.file_type)).length
    }
  }, [filesData])

  // 表格列定义
  const columns = useMemo(() => [
    {
      title: '名称',
      dataIndex: 'name',
      width: 300,
      render: (name: string) => (
        <div className="flex items-center gap-3">
          <div className="p-1 px-1.5 bg-default-100 rounded-lg shrink-0">
            <File className="w-[14px] h-[14px] text-default-400" />
          </div>
          <span className="font-bold text-sm text-foreground/90 line-clamp-1">{name}</span>
        </div>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (size: number) => (
        <span className="font-mono text-[11px] text-default-500 font-medium">{formatSize(size)}</span>
      )
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      width: 100,
      render: (type: string) => (
        <Chip
          size="sm"
          variant="soft"
          color={
            type === 'video' ? 'accent' :
              type === 'subtitle' ? 'success' :
                type === 'image' ? 'warning' :
                  type === 'nfo' ? 'default' : 'default'
          }
          className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight"
        >
          {type === 'video' ? '视频' :
            type === 'subtitle' ? '字幕' :
              type === 'image' ? '图片' :
                type === 'nfo' ? '信息' : type}
        </Chip>
      )
    },
    {
      title: '路径',
      dataIndex: 'path',
      render: (path: string) => (
        <div className="truncate max-w-xs text-[11px] text-default-400 font-mono opacity-60" title={path}>
          {path}
        </div>
      )
    }
  ], [])

  // Mutations
  const moveMutation = useMutation({
    mutationFn: mediaApi.moveFile,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      refetch()
      showSuccess('文件移动成功')
    },
    onError: (error: any) => handleError(error, '移动失败'),
  })

  const copyMutation = useMutation({
    mutationFn: mediaApi.copyFile,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      refetch()
      showSuccess('文件复制成功')
    },
    onError: (error: any) => handleError(error, '复制失败'),
  })

  const batchMoveMutation = useMutation({
    mutationFn: mediaApi.batchMoveFiles,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
      showSuccess(`成功移动 ${selectedRowKeys.length} 个文件`)
    },
    onError: (error: any) => handleError(error, '批量移动失败'),
  })

  const batchCopyMutation = useMutation({
    mutationFn: mediaApi.batchCopyFiles,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
      showSuccess(`成功复制 ${selectedRowKeys.length} 个文件`)
    },
    onError: (error: any) => handleError(error, '批量复制失败'),
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

    if (failed === 0) {
      showSuccess(`成功将 ${success} 个文件移入回收站`)
    } else {
      showSuccess(`成功移入 ${success} 个文件，${failed} 个失败`, '部分文件移动失败，请检查文件权限')
    }
  }

  const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredFiles.map(f => ({
      文件名: f.name,
      大小: f.size,
      类型: f.file_type,
      路径: f.path,
      创建时间: f.created_at,
      修改时间: f.updated_at
    }))
    exportTableData(dataToExport, format, `文件列表-${new Date().toISOString().slice(0, 10)}`)
    showSuccess(`已导出 ${filteredFiles.length} 个文件`)
  }

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A: 全选
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (filteredFiles.length > 0) {
          setSelectedRowKeys(filteredFiles.map(f => f.id))
        }
      }
      // Cmd/Ctrl + M: 打开移动对话框
      else if ((e.metaKey || e.ctrlKey) && e.key === 'm' && selectedRowKeys.length > 0) {
        e.preventDefault()
        setMoveModalVisible(true)
      }
      // Cmd/Ctrl + C: 打开复制对话框
      else if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedRowKeys.length > 0) {
        e.preventDefault()
        setCopyModalVisible(true)
      }
      // Delete/Backspace: 移入回收站
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRowKeys.length > 0) {
        e.preventDefault()
        setTrashModalVisible(true)
      }
      // Escape: 清除选择
      else if (e.key === 'Escape') {
        setSelectedRowKeys([])
        setMoveModalVisible(false)
        setCopyModalVisible(false)
        setTrashModalVisible(false)
      }
      // Cmd/Ctrl + F: 聚焦搜索框
      else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder="搜索文件名..."]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredFiles, selectedRowKeys])

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="文件管理器"
        description="浏览并管理您的媒体库文件"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onPress={() => setMoveModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              variant="primary"
              size="md"
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <ArrowRight className="w-4 h-4" />
              移动
            </Button>
            <Button
              onPress={() => setCopyModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              variant="secondary"
              size="md"
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <Copy className="w-4 h-4" />
              复制
            </Button>
            <Button
              onPress={() => setTrashModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              variant="danger"
              size="md"
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <TrashBin className="w-4 h-4" />
              删除
            </Button>
            <div className="w-px h-4 bg-divider/20 mx-1" />
            <Button
              onPress={() => handleExport('csv')}
              isDisabled={filteredFiles.length === 0}
              variant="ghost"
              size="md"
              className="font-bold flex items-center gap-2 px-4"
            >
              <ArrowDownToLine className="w-4 h-4" />
              导出
            </Button>
          </div>
        }
      />

      {/* 统计卡片 */}
      {isPending ? (
        <SkeletonCard count={4} />
      ) : filesData && filesData.files.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="文件总数"
              value={stats.total}
              icon={<File className="w-6 h-6" />}
              color="primary"
              description="库中所有文件数量"
            />
            <StatCard
              label="总大小"
              value={formatSize(stats.totalSize)}
              icon={<HardDrive className="w-6 h-6" />}
              color="warning"
              description="总占用存储空间"
            />
            <StatCard
              label="视频文件"
              value={stats.video}
              icon={<Video className="w-6 h-6" />}
              color="accent"
              description="视频文件数量"
            />
            <StatCard
              label="图片/字幕"
              value={stats.subtitle + stats.image}
              icon={<Picture className="w-6 h-6" />}
              color="success"
              description="图片和字幕文件"
            />
          </div>
          <StorageChart
            total={stats.totalSize * 1.5}
            used={stats.totalSize}
            breakdown={[
              { label: '视频', value: filesData.files.filter(f => f.file_type === 'video').reduce((sum, f) => sum + f.size, 0), color: '#8b5cf6', icon: <Video className="w-4 h-4" /> },
              { label: '字幕', value: filesData.files.filter(f => f.file_type === 'subtitle').reduce((sum, f) => sum + f.size, 0), color: '#10b981', icon: <File className="w-4 h-4" /> },
              { label: '图片', value: filesData.files.filter(f => f.file_type === 'image').reduce((sum, f) => sum + f.size, 0), color: '#f59e0b', icon: <Picture className="w-4 h-4" /> },
              { label: '其他', value: filesData.files.filter(f => !['video', 'subtitle', 'image'].includes(f.file_type)).reduce((sum, f) => sum + f.size, 0), color: '#6b7280', icon: <File className="w-4 h-4" /> },
            ]}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-t border-divider/10 pt-4">
        <Surface variant="default" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-divider/50 shadow-sm">
          <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
            <SearchField
              className="w-full sm:w-[320px]"
              value={searchTerm}
              onChange={setSearchTerm}
            >
              <SearchField.Group className="bg-default-100/50 border border-divider/20 focus-within:border-primary/50 transition-colors h-9">
                <SearchField.SearchIcon className="text-default-400" />
                <SearchField.Input placeholder="搜索文件名..." className="text-sm" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            <div className="flex items-center gap-2 bg-default-100/50 px-2 py-1 rounded-md border border-divider/20">
              <span className="text-[11px] font-bold text-default-500 uppercase tracking-wider">类型</span>
              <Select
                selectedKey={fileTypeFilter}
                onSelectionChange={(keys) => {
                  if (!keys) return
                  const selected = Array.from(keys as any)[0] as string
                  if (selected) {
                    setFileTypeFilter(selected)
                  }
                }}
                className="w-[120px]"
              >
                <Select.Trigger className="h-7 min-h-0 bg-transparent border-none shadow-none text-xs font-bold">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox className="text-xs">
                    <ListBox.Item key="all">全部文件</ListBox.Item>
                    <ListBox.Item key="video">视频文件</ListBox.Item>
                    <ListBox.Item key="subtitle">字幕文件</ListBox.Item>
                    <ListBox.Item key="image">图片文件</ListBox.Item>
                    <ListBox.Item key="nfo">信息文件</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
        </Surface>

        <Surface variant="secondary" className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5">
          {filteredFiles.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <div className="p-4 bg-default-100 rounded-full">
                <File className="w-8 h-8 text-default-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">未找到文件</p>
                <p className="text-xs text-default-400">请尝试更改搜索词或筛选条件</p>
              </div>
            </div>
          ) : (
            <VirtualizedTable<MediaFile>
              dataSource={filteredFiles}
              columns={columns}
              height={500}
              loading={isPending}
              selectionMode="multiple"
              selectedKeys={new Set(selectedRowKeys)}
              onSelectionChange={(keys) => {
                if (keys === 'all') {
                  setSelectedRowKeys(filteredFiles.map(f => f.id))
                } else {
                  setSelectedRowKeys(Array.from(keys as Set<string>))
                }
              }}
            />
          )}
        </Surface>
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

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        onClose={() => setContextMenu({ ...contextMenu, isOpen: false, fileId: null })}
        position={contextMenu.position}
        items={[
          {
            label: '选择',
            icon: <File className="w-4 h-4" />,
            action: () => {
              if (contextMenu.fileId && !selectedRowKeys.includes(contextMenu.fileId)) {
                setSelectedRowKeys([...selectedRowKeys, contextMenu.fileId])
              }
            }
          },
          {
            label: '移动',
            icon: <ArrowRight className="w-4 h-4" />,
            action: () => {
              if (contextMenu.fileId && !selectedRowKeys.includes(contextMenu.fileId)) {
                setSelectedRowKeys([...selectedRowKeys, contextMenu.fileId])
              }
              setMoveModalVisible(true)
            }
          },
          {
            label: '复制',
            icon: <Copy className="w-4 h-4" />,
            action: () => {
              if (contextMenu.fileId && !selectedRowKeys.includes(contextMenu.fileId)) {
                setSelectedRowKeys([...selectedRowKeys, contextMenu.fileId])
              }
              setCopyModalVisible(true)
            }
          },
          {
            label: '移入回收站',
            icon: <TrashBin className="w-4 h-4" />,
            variant: 'danger',
            action: () => {
              if (contextMenu.fileId && !selectedRowKeys.includes(contextMenu.fileId)) {
                setSelectedRowKeys([...selectedRowKeys, contextMenu.fileId])
              }
              setTrashModalVisible(true)
            }
          }
        ]}
      />
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
