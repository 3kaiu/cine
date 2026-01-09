import { useState } from 'react'
import { ModalRoot, ModalHeader, ModalBody, ModalFooter, ModalContainer, ModalDialog, ModalBackdrop, Button, Tabs, Chip } from "@heroui/react";
import { ArrowDownToLine, Text, ArrowsRotateRight } from '@gravity-ui/icons'
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
    <ModalRoot isOpen={visible} onOpenChange={(open) => !open && onClose()}>
      <ModalBackdrop variant="blur" />
      <ModalContainer size="lg" scroll="inside">
        <ModalDialog className="max-h-[85vh]">
          <ModalHeader className="flex flex-col gap-1 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/5 rounded-lg text-primary border border-primary/10">
                <Text className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-[16px] font-black tracking-tight text-foreground">字幕中心</h2>
            </div>
            <p className="text-[11px] text-default-400 font-medium ml-10">管理本地字幕与在线搜索。支持多种语言与格式。</p>
          </ModalHeader>
          <ModalBody className="py-5 overflow-y-auto min-h-[400px]">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(key) => setActiveTab(key as string)}
              className="flex-1 flex flex-col"
            >
              <Tabs.ListContainer className="border-b border-divider/5">
                <Tabs.List aria-label="Subtitle Options" className="gap-8">
                  <Tabs.Tab id="local" className="text-[13px] font-bold py-3 px-1 data-[selected=true]:text-primary transition-colors relative">
                    本地字幕
                    <Tabs.Indicator className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  </Tabs.Tab>
                  <Tabs.Tab id="remote" className="text-[13px] font-bold py-3 px-1 data-[selected=true]:text-primary transition-colors relative">
                    在线搜索
                    <Tabs.Indicator className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <div className="flex-1 mt-6 overflow-y-auto scrollbar-hide min-h-[400px]">
                <Tabs.Panel id="local">
                  <div className="rounded-2xl border border-divider/10 overflow-hidden bg-default-50/20 shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-default-100/30 text-default-400 font-black uppercase text-[9px] tracking-[0.15em] h-10 border-b border-divider/5">
                          <th className="px-5">文件名</th>
                          <th className="px-5">语言</th>
                          <th className="px-5">格式</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider/5">
                        {(localData?.subtitles || []).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-20 text-center text-[12px] font-medium text-default-400 bg-background/50">
                              未发现本地字幕文件
                            </td>
                          </tr>
                        ) : (
                          (localData?.subtitles || []).map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-default-100/40 transition-colors group">
                              <td className="px-5 py-4 text-[12px] font-bold text-foreground/80 group-hover:text-foreground transition-colors max-w-[240px] truncate">{item.path.split('/').pop()}</td>
                              <td className="px-5 py-4 text-[11px] font-medium text-default-500">{item.language || '未知'}</td>
                              <td className="px-5 py-4">
                                <Chip size="sm" variant="soft" className="h-5 text-[9px] font-black rounded-lg px-2">
                                  {item.format?.toUpperCase()}
                                </Chip>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Tabs.Panel>

                <Tabs.Panel id="remote">
                  <div className="flex flex-col gap-5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-default-400/70 uppercase tracking-widest">搜索结果</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="font-bold border border-divider/10 bg-default-50/50 hover:bg-default-100 gap-1.5 px-3"
                        onPress={() => searchRemote()}
                      >
                        <ArrowsRotateRight className="w-[12px] h-[12px] text-default-400" />
                        刷新搜索
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-divider/10 overflow-hidden bg-default-50/20 shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-default-100/30 text-default-400 font-black uppercase text-[9px] tracking-[0.15em] h-10 border-b border-divider/5">
                            <th className="px-5">文件名称</th>
                            <th className="px-5">语言</th>
                            <th className="px-5">评分</th>
                            <th className="px-5 text-right w-20">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/5">
                          {(remoteData || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-20 text-center text-[12px] font-medium text-default-400 bg-background/50">
                                未找到在线字幕。请尝试刷新。
                              </td>
                            </tr>
                          ) : (
                            (remoteData || []).map((item: any, idx: number) => (
                              <tr key={idx} className="hover:bg-default-100/40 transition-colors group">
                                <td className="px-5 py-4 text-[12px] font-bold text-foreground/80 group-hover:text-foreground transition-colors max-w-[200px] truncate" title={item.filename}>
                                  {item.filename}
                                </td>
                                <td className="px-5 py-4 text-[11px] font-medium text-default-500">{item.language}</td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-12 h-1 bg-default-100 rounded-full overflow-hidden">
                                      <div className={clsx("h-full rounded-full", item.score > 90 ? "bg-success" : "bg-warning")} style={{ width: `${item.score}%` }} />
                                    </div>
                                    <span className={clsx("text-[10px] font-black", item.score > 90 ? "text-success" : "text-warning")}>
                                      {item.score}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <Button size="sm" variant="primary" isIconOnly className="shadow-sm">
                                    <ArrowDownToLine className="w-[14px] h-[14px]" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Tabs.Panel>
              </div>
            </Tabs>
          </ModalBody>
          <ModalFooter className="border-t border-divider/5 px-6 py-4 flex justify-end gap-3">
            <Button variant="ghost" size="md" className="font-bold px-6 border border-divider/10" onPress={onClose}>
              取消
            </Button>
            <Button variant="primary" size="md" className="font-bold px-8 shadow-md shadow-primary/10" onPress={onClose}>
              完成
            </Button>
          </ModalFooter>
        </ModalDialog>
      </ModalContainer>
    </ModalRoot>
  )
}
