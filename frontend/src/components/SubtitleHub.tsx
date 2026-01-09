import { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tabs, Tab, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip } from "@heroui/react";
import { Search, Download, Type } from 'react-feather'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import clsx from 'clsx'

interface SubtitleHubProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function SubtitleHub({ fileId, visible, onClose }: SubtitleHubProps) {
  const [activeTab, setActiveTab] = useState<string>('local')

  const { data: localData, isLoading: localLoading } = useQuery({
    queryKey: ['subtitles-local', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles`)
      return res.data
    },
    enabled: visible
  })

  const { data: remoteData, isLoading: remoteLoading, refetch: searchRemote } = useQuery({
    queryKey: ['subtitles-remote', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles/search`)
      return res.data
    },
    enabled: visible && activeTab === 'remote'
  })

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      size="2xl"
      backdrop="blur"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Type size={20} className="text-primary" />
                <span>Subtitle Hub</span>
              </div>
              <p className="text-xs font-normal text-default-500">Manage local and remote subtitles</p>
            </ModalHeader>
            <ModalBody>
              <Tabs
                aria-label="Subtitle Options"
                color="primary"
                variant="underlined"
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
              >
                <Tab key="local" title="Local Subtitles">
                  <Table aria-label="Local Subtitles" removeWrapper>
                    <TableHeader>
                      <TableColumn>FILE</TableColumn>
                      <TableColumn>LANGUAGE</TableColumn>
                      <TableColumn>FORMAT</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="No local subtitles found." isLoading={localLoading}>
                      {(localData?.subtitles || []).map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{item.path.split('/').pop()}</TableCell>
                          <TableCell>{item.language}</TableCell>
                          <TableCell><Chip size="sm" variant="flat">{item.format}</Chip></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Tab>
                <Tab key="remote" title="Online Search">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-end">
                      <Button size="sm" variant="flat" startContent={<Search size={16} />} onPress={() => searchRemote()}>
                        Refresh Search
                      </Button>
                    </div>
                    <Table aria-label="Remote Search Results" removeWrapper>
                      <TableHeader>
                        <TableColumn>FILENAME</TableColumn>
                        <TableColumn>LANGUAGE</TableColumn>
                        <TableColumn>SCORE</TableColumn>
                        <TableColumn>ACTION</TableColumn>
                      </TableHeader>
                      <TableBody emptyContent="No subtitles found online." isLoading={remoteLoading}>
                        {(remoteData || []).map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="max-w-[200px] truncate" title={item.filename}>{item.filename}</TableCell>
                            <TableCell>{item.language}</TableCell>
                            <TableCell>
                              <span className={clsx("text-xs font-bold", item.score > 90 ? "text-success" : "text-warning")}>
                                {item.score}/100
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" color="primary" variant="flat" isIconOnly>
                                <Download size={16} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Tab>
              </Tabs>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
