import { useMemo, useState } from 'react'
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
} from "@/ui/heroui"
import { Icon } from '@iconify/react'
import {
  ArrowRotateLeft,
  Check,
  Xmark,
  Folder,
  Gear,
  FloppyDisk
} from '@/ui/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settings'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import PageHeader from '@/components/PageHeader'

type CurrentSettings = Record<string, string> & {
  __masked: Record<string, string>
  __configured: string[]
}

type BasicConfig = {
  tmdb_api_key: string
  bgm_api_key: string
  cloudflare_account_id: string
  cloudflare_api_token: string
  cloudflare_ai_model: string
  cloudflare_ai_base_url: string
  ai_mode: string
  ai_budget_mode: string
  ai_daily_budget: string
  default_dir: string
  auto_monitor: boolean
}

type HealthProvider = 'tmdb' | 'bangumi' | 'cloudflare_ai'
type HealthState = {
  status: 'idle' | 'testing' | 'success' | 'error'
  message: string
  details?: Record<string, string>
}

const defaultBasicConfig: BasicConfig = {
  tmdb_api_key: '',
  bgm_api_key: '',
  cloudflare_account_id: '',
  cloudflare_api_token: '',
  cloudflare_ai_model: '@cf/meta/llama-3.1-8b-instruct',
  cloudflare_ai_base_url: '',
  ai_mode: 'assist',
  ai_budget_mode: 'strict_free',
  ai_daily_budget: '100',
  default_dir: '',
  auto_monitor: false,
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [basicConfig, setBasicConfig] = useState<BasicConfig>(defaultBasicConfig)
  const [schedulerConfig, setSchedulerConfig] = useState({
    daily_cleanup: true,
    weekly_quality_update: true
  })
  const [healthStates, setHealthStates] = useState<Record<HealthProvider, HealthState>>({
    tmdb: { status: 'idle', message: '' },
    bangumi: { status: 'idle', message: '' },
    cloudflare_ai: { status: 'idle', message: '' },
  })

  const { data: currentSettings } = useQuery<CurrentSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.getSettings()
      const settings = res.settings || {}
      const masked = res.masked_settings || {}

      setBasicConfig({
        tmdb_api_key: settings.tmdb_api_key || '',
        bgm_api_key: settings.bgm_api_key || '',
        cloudflare_account_id: settings.cloudflare_account_id || '',
        cloudflare_api_token: settings.cloudflare_api_token || '',
        cloudflare_ai_model: settings.cloudflare_ai_model || '@cf/meta/llama-3.1-8b-instruct',
        cloudflare_ai_base_url: settings.cloudflare_ai_base_url || '',
        ai_mode: settings.ai_mode || 'assist',
        ai_budget_mode: settings.ai_budget_mode || 'strict_free',
        ai_daily_budget: settings.ai_daily_budget || '100',
        default_dir: settings.default_dir || '',
        auto_monitor: settings.auto_monitor === 'true'
      })

      setSchedulerConfig({
        daily_cleanup: settings.daily_cleanup !== 'false',
        weekly_quality_update: settings.weekly_quality_update !== 'false'
      })

      return {
        ...settings,
        __masked: masked,
        __configured: res.configured_keys || []
      } as CurrentSettings
    }
  })

  const configMutation = useMutation({
    mutationFn: async (config: BasicConfig) => settingsApi.updateSettings({
      settings: {
        tmdb_api_key: config.tmdb_api_key,
        bgm_api_key: config.bgm_api_key,
        cloudflare_account_id: config.cloudflare_account_id,
        cloudflare_api_token: config.cloudflare_api_token,
        cloudflare_ai_model: config.cloudflare_ai_model,
        cloudflare_ai_base_url: config.cloudflare_ai_base_url,
        ai_mode: config.ai_mode,
        ai_budget_mode: config.ai_budget_mode,
        ai_daily_budget: config.ai_daily_budget,
        default_dir: config.default_dir,
        auto_monitor: String(config.auto_monitor)
      }
    }),
    onSuccess: () => {
      showSuccess('配置已保存')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: unknown) => handleError(err)
  })

  const schedulerMutation = useMutation({
    mutationFn: async (config: typeof schedulerConfig) => settingsApi.updateSettings({
      settings: {
        daily_cleanup: String(config.daily_cleanup),
        weekly_quality_update: String(config.weekly_quality_update)
      }
    }),
    onSuccess: () => {
      showSuccess('调度程序配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: unknown) => handleError(err)
  })

  const testApiMutation = useMutation({
    mutationFn: async (provider: HealthProvider) => {
      const payload = {
        provider,
        settings: {
          tmdb_api_key: basicConfig.tmdb_api_key,
          bgm_api_key: basicConfig.bgm_api_key,
          cloudflare_account_id: basicConfig.cloudflare_account_id,
          cloudflare_api_token: basicConfig.cloudflare_api_token,
          cloudflare_ai_model: basicConfig.cloudflare_ai_model,
          cloudflare_ai_base_url: basicConfig.cloudflare_ai_base_url,
          ai_mode: basicConfig.ai_mode,
          ai_budget_mode: basicConfig.ai_budget_mode,
          ai_daily_budget: basicConfig.ai_daily_budget,
        }
      }

      return settingsApi.testConnection(payload)
    },
    onMutate: (provider) => {
      setHealthStates((prev) => ({
        ...prev,
        [provider]: { status: 'testing', message: '', details: prev[provider]?.details }
      }))
    },
    onSuccess: (response, provider) => {
      setHealthStates((prev) => ({
        ...prev,
        [provider]: {
          status: 'success',
          message: response.message || '连接正常',
          details: response.details || {}
        }
      }))
    },
    onError: (err: unknown, provider) => {
      const message = err instanceof Error ? err.message : '连接失败，请检查配置'
      setHealthStates((prev) => ({
        ...prev,
        [provider]: {
          status: 'error',
          message,
          details: {}
        }
      }))
    }
  })

  const hasChanges = useMemo(() => {
    if (!currentSettings) return false

    return (
      basicConfig.tmdb_api_key !== (currentSettings.tmdb_api_key || '') ||
      basicConfig.bgm_api_key !== (currentSettings.bgm_api_key || '') ||
      basicConfig.cloudflare_account_id !== (currentSettings.cloudflare_account_id || '') ||
      basicConfig.cloudflare_api_token !== (currentSettings.cloudflare_api_token || '') ||
      basicConfig.cloudflare_ai_model !== (currentSettings.cloudflare_ai_model || '@cf/meta/llama-3.1-8b-instruct') ||
      basicConfig.cloudflare_ai_base_url !== (currentSettings.cloudflare_ai_base_url || '') ||
      basicConfig.ai_mode !== (currentSettings.ai_mode || 'assist') ||
      basicConfig.ai_budget_mode !== (currentSettings.ai_budget_mode || 'strict_free') ||
      basicConfig.ai_daily_budget !== (currentSettings.ai_daily_budget || '100') ||
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
    if (!currentSettings) return

    setBasicConfig({
      tmdb_api_key: currentSettings.tmdb_api_key || '',
      bgm_api_key: currentSettings.bgm_api_key || '',
      cloudflare_account_id: currentSettings.cloudflare_account_id || '',
      cloudflare_api_token: currentSettings.cloudflare_api_token || '',
      cloudflare_ai_model: currentSettings.cloudflare_ai_model || '@cf/meta/llama-3.1-8b-instruct',
      cloudflare_ai_base_url: currentSettings.cloudflare_ai_base_url || '',
      ai_mode: currentSettings.ai_mode || 'assist',
      ai_budget_mode: currentSettings.ai_budget_mode || 'strict_free',
      ai_daily_budget: currentSettings.ai_daily_budget || '100',
      default_dir: currentSettings.default_dir || '',
      auto_monitor: currentSettings.auto_monitor === 'true'
    })
  }

  const handleFolderSelect = async () => {
    try {
      // @ts-expect-error window.electron is injected in desktop environment
      const dir = await window.electron?.ipcRenderer.invoke('select-directory')
      if (dir) {
        setBasicConfig({ ...basicConfig, default_dir: dir })
      }
    } catch (e) {
      console.error('Failed to select directory:', e)
    }
  }

  const maskedSettings = useMemo(() => currentSettings?.__masked || {}, [currentSettings])
  const configuredKeys = useMemo(() => currentSettings?.__configured || [], [currentSettings])
  const isTestingProvider = (provider: HealthProvider) =>
    testApiMutation.isPending && testApiMutation.variables === provider
  const renderHealthStatus = (provider: HealthProvider) => {
    const state = healthStates[provider]
    if (!state || state.status === 'idle' || state.status === 'testing') return null

    return (
      <Chip
        size="sm"
        variant="soft"
        color={state.status === 'success' ? 'success' : 'danger'}
        className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight"
      >
        {state.status === 'success' ? <Check className="w-3 h-3 mr-1" /> : <Xmark className="w-3 h-3 mr-1" />}
        {state.message}
      </Chip>
    )
  }
  const providerDiagnostics = useMemo(() => ([
    {
      provider: 'tmdb' as const,
      title: 'TMDb',
      configured: configuredKeys.includes('tmdb_api_key'),
      summary: '电影 / 剧集主检索源',
      detailKeys: ['base_url', 'images_secure_base_url'],
    },
    {
      provider: 'bangumi' as const,
      title: 'Bangumi',
      configured: configuredKeys.includes('bgm_api_key'),
      summary: '动漫 / 番剧补充检索源',
      detailKeys: ['base_url', 'nickname'],
    },
    {
      provider: 'cloudflare_ai' as const,
      title: 'Cloudflare AI',
      configured: configuredKeys.includes('cloudflare_api_token'),
      summary: '仅在低置信度场景做 AI 兜底',
      detailKeys: ['base_url', 'model', 'reply'],
    },
  ]), [configuredKeys])

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
                    <p className="text-[11px] text-default-400 font-medium">配置媒体识别链路、AI 兜底策略和默认扫描路径</p>
                  </div>

                  <div className="rounded-xl border border-divider/20 bg-default-100/30 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-default-500">识别策略</p>
                          <p className="text-xs text-default-400">规则解析优先，Cloudflare Workers AI 只在低置信度或无候选时兜底。</p>
                        </div>
                        <Chip size="sm" variant="soft" color="accent">
                          {basicConfig.ai_budget_mode}
                        </Chip>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {providerDiagnostics.map((item) => {
                          const state = healthStates[item.provider]
                          const tone = state.status === 'success'
                            ? 'border-success/20 bg-success/5'
                            : state.status === 'error'
                              ? 'border-danger/20 bg-danger/5'
                              : 'border-divider/20 bg-background/40'

                          return (
                            <div key={item.provider} className={clsx("rounded-xl border p-3", tone)}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-black uppercase tracking-widest text-foreground/70">{item.title}</p>
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color={
                                    state.status === 'success'
                                      ? 'success'
                                      : state.status === 'error'
                                        ? 'danger'
                                        : item.configured
                                          ? 'accent'
                                          : 'warning'
                                  }
                                >
                                  {state.status === 'success'
                                    ? '已验证'
                                    : state.status === 'error'
                                      ? '异常'
                                      : item.configured
                                        ? '已配置'
                                        : '未配置'}
                                </Chip>
                              </div>
                              <p className="mt-2 text-xs text-default-400">{item.summary}</p>
                              <p className="mt-2 text-[11px] font-medium text-foreground/80 min-h-8">
                                {state.status === 'idle' ? '尚未执行健康检查' : state.message}
                              </p>
                              {state.details && Object.keys(state.details).length > 0 && (
                                <div className="mt-3 flex flex-col gap-1.5">
                                  {item.detailKeys
                                    .filter((key) => state.details?.[key])
                                    .map((key) => (
                                      <div key={key} className="flex items-start justify-between gap-2 text-[10px]">
                                        <span className="font-black uppercase tracking-widest text-default-500">{formatDiagnosticLabel(key)}</span>
                                        <span className="max-w-[65%] break-all text-right text-default-400">{state.details?.[key]}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="soft" color={configuredKeys.includes('tmdb_api_key') ? 'success' : 'warning'}>
                          TMDb {configuredKeys.includes('tmdb_api_key') ? '已配置' : '未配置'}
                        </Chip>
                        <Chip size="sm" variant="soft" color={configuredKeys.includes('bgm_api_key') ? 'success' : 'warning'}>
                          Bangumi {configuredKeys.includes('bgm_api_key') ? '已配置' : '可选'}
                        </Chip>
                        <Chip size="sm" variant="soft" color={configuredKeys.includes('cloudflare_api_token') ? 'success' : 'warning'}>
                          Cloudflare {configuredKeys.includes('cloudflare_api_token') ? '已配置' : '未配置'}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  <TextField
                    value={basicConfig.tmdb_api_key}
                    onChange={(v) => setBasicConfig({ ...basicConfig, tmdb_api_key: v })}
                  >
                    <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">TMDB API 密钥</Label>
                    <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                      <InputGroup.Input type="password" placeholder={maskedSettings.tmdb_api_key || '请输入您的 API Key'} className="text-sm" />
                      <InputGroup.Suffix>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => {
                            testApiMutation.mutate('tmdb')
                          }}
                          isPending={isTestingProvider('tmdb')}
                          className="text-[10px] h-7 font-black uppercase tracking-widest px-3 border border-divider/10 shadow-sm"
                        >
                          <Icon icon="mdi:refresh" className={clsx("w-3 h-3 mr-1.5", isTestingProvider('tmdb') && "animate-spin")} />
                          测试连接
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    <div className="flex items-center gap-2 mt-2 h-5">
                      {renderHealthStatus('tmdb')}
                    </div>
                  </TextField>

                  <TextField
                    value={basicConfig.bgm_api_key}
                    onChange={(v) => setBasicConfig({ ...basicConfig, bgm_api_key: v })}
                  >
                    <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">Bangumi API 密钥</Label>
                    <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                      <InputGroup.Input
                        type="password"
                        placeholder={maskedSettings.bgm_api_key || '未配置'}
                        className="text-sm"
                      />
                      <InputGroup.Suffix>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => testApiMutation.mutate('bangumi')}
                          isPending={isTestingProvider('bangumi')}
                          className="text-[10px] h-7 font-black uppercase tracking-widest px-3 border border-divider/10 shadow-sm"
                        >
                          <Icon icon="mdi:refresh" className={clsx("w-3 h-3 mr-1.5", isTestingProvider('bangumi') && "animate-spin")} />
                          测试连接
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    <div className="flex items-center gap-2 mt-2 h-5">
                      {renderHealthStatus('bangumi')}
                    </div>
                  </TextField>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextField
                      value={basicConfig.cloudflare_account_id}
                      onChange={(v) => setBasicConfig({ ...basicConfig, cloudflare_account_id: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">Cloudflare Account ID</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input
                          placeholder={maskedSettings.cloudflare_account_id || '用于 Workers AI'}
                          className="text-sm"
                        />
                      </InputGroup>
                    </TextField>

                    <TextField
                      value={basicConfig.cloudflare_api_token}
                      onChange={(v) => setBasicConfig({ ...basicConfig, cloudflare_api_token: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">Cloudflare API Token</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input
                          type="password"
                          placeholder={maskedSettings.cloudflare_api_token || '未配置'}
                          className="text-sm"
                        />
                      </InputGroup>
                    </TextField>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextField
                      value={basicConfig.cloudflare_ai_model}
                      onChange={(v) => setBasicConfig({ ...basicConfig, cloudflare_ai_model: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">AI Model</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input className="text-sm" />
                      </InputGroup>
                    </TextField>

                    <TextField
                      value={basicConfig.cloudflare_ai_base_url}
                      onChange={(v) => setBasicConfig({ ...basicConfig, cloudflare_ai_base_url: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">AI Base URL</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input placeholder="留空时使用 Cloudflare 默认地址" className="text-sm" />
                      </InputGroup>
                    </TextField>
                  </div>

                  <div className="rounded-xl border border-divider/10 bg-default-100/30 px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-black uppercase tracking-widest text-default-500">Cloudflare 免费接入建议</p>
                      <p className="text-xs text-default-400">
                        推荐使用 `@cf/meta/llama-3.1-8b-instruct` 配合 `ai_mode=assist` 和 `ai_budget_mode=strict_free`。
                        Cine 的 identify 链路会优先走规则解析和 TMDb / Bangumi 检索，Workers AI 只做低成本兜底。
                      </p>
                      <p className="text-xs text-default-400">
                        API Token 至少需要 Workers AI 调用权限；如果你使用 AI Gateway，可在上面的 `AI Base URL` 中填入自定义地址。
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => testApiMutation.mutate('cloudflare_ai')}
                          isPending={isTestingProvider('cloudflare_ai')}
                          className="text-[10px] h-7 font-black uppercase tracking-widest px-3 border border-divider/10 shadow-sm"
                        >
                          <Icon icon="mdi:refresh" className={clsx("w-3 h-3 mr-1.5", isTestingProvider('cloudflare_ai') && "animate-spin")} />
                          测试 Workers AI
                        </Button>
                        {renderHealthStatus('cloudflare_ai')}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <TextField
                      value={basicConfig.ai_mode}
                      onChange={(v) => setBasicConfig({ ...basicConfig, ai_mode: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">AI Mode</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input placeholder="disabled / assist / force" className="text-sm" />
                      </InputGroup>
                    </TextField>

                    <TextField
                      value={basicConfig.ai_budget_mode}
                      onChange={(v) => setBasicConfig({ ...basicConfig, ai_budget_mode: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">AI Budget Mode</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input placeholder="strict_free / relaxed" className="text-sm" />
                      </InputGroup>
                    </TextField>

                    <TextField
                      value={basicConfig.ai_daily_budget}
                      onChange={(v) => setBasicConfig({ ...basicConfig, ai_daily_budget: v })}
                    >
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500 mb-1.5">Daily AI Budget</Label>
                      <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                        <InputGroup.Input className="text-sm" />
                      </InputGroup>
                    </TextField>
                  </div>

                  <div className="rounded-xl border border-divider/10 bg-accent/5 px-4 py-3">
                    <p className="text-xs font-semibold text-foreground/80">
                      推荐组合：`ai_mode=assist`、`ai_budget_mode=strict_free`，只把 Cloudflare 免费 AI 当规则链兜底，不走主判定路径。
                    </p>
                  </div>

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

function formatDiagnosticLabel(key: string): string {
  if (key === 'base_url') return 'Base URL'
  if (key === 'images_secure_base_url') return 'Image Base'
  if (key === 'nickname') return 'Nickname'
  if (key === 'model') return 'Model'
  if (key === 'reply') return 'Reply'
  return key
}
