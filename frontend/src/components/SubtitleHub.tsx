import { useState } from 'react'
import { Modal, Button, Tabs, Chip, Surface } from "@heroui/react";
import { Text } from '@gravity-ui/icons'
import { Icon } from '@iconify/react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

interface SubtitleHubProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function SubtitleHub({ fileId, visible, onClose }: SubtitleHubProps) {
  const [activeTab, setActiveTab] = useState<string>('local')

  const { data: localData } = useQuery({
    queryKey: ['subtitles-local', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles`)
      return res.data
    },
    enabled: visible
  })

  const { data: remoteData, refetch: searchRemote } = useQuery({
    queryKey: ['subtitles-remote', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles/search`)
      return res.data
    },
    enabled: visible && activeTab === 'remote'
  })

  return (
    <Modal isOpen={visible} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="max-h-[85vh]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                <Text className="w-5 h-5" />
              </Modal.Icon>
              <Modal.Heading>字幕中心</Modal.Heading>
              <p className="text-sm text-muted">管理本地字幕与在线搜索</p>
            </Modal.Header>
            <Modal.Body className="py-5 overflow-y-auto min-h-[400px]">
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                className="flex-1 flex flex-col"
              >
                <Tabs.ListContainer>
                  <Tabs.List aria-label="Subtitle Options">
                    <Tabs.Tab id="local">本地字幕</Tabs.Tab>
                    <Tabs.Tab id="remote">在线搜索</Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <div className="flex-1 mt-4 overflow-y-auto scrollbar-hide min-h-[400px]">
                  <Tabs.Panel id="local">
                    <Surface variant="secondary" className="rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-divider bg-surface text-xs font-medium text-muted">
                            <th className="px-4 py-3">文件名</th>
                            <th className="px-4 py-3">语言</th>
                            <th className="px-4 py-3">格式</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider">
                          {(localData?.subtitles || []).length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-sm text-muted">
                                未发现本地字幕文件
                              </td>
                            </tr>
                          ) : (
                            (localData?.subtitles || []).map((item: any, idx: number) => (
                              <tr key={idx} className="hover:bg-default-100 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[240px] truncate">{item.path.split('/').pop()}</td>
                                <td className="px-4 py-3 text-sm text-muted">{item.language || '未知'}</td>
                                <td className="px-4 py-3">
                                  <Chip size="sm" variant="soft">
                                    {item.format?.toUpperCase()}
                                  </Chip>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </Surface>
                  </Tabs.Panel>

                  <Tabs.Panel id="remote">
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-muted">搜索结果</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => searchRemote()}
                        >
                          <Icon icon="mdi:refresh" className="w-4 h-4" />
                          刷新
                        </Button>
                      </div>
                      <Surface variant="secondary" className="rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-divider bg-surface text-xs font-medium text-muted">
                              <th className="px-4 py-3">文件名称</th>
                              <th className="px-4 py-3">语言</th>
                              <th className="px-4 py-3">评分</th>
                              <th className="px-4 py-3 text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-divider">
                            {(remoteData || []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-12 text-center text-sm text-muted">
                                  未找到在线字幕
                                </td>
                              </tr>
                            ) : (
                              (remoteData || []).map((item: any, idx: number) => (
                                <tr key={idx} className="hover:bg-default-100 transition-colors">
                                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[200px] truncate" title={item.filename}>
                                    {item.filename}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted">{item.language}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-12 h-1 bg-default-100 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${item.score > 90 ? "bg-success" : "bg-warning"}`}
                                          style={{ width: `${item.score}%` }}
                                        />
                                      </div>
                                      <span className={`text-xs font-medium ${item.score > 90 ? "text-success" : "text-warning"}`}>
                                        {item.score}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button size="sm" variant="primary" isIconOnly>
                                      <Icon icon="mdi:download" className="w-4 h-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </Surface>
                    </div>
                  </Tabs.Panel>
                </div>
              </Tabs>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" slot="close">
                取消
              </Button>
              <Button variant="primary" slot="close">
                完成
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
