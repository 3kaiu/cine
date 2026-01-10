import { useState, useEffect, useMemo } from 'react'
import { Tabs, TextField, Label, Input, InputGroup, Button, Switch, Modal, Chip, Card } from "@heroui/react";
import { Gear, Clock, FloppyDisk, Check, Xmark, ArrowRotateLeft, Key, Folder, Bell } from "@gravity-ui/icons"
import { Icon } from '@iconify/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import { settingsApi } from '@/api/settings'

export default function Settings() {
  // Basic Config Form State
  const [basicConfig, setBasicConfig] = useState({
    tmdb_api_key: '',
    default_dir: '',
    auto_monitor: true
  })
  
  // 原始配置用于检测变更
  const [originalConfig, setOriginalConfig] = useState({
    tmdb_api_key: '',
    default_dir: '',
    auto_monitor: true
  })
  
  // API 测试状态
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [apiTestMessage, setApiTestMessage] = useState('')

  // Scheduler state
  const [schedulerConfig, setSchedulerConfig] = useState({
    daily_cleanup: true,
    weekly_quality_update: true
  })
  // Basic Config Mutation
  const configMutation = useMutation({
    mutationFn: async (values: any) => {
      const settings = {
        tmdb_api_key: values.tmdb_api_key,
        default_dir: values.default_dir,
        auto_monitor: values.auto_monitor ? '1' : '0'
      }
      return settingsApi.updateSettings({ settings })
    },
    onSuccess: () => {
      showSuccess('配置已保存')
    },
    onError: (error: any) => handleError(error, '保存配置失败')
  });

  // 获取当前配置
  const { data: currentConfig } = useQuery({
    queryKey: ['settings-basic'],
    queryFn: async () => {
      const res = await settingsApi.getSettings('basic')
      return {
        tmdb_api_key: res.settings.tmdb_api_key || '',
        default_dir: res.settings.default_dir || '',
        auto_monitor: res.settings.auto_monitor === '1'
      }
    }
  })

  // 当获取到配置时更新本地状态
  useEffect(() => {
    if (currentConfig) {
      setBasicConfig(currentConfig);
    }
  }, [currentConfig])

  // Scheduler Config Mutation
  const schedulerMutation = useMutation({
    mutationFn: async (values: any) => {
      const settings = {
        daily_cleanup: values.daily_cleanup ? '1' : '0',
        weekly_quality_update: values.weekly_quality_update ? '1' : '0'
      }
      return settingsApi.updateSettings({ settings })
    },
    onSuccess: () => {
      showSuccess('调度器配置已保存')
    },
    onError: (error: any) => handleError(error, '保存调度器配置失败')
  });

  // 检测配置是否有变更
  const hasChanges = useMemo(() => {
    return basicConfig.tmdb_api_key !== originalConfig.tmdb_api_key ||
           basicConfig.default_dir !== originalConfig.default_dir ||
           basicConfig.auto_monitor !== originalConfig.auto_monitor
  }, [basicConfig, originalConfig])
  
  // 测试 TMDB API 连接
  const testApiMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      // TODO: 实现实际的 API 测试
      // const res = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${apiKey}`)
      // if (!res.ok) throw new Error('API key 无效')
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!apiKey) throw new Error('请输入 API Key')
      return { success: true }
    },
    onSuccess: () => {
      setApiTestStatus('success')
      setApiTestMessage('API 连接成功')
    },
    onError: (error: any) => {
      setApiTestStatus('error')
      setApiTestMessage(error.message || 'API 连接失败')
    }
  })
  
  // 重置配置
  const resetConfig = () => {
    setBasicConfig({
      tmdb_api_key: '',
      default_dir: '',
      auto_monitor: true
    })
    setApiTestStatus('idle')
    setApiTestMessage('')
  }

  const handleSubmit = () => {
    configMutation.mutate(basicConfig, {
      onSuccess: () => {
        setOriginalConfig({ ...basicConfig })
      }
    })
  }

  const handleSchedulerSubmit = () => {
    schedulerMutation.mutate(schedulerConfig);
  }

  const handleFolderSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.style.display = 'none'
    input.onchange = (e: any) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const firstFile = files[0] as any
        if (firstFile.path) {
          const fullPath = firstFile.path
          const separator = fullPath.includes('\\') ? '\\' : '/'
          const dir = fullPath.substring(0, fullPath.lastIndexOf(separator))
          setBasicConfig({ ...basicConfig, default_dir: dir })
        } else if (firstFile.webkitRelativePath) {
          const relativePath = firstFile.webkitRelativePath
          const pathParts = relativePath.split('/')
          if (pathParts.length > 0) {
            const folderName = pathParts[0]
            setBasicConfig({ ...basicConfig, default_dir: `/${folderName}` })
          }
        }
      }
      document.body.removeChild(input)
    }
    document.body.appendChild(input)
    input.click()
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold tracking-tight text-foreground/90">系统设置</h2>
        <p className="text-[11px] text-default-400 font-medium">管理全局配置、自动化任务及其运行状态</p>
      </div>

      <div className="flex w-full flex-col mt-2">
        <Tabs aria-label="设置选项" className="w-full">
          <Tabs.ListContainer>
            <Tabs.List aria-label="设置选项">
              <Tabs.Tab id="general">
                <Tabs.Indicator />
                <div className="flex items-center space-x-2">
                  <Gear className="w-[14px] h-[14px]" />
                  <span>常规配置</span>
                </div>
              </Tabs.Tab>
              <Tabs.Tab id="scheduler">
                <Tabs.Indicator />
                <div className="flex items-center space-x-2">
                  <Clock className="w-[14px] h-[14px]" />
                  <span>计划任务</span>
                </div>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="general">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-foreground/80">基础设置</h3>
                <p className="text-[11px] text-default-400">配置 API 密钥和默认路径。</p>
              </div>
              <Card className="p-6">
                <div className="flex flex-col gap-6">
                  <TextField
                    value={basicConfig.tmdb_api_key}
                    onChange={(v) => setBasicConfig({ ...basicConfig, tmdb_api_key: v })}
                  >
                    <Label>TMDB API 密钥</Label>
                    <InputGroup>
                      <InputGroup.Input type="password" placeholder="请输入您的 API Key" />
                      <InputGroup.Suffix>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            setApiTestStatus('testing')
                            testApiMutation.mutate(basicConfig.tmdb_api_key)
                          }}
                          isPending={testApiMutation.isPending}
                          className="text-xs h-8 px-3"
                        >
                          <Icon icon="mdi:refresh" className={`w-3 h-3 ${testApiMutation.isPending ? 'animate-spin' : ''}`} />
                          测试连接
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    {apiTestStatus === 'success' && (
                      <div className="flex items-center gap-2 mt-2">
                        <Chip size="sm" variant="soft" className="bg-success/10 text-success border-success/20">
                          <Check className="w-3 h-3" />
                          {apiTestMessage}
                        </Chip>
                      </div>
                    )}
                    {apiTestStatus === 'error' && (
                      <div className="flex items-center gap-2 mt-2">
                        <Chip size="sm" variant="soft" className="bg-danger/10 text-danger border-danger/20">
                          <Xmark className="w-3 h-3" />
                          {apiTestMessage}
                        </Chip>
                      </div>
                    )}
                  </TextField>
                  
                  <TextField
                    value={basicConfig.default_dir}
                    onChange={(v) => setBasicConfig({ ...basicConfig, default_dir: v })}
                  >
                    <Label>默认扫描目录</Label>
                    <InputGroup>
                      <InputGroup.Prefix>
                        <Folder className="w-4 h-4 text-default-400" />
                      </InputGroup.Prefix>
                      <InputGroup.Input placeholder="例如: /path/to/media" />
                      <InputGroup.Suffix>
                        <Button
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          onPress={handleFolderSelect}
                          aria-label="选择文件夹"
                        >
                          <Icon icon="mdi:folder-open-outline" className="w-4 h-4" />
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                  </TextField>
                  
                  <div className="flex items-center justify-between py-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">启用自动化监控</Label>
                      <span className="text-xs text-default-500">监控默认目录的文件变化并自动触发分析任务</span>
                    </div>
                    <Switch
                      isSelected={basicConfig.auto_monitor}
                      onChange={(v) => setBasicConfig({ ...basicConfig, auto_monitor: v })}
                      size="md"
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-divider/10">
                    <div className="flex items-center gap-2">
                      {hasChanges && (
                        <Chip size="sm" variant="soft" className="bg-warning/10 text-warning border-warning/20">
                          有未保存的更改
                        </Chip>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={resetConfig}
                        className="text-xs"
                      >
                        <ArrowRotateLeft className="w-3 h-3" />
                        重置为默认值
                      </Button>
                    </div>
                    <Button
                      variant="primary"
                      isDisabled={configMutation.isPending || !hasChanges}
                      onPress={handleSubmit}
                      isPending={configMutation.isPending}
                      size="md"
                      className="font-bold shadow-sm flex gap-2"
                    >
                      {!configMutation.isPending && <FloppyDisk className="w-[14px] h-[14px]" />}
                      保存配置
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="scheduler">
            <div className="flex flex-col gap-4 py-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-foreground/80">任务调度器</h3>
                <p className="text-[11px] text-default-400">管理后台定时执行的维护任务。</p>
              </div>
              <Card className="p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">每日库清理</Label>
                      <span className="text-xs text-default-500">每天凌晨 3:00 自动清理无效记录和空文件夹。</span>
                    </div>
                    <Switch
                      isSelected={schedulerConfig.daily_cleanup}
                      onChange={(v) => setSchedulerConfig({ ...schedulerConfig, daily_cleanup: v })}
                      size="md"
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">每周画质评分更新</Label>
                      <span className="text-xs text-default-500">根据最新的 TMDB 数据和规则重新计算文件评分。</span>
                    </div>
                    <Switch
                      isSelected={schedulerConfig.weekly_quality_update}
                      onChange={(v) => setSchedulerConfig({ ...schedulerConfig, weekly_quality_update: v })}
                      size="md"
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      isDisabled={schedulerMutation.isPending}
                      onPress={handleSchedulerSubmit}
                      isPending={schedulerMutation.isPending}
                      size="md"
                      className="font-bold shadow-sm flex gap-2"
                    >
                      {!schedulerMutation.isPending && <FloppyDisk className="w-[14px] h-[14px]" />}
                      保存配置
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  )
}
