import { useState } from 'react'
import { Button, Modal, Input, Switch, Tabs, TextField, Label } from "@heroui/react";
import { Plus, TrashBin, Gear, Display, Clock, FloppyDisk } from '@gravity-ui/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import clsx from 'clsx'

interface WatchFolder {
  id: string
  path: string
  auto_scrape: boolean
  auto_rename: boolean
  enabled: boolean
}

export default function Settings() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newFolderData, setNewFolderData] = useState<Partial<WatchFolder>>({
    auto_scrape: true,
    auto_rename: false,
    enabled: true
  })

  // Placeholder for Basic Config Form State
  const [basicConfig, setBasicConfig] = useState({
    tmdb_api_key: '',
    default_dir: ''
  })

  const { data: watchFolders, refetch } = useQuery({
    queryKey: ['watch-folders'],
    queryFn: async () => {
      const res = await axios.get<WatchFolder[]>('/api/watch-folders')
      return res
    }
  })

  const addMutation = useMutation({
    mutationFn: (values: any) => axios.post('/api/watch-folders', values),
    onSuccess: () => {
      setIsModalOpen(false)
      setNewFolderData({ auto_scrape: true, auto_rename: false, enabled: true })
      refetch()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/watch-folders/${id}`),
    onSuccess: () => refetch()
  })
  // Placeholder for Basic Config Mutation
  const configMutation = useMutation({
    mutationFn: async (values: any) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log("Updating config:", values);
      return values;
    },
    onSuccess: () => {
      // toast.success("配置已保存");
    }
  });

  const handleSubmit = () => {
    configMutation.mutate(basicConfig);
  }

  const handleAddFolder = () => {
    addMutation.mutate(newFolderData);
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold tracking-tight text-foreground/90">系统设置</h2>
        <p className="text-[11px] text-default-400 font-medium">管理全局配置、自动化任务及其运行状态</p>
      </div>

      <div className="flex w-full flex-col mt-2">
        <Tabs aria-label="设置选项" className="w-full">
          <Tabs.List>
            <Tabs.Tab key="general">
              <div className="flex items-center space-x-2">
                <Gear className="w-[14px] h-[14px]" />
                <span>常规配置</span>
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="watcher">
              <div className="flex items-center space-x-2">
                <Display className="w-[14px] h-[14px]" />
                <span>自动化监控</span>
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="scheduler">
              <div className="flex items-center space-x-2">
                <Clock className="w-[14px] h-[14px]" />
                <span>计划任务</span>
              </div>
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel id="general">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-foreground/80">基础设置</h3>
                <p className="text-[11px] text-default-400">配置 API 密钥和默认路径。</p>
              </div>
              <div className="flex flex-col gap-4">
                <TextField
                  value={basicConfig.tmdb_api_key}
                  onChange={(v) => setBasicConfig({ ...basicConfig, tmdb_api_key: v })}
                >
                  <Label>TMDB API 密钥</Label>
                  <Input
                    type="password"
                    placeholder="请输入您的 API Key"
                  />
                </TextField>
                <TextField
                  value={basicConfig.default_dir}
                  onChange={(v) => setBasicConfig({ ...basicConfig, default_dir: v })}
                >
                  <Label>默认扫描目录</Label>
                  <Input placeholder="例如: /path/to/media" />
                </TextField>
                <Button
                  variant="primary"
                  isDisabled={configMutation.isPending}
                  onPress={handleSubmit}
                  isPending={configMutation.isPending}
                  size="md"
                  className="w-fit font-bold shadow-sm flex gap-2"
                >
                  {!configMutation.isPending && <FloppyDisk className="w-[14px] h-[14px]" />}
                  保存配置
                </Button>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="watcher">
            <div className="flex flex-col gap-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex justify-between items-end">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-bold text-foreground/80">实时目录监控</h3>
                  <p className="text-[11px] text-default-400">当检测到文件变化时，自动触发分析任务。</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => setIsModalOpen(true)}
                  className="font-bold shadow-sm flex gap-2"
                >
                  <Plus className="w-[14px] h-[14px]" />
                  添加监控目录
                </Button>
              </div>

              <div className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5 mt-1">
                <div className="w-full overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-default-50/50 text-default-400 font-bold uppercase text-[9px] tracking-[.15em] h-10 border-b border-divider/5">
                        <th className="px-2 font-normal">路径</th>
                        <th className="px-2 font-normal w-[120px]">自动刮削</th>
                        <th className="px-2 font-normal w-[100px]">状态</th>
                        <th className="px-2 font-normal w-[80px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(watchFolders || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-[11px] text-default-400">暂无已配置的监控目录。</td>
                        </tr>
                      ) : (
                        (watchFolders || []).map((folder: WatchFolder) => (
                          <tr key={folder.id} className="hover:bg-default-100/40 transition-colors border-b border-divider/5 last:border-0">
                            <td className="py-3 px-2">
                              <span className="font-mono text-[13px] font-medium text-foreground/80">{folder.path}</span>
                            </td>
                            <td className="py-3 px-2">
                              <div className={clsx("flex items-center gap-2 px-2 h-5 w-fit rounded border text-[9px] font-black uppercase tracking-tighter",
                                folder.auto_scrape ? "bg-success/5 border-success/10 text-success" : "bg-default-100/50 border-divider/10 text-default-400")}>
                                {folder.auto_scrape ? "ENABLED" : "DISABLED"}
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-1.5">
                                <div className={clsx("w-1.5 h-1.5 rounded-full", folder.enabled ? "bg-success shadow-[0_0_8px_rgba(var(--heroui-success),0.5)]" : "bg-danger")} />
                                <span className="text-[11px] font-bold text-default-500">{folder.enabled ? "Running" : "Stopped"}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <Button
                                isIconOnly
                                variant="danger"
                                size="sm"
                                onPress={() => deleteMutation.mutate(folder.id)}
                              >
                                <TrashBin className="w-[13px] h-[13px]" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="scheduler">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-foreground/80">任务调度器</h3>
                <p className="text-[11px] text-default-400">管理后台定时执行的维护任务。</p>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center p-5 rounded-2xl bg-default-50/20 border border-divider/10 transition-all hover:bg-default-100/30">
                  <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-foreground/90">每日库清理</span>
                    <span className="text-[11px] text-default-400 font-medium">每天凌晨 3:00 自动清理无效记录和空文件夹。</span>
                  </div>
                  <Switch defaultSelected size="sm" />
                </div>
                <div className="flex justify-between items-center p-5 rounded-2xl bg-default-50/20 border border-divider/10 transition-all hover:bg-default-100/30">
                  <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-foreground/90">每周画质评分更新</span>
                    <span className="text-[11px] text-default-400 font-medium">根据最新的 TMDB 数据和规则重新计算文件评分。</span>
                  </div>
                  <Switch defaultSelected size="sm" />
                </div>
              </div>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>

      <Modal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
      >
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header>添加监控目录</Modal.Header>
                <Modal.Body>
                  <div className="flex flex-col gap-4">
                    <TextField
                      value={newFolderData.path || ''}
                      onChange={(v) => setNewFolderData({ ...newFolderData, path: v })}
                      isRequired
                    >
                      <Label className="text-small font-bold text-default-500">目录路径</Label>
                      <Input placeholder="例如: /volume1/downloads" />
                    </TextField>
                    <div className="flex justify-between items-center bg-default-100 p-3 rounded-lg">
                      <span className="text-sm">自动刮削</span>
                      <Switch
                        isSelected={newFolderData.auto_scrape}
                        onChange={(v) => setNewFolderData({ ...newFolderData, auto_scrape: v })}
                        size="sm"
                      />
                    </div>
                    <div className="flex justify-between items-center bg-default-100 p-3 rounded-lg">
                      <span className="text-sm">自动重命名</span>
                      <Switch
                        isSelected={newFolderData.auto_rename}
                        onChange={(v) => setNewFolderData({ ...newFolderData, auto_rename: v })}
                        size="sm"
                      />
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" size="md" onPress={close}>
                    取消
                  </Button>
                  <Button variant="primary" size="md" onPress={handleAddFolder} isPending={addMutation.isPending}>
                    确认添加
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}
