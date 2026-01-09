import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Divider, Select, SelectItem, Checkbox, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Image, Chip } from "@heroui/react";
import VirtualizedTable from '@/components/VirtualizedTable';
import { Cloud, Edit3, Film, Search, Download } from 'react-feather'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import NfoEditor from '@/components/NfoEditor'

export default function Scraper() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [source, setSource] = useState<string>('tmdb')
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewMetadata, setPreviewMetadata] = useState<any>(null)
  const [editingFileId, setEditingFileId] = useState<string | null>(null)

  const { data: files, refetch } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  // Mutations (Simplified error handling for brevity)
  const scrapeMutation = useMutation({
    mutationFn: mediaApi.scrapeMetadata,
    onSuccess: () => {
      refetch()
    }
  })

  const batchScrapeMutation = useMutation({
    mutationFn: mediaApi.batchScrapeMetadata,
    onSuccess: () => {
      refetch()
    }
  })

  const handleScrape = async (fileId: string, autoMatch: boolean = true) => {
    setSelectedFile(fileId)
    if (!autoMatch) {
      try {
        const result = await mediaApi.scrapeMetadata({
          file_id: fileId,
          source,
          auto_match: false,
          download_images: false,
          generate_nfo: false,
        })
        if (result.metadata && Array.isArray(result.metadata)) {
          setPreviewMetadata(result.metadata)
          setPreviewVisible(true)
          return
        }
      } catch (e) {
        // Silently fail to auto-match
      }
    }

    scrapeMutation.mutate({
      file_id: fileId,
      source,
      auto_match: autoMatch,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleBatchScrape = () => {
    if (selectedFiles.length === 0) return
    batchScrapeMutation.mutate({
      file_ids: selectedFiles,
      source,
      auto_match: true,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleSelectMetadata = () => {
    const file = files?.files.find(f => f.id === selectedFile)
    if (!file) return

    scrapeMutation.mutate({
      file_id: file.id,
      source,
      auto_match: true,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
    setPreviewVisible(false)
  }

  const columns = [
    {
      title: 'Filename',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      render: (text: string) => <span className="font-medium text-foreground">{text}</span>
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => <span className="text-foreground/60 font-mono text-xs">{formatSize(size)}</span>,
    },
    {
      title: 'Metadata Status',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (metadata: any) => {
        if (!metadata) return <Chip size="sm" variant="flat">Unscraped</Chip>
        try {
          const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          return (
            <div className="flex items-center gap-2">
              <Chip size="sm" color="success" variant="flat">{data.title || data.name}</Chip>
              {data.poster_url && <Film size={14} className="text-secondary" />}
              {data.rating && <span className="text-xs text-warning font-bold">⭐ {data.rating}</span>}
            </div>
          )
        } catch {
          return <Chip size="sm" color="success" variant="flat">Scraped</Chip>
        }
      },
    },
    {
      title: 'Actions',
      key: 'action',
      width: 180,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            color="primary"
            variant="light"
            startContent={<Cloud size={14} />}
            onPress={() => handleScrape(record.id, true)}
            isLoading={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
            title="Auto Scrape"
          />
          <Button
            size="sm"
            variant="light"
            startContent={<Search size={14} />}
            onPress={() => handleScrape(record.id, false)}
            isLoading={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
            title="Manual Search"
          />
          <Button
            size="sm"
            variant="light"
            startContent={<Edit3 size={14} />}
            onPress={() => setEditingFileId(record.id)}
            isIconOnly
            title="Edit NFO"
          />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex gap-3">
          <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
            <Cloud size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-md font-bold">Metadata Scraper</p>
            <p className="text-small text-default-500">Fetch info from TMDB/Douban and generate NFOs</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex flex-wrap gap-6 items-end">
            <Select
              label="Source"
              placeholder="Select source"
              defaultSelectedKeys={[source]}
              onSelectionChange={(keys) => setSource(Array.from(keys)[0] as string)}
              className="max-w-xs"
              size="sm"
            >
              <SelectItem key="tmdb">The Movie Database (TMDB)</SelectItem>
              <SelectItem key="douban">Douban (China)</SelectItem>
            </Select>

            <div className="flex gap-4">
              <Checkbox isSelected={downloadImages} onValueChange={setDownloadImages}>
                Download Posters
              </Checkbox>
              <Checkbox isSelected={generateNfo} onValueChange={setGenerateNfo}>
                Generate NFO
              </Checkbox>
            </div>

            {selectedFiles.length > 0 && (
              <div className="ml-auto flex gap-2">
                <Button
                  color="primary"
                  onPress={handleBatchScrape}
                  isLoading={batchScrapeMutation.isPending}
                  startContent={<Download size={18} />}
                >
                  Batch Scrape ({selectedFiles.length})
                </Button>
                <Button onPress={() => setSelectedFiles([])} variant="flat">
                  Clear Selection
                </Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <h3 className="text-lg font-bold">Video Files</h3>
        </CardHeader>
        <Divider />
        <CardBody className="p-0">
          {/* Note: VirtualizedTable needs update for selection if rowSelection used, for now passing simple list */}
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={files?.files || []}
            height={600}
            rowHeight={60}
          />
        </CardBody>
      </Card>

      <Modal
        isOpen={previewVisible}
        onClose={() => setPreviewVisible(false)}
        size="3xl"
        scrollBehavior="inside"
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Select Metadata</ModalHeader>
              <ModalBody>
                <div className="grid grid-cols-1 gap-4">
                  {previewMetadata && Array.isArray(previewMetadata) && previewMetadata.map((item: any, index: number) => (
                    <Card
                      key={index}
                      isPressable
                      onPress={() => handleSelectMetadata()}
                      className="hover:bg-default-100"
                    >
                      <CardBody className="flex flex-row gap-4 p-3">
                        <div className="w-24 h-36 flex-shrink-0 bg-default-200 rounded-lg overflow-hidden">
                          {item.poster_url && <Image src={item.poster_url} className="object-cover w-full h-full" />}
                        </div>
                        <div className="flex flex-col gap-2">
                          <div>
                            <h4 className="text-lg font-bold">{item.title || item.name}</h4>
                            <p className="text-xs text-default-500">{item.original_title}</p>
                          </div>
                          <p className="text-sm text-foreground/80 line-clamp-3">{item.overview}</p>
                          <div className="flex gap-2 mt-auto">
                            {item.year && <Chip size="sm" variant="flat">{item.year}</Chip>}
                            {item.rating && <Chip size="sm" color="warning" variant="flat">★ {item.rating}</Chip>}
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <NfoEditor
        fileId={editingFileId || ''}
        visible={!!editingFileId}
        onClose={() => setEditingFileId(null)}
      />
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
