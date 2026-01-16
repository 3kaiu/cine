import { useState, useMemo } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import {
  Button,
  Chip,
  Surface,
  Tabs,
  TextField,
  Label,
  InputGroup,
  Switch
} from "@heroui/react"
import { Icon } from '@iconify/react'
import {
  ArrowRotateLeft,
  Check,
  Xmark,
  Folder,
  Gear,
  FloppyDisk
} from '@gravity-ui/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settings'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import PageHeader from '@/components/PageHeader'

export default function Settings() {
  const queryClient = useQueryClient()
  const [basicConfig, setBasicConfig] = useState({
    tmdb_api_key: '',
    default_dir: '',
    auto_monitor: false
  })
  const [schedulerConfig, setSchedulerConfig] = useState({
    daily_cleanup: true,
    weekly_quality_update: true
  })

  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [apiTestMessage, setApiTestMessage] = useState('')

  const { data: currentSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.getSettings()
      const settings = res.settings || {}
      setBasicConfig({
        tmdb_api_key: settings.tmdb_api_key || '',
        default_dir: settings.default_dir || '',
        auto_monitor: settings.auto_monitor === 'true'
      })
      setSchedulerConfig({
        daily_cleanup: settings.daily_cleanup !== 'false',
        weekly_quality_update: settings.weekly_quality_update !== 'false'
      })
      return settings
    }
  })

  const configMutation = useMutation({
    mutationFn: async (config: typeof basicConfig) => {
      return settingsApi.updateSettings({
        settings: {
          tmdb_api_key: config.tmdb_api_key,
          default_dir: config.default_dir,
          auto_monitor: String(config.auto_monitor)
        }
      })
    },
    onSuccess: () => {
      showSuccess('配置已保存')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: unknown) => handleError(err)
  })

  const schedulerMutation = useMutation({
    mutationFn: async (config: typeof schedulerConfig) => {
      return settingsApi.updateSettings({
        settings: {
          daily_cleanup: String(config.daily_cleanup),
          weekly_quality_update: String(config.weekly_quality_update)
        }
      })
    },
    onSuccess: () => {
      showSuccess('调度程序配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: unknown) => handleError(err)
  })

  const testApiMutation = useMutation({
    mutationFn: (apiKey: string) => axios.get(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`),
    onSuccess: () => {
      setApiTestStatus('success')
      setApiTestMessage('TMDB API 连接正常')
    },
    onError: (err: any) => {
      setApiTestStatus('error')
      setApiTestMessage(err.response?.data?.status_message || '连接失败，请检查 API Key')
    }
  })

  const hasChanges = useMemo(() => {
    if (!currentSettings) return false
    return (
      basicConfig.tmdb_api_key !== (currentSettings.tmdb_api_key || '') ||
      basicConfig.default_dir !== (currentSettings.default_dir || '') ||
      basicConfig.auto_monitor !== (currentSettings.auto_monitor === 'true')
    )
  }, [basicConfig, currentSettings])

  const handleSubmit = () => {
    configMutation.mutate(basicConfig)
  }

  const handleSchedulerSubmit = () => {
    schedulerMutation.mutate(schedulerConfig)
  }

  const resetConfig = () => {
    if (currentSettings) {
      setBasicConfig({
        tmdb_api_key: currentSettings.tmdb_api_key || '',
        default_dir: currentSettings.default_dir || '',
        auto_monitor: currentSettings.auto_monitor === 'true'
      })
    }
  }

  const handleFolderSelect = async () => {
    try {
      // @ts-ignore
      const dir = await window.electron?.ipcRenderer.invoke('select-directory')
      if (dir) {
        setBasicConfig({ ...basicConfig, default_dir: dir })
      }
    } catch (e) {
      console.error('Failed to select directory:', e)
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        title="系统设置"
        description="管理全局配置、自动化任务及其运行状态"
      />

      <div className="flex w-full flex-col mt-2">
        <Tabs aria-label="设置选项" className="w-full">
          <Tabs.ListContainer>
            <Tabs.List>
              <Tabs.Tab id="general">
                <div className="flex items-center gap-2 px-1">
                  <Gear className="w-4 h-4" />
                  <span>通用设置</span>
                </div>
              </Tabs.Tab>
              <Tabs.Tab id="scheduler">
                <div className="flex items-center gap-2 px-1">
                  <Icon icon="mdi:calendar-clock" className="w-4 h-4" />
                  <span>自动化调度</span>
                </div>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="general">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <Surface variant="default" className="p-6 rounded-2xl border border-divider/50 bg-background/50 shadow-sm">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">基础设置</h3>
                    <p className="text-[11px] text-default-400 font-medium">配置 API 密钥和默认扫描路径</p>
                  </div>

                  <TextField
                    value={basicConfig.tmdb_api_key}
                    onChange={(v) => setBasicConfig({ ...basicConfig, tmdb_api_key: v })}
                  >
                    <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">TMDB API 密钥</Label>
                    <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                      <InputGroup.Input type="password" placeholder="请输入您的 API Key" className="text-sm" />
                      <InputGroup.Suffix>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => {
                            setApiTestStatus('testing')
                            testApiMutation.mutate(basicConfig.tmdb_api_key)
                          }}
                          isPending={testApiMutation.isPending}
                          className="text-[10px] h-7 font-black uppercase tracking-widest px-3 border border-divider/10 shadow-sm"
                        >
                          <Icon icon="mdi:refresh" className={clsx("w-3 h-3 mr-1.5", testApiMutation.isPending && "animate-spin")} />
                          测试连接
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    <div className="flex items-center gap-2 mt-2 h-5">
                      {apiTestStatus === 'success' && (
                        <Chip size="sm" variant="soft" color="success" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                          <Check className="w-3 h-3 mr-1" />
                          {apiTestMessage}
                        </Chip>
                      )}
                      {apiTestStatus === 'error' && (
                        <Chip size="sm" variant="soft" color="danger" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                          <Xmark className="w-3 h-3 mr-1" />
                          {apiTestMessage}
                        </Chip>
                      )}
                    </div>
                  </TextField>

                  <TextField
                    value={basicConfig.default_dir}
                    onChange={(v) => setBasicConfig({ ...basicConfig, default_dir: v })}
                  >
                    <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">默认扫描目录</Label>
                    <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                      <InputGroup.Prefix>
                        <Folder className="w-4 h-4 text-default-400" />
                      </InputGroup.Prefix>
                      <InputGroup.Input placeholder="例如: /path/to/media" className="text-sm" />
                      <InputGroup.Suffix>
                        <Button
                          isIconOnly
                          variant="secondary"
                          size="sm"
                          onPress={handleFolderSelect}
                          className="h-7 w-7 min-w-0 border border-divider/10 shadow-sm"
                          aria-label="选择文件夹"
                        >
                          <Icon icon="mdi:folder-open-outline" className="w-4 h-4" />
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                  </TextField>

                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-default-100/30 border border-divider/10">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[13px] font-bold text-foreground/80">启用自动化监控</Label>
                      <span className="text-[11px] text-default-400 font-medium">监控默认目录的文件变化并自动触发分析任务</span>
                    </div>
                    <Switch
                      isSelected={basicConfig.auto_monitor}
                      onChange={(v) => setBasicConfig({ ...basicConfig, auto_monitor: v })}
                      size="md"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-divider/10">
                    <div className="flex items-center gap-3">
                      <Button
                        size="md"
                        variant="secondary"
                        onPress={resetConfig}
                        className="text-[11px] font-bold h-9 px-4 border border-divider/10 shadow-sm"
                      >
                        <ArrowRotateLeft className="w-3.5 h-3.5 mr-2 opacity-70" />
                        重置配置
                      </Button>
                      {hasChanges && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
                          <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-warning/80">未保存</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      isDisabled={configMutation.isPending || !hasChanges}
                      onPress={handleSubmit}
                      isPending={configMutation.isPending}
                      size="md"
                      className="font-bold shadow-none h-10 px-8 flex gap-2"
                    >
                      {!configMutation.isPending && <FloppyDisk className="w-4 h-4" />}
                      保存更改
                    </Button>
                  </div>
                </div>
              </Surface>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="scheduler">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <Surface variant="default" className="p-6 rounded-2xl border border-divider/50 bg-background/50 shadow-sm">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">任务调度器</h3>
                    <p className="text-[11px] text-default-400 font-medium">配置系统维护任务及其执行周期</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-default-100/30 border border-divider/10">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[13px] font-bold text-foreground/80">每日库清理</Label>
                        <span className="text-[11px] text-default-400 font-medium">每天凌晨 3:00 自动清理无效记录和空文件夹</span>
                      </div>
                      <Switch
                        isSelected={schedulerConfig.daily_cleanup}
                        onChange={(v) => setSchedulerConfig({ ...schedulerConfig, daily_cleanup: v })}
                        size="md"
                      />
                    </div>

                    <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-default-100/30 border border-divider/10">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[13px] font-bold text-foreground/80">每周画质评分更新</Label>
                        <span className="text-[11px] text-default-400 font-medium">根据最新的 TMDB 数据和规则重新计算文件评分</span>
                      </div>
                      <Switch
                        isSelected={schedulerConfig.weekly_quality_update}
                        onChange={(v) => setSchedulerConfig({ ...schedulerConfig, weekly_quality_update: v })}
                        size="md"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-divider/10">
                    <Button
                      variant="primary"
                      isDisabled={schedulerMutation.isPending}
                      onPress={handleSchedulerSubmit}
                      isPending={schedulerMutation.isPending}
                      size="md"
                      className="font-bold shadow-none h-10 px-8 flex gap-2"
                    >
                      {!schedulerMutation.isPending && <FloppyDisk className="w-4 h-4" />}
                      保存调度配置
                    </Button>
                  </div>
                </div>
              </Surface>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  )
}
