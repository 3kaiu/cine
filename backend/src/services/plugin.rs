use anyhow::{Context, Result};
use extism::{Manifest, Plugin, Wasm};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use utoipa::ToSchema;

/// 插件信息
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub id: String,
    pub supported_sources: Vec<String>,
}

/// 搜索请求 (Host -> Guest)
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PluginSearchQuery {
    pub keyword: String,
    pub year: Option<u32>,
    pub media_type: String, // movie, tv
}

/// 搜索结果 (Guest -> Host)
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PluginSearchResult {
    pub results: Vec<PluginSearchResultItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PluginSearchResultItem {
    pub remote_id: String,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
}

/// 插件管理器
pub struct PluginManager {
    plugins: Arc<RwLock<HashMap<String, ScraperPlugin>>>,
    plugins_dir: PathBuf,
}

/// 包装后的 scraper 插件
pub struct ScraperPlugin {
    pub info: PluginInfo,
    // Plugin 在 extism 中不是线程安全的，但在 axum handlers 中通常需要 Send/Sync
    // 我们可能需要每次调用时重新实例化，或者使用 mutex 保护
    // 考虑到插件执行时间可能较长，Mutex 可能会阻塞
    // 更好的方式是缓存 wasm bytes，每次请求创建一个新的 Plugin 实例（Extism 实例化很快）
    wasm_bytes: Vec<u8>,
}

impl PluginManager {
    pub fn new<P: AsRef<Path>>(plugins_dir: P) -> Self {
        Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            plugins_dir: plugins_dir.as_ref().to_path_buf(),
        }
    }

    /// 扫描并加载插件
    pub async fn load_plugins(&self) -> Result<()> {
        if !self.plugins_dir.exists() {
            tokio::fs::create_dir_all(&self.plugins_dir).await?;
        }

        let mut read_dir = tokio::fs::read_dir(&self.plugins_dir).await?;
        let mut plugins = self.plugins.write().await;

        while let Some(entry) = read_dir.next_entry().await? {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "wasm") {
                match self.load_single_plugin(&path).await {
                    Ok(plugin) => {
                        tracing::info!("Loaded plugin: {} ({})", plugin.info.name, plugin.info.id);
                        plugins.insert(plugin.info.id.clone(), plugin);
                    }
                    Err(e) => {
                        tracing::error!("Failed to load plugin {:?}: {}", path, e);
                    }
                }
            }
        }
        Ok(())
    }

    async fn load_single_plugin(&self, path: &Path) -> Result<ScraperPlugin> {
        let wasm_bytes = tokio::fs::read(path).await?;

        // 验证插件并获取信息
        // 这里我们需要创建一个临时的 Plugin 实例来调用 plugin_info
        let manifest = Manifest::new([Wasm::data(wasm_bytes.clone())]);
        let mut plugin = Plugin::new(&manifest, [], true)?;

        let info_json = plugin
            .call::<(), String>("plugin_info", ())
            .context("Failed to call plugin_info")?;

        let info: PluginInfo =
            serde_json::from_str(&info_json).context("Failed to parse PluginInfo")?;

        Ok(ScraperPlugin { info, wasm_bytes })
    }

    pub async fn get_plugin(&self, id: &str) -> Option<ScraperPlugin> {
        self.plugins.read().await.get(id).cloned()
    }

    pub async fn list_plugins(&self) -> Vec<PluginInfo> {
        self.plugins
            .read()
            .await
            .values()
            .map(|p| p.info.clone())
            .collect()
    }

    /// 执行搜索
    pub async fn search(
        &self,
        plugin_id: &str,
        query: PluginSearchQuery,
    ) -> Result<PluginSearchResult> {
        // 获取 wasm bytes
        let wasm_bytes = {
            let plugins = self.plugins.read().await;
            plugins.get(plugin_id).map(|p| p.wasm_bytes.clone())
        };

        if let Some(bytes) = wasm_bytes {
            // 在 tokio blocking task 中运行 wasm (如果它是 CPU 密集的)
            // Extism 调用通常是阻塞的
            let query_json = serde_json::to_string(&query)?;

            let result_json = tokio::task::spawn_blocking(move || {
                let manifest = Manifest::new([Wasm::data(bytes)]);
                // TODO: 添加 Host function (http_request)
                let mut plugin = Plugin::new(&manifest, [], true)?;
                plugin.call::<String, String>("search", query_json)
            })
            .await??;

            let result: PluginSearchResult = serde_json::from_str(&result_json)?;
            Ok(result)
        } else {
            Err(anyhow::anyhow!("Plugin not found: {}", plugin_id))
        }
    }
}

// 需要 Clone 才能在 Axum State 中传递吗？
// ScraperPlugin 包含 Vec<u8>，Clone 代价虽然有，但是相比 WASM 实例化可能还好
// 实际上我们可能只需要 Arc<PluginManager> 在 State 中
impl Clone for ScraperPlugin {
    fn clone(&self) -> Self {
        Self {
            info: self.info.clone(),
            wasm_bytes: self.wasm_bytes.clone(),
        }
    }
}
