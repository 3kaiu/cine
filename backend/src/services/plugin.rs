use anyhow::Result;
use serde::{Deserialize, Serialize};
#[cfg(feature = "plugins")]
use std::collections::HashMap;
#[cfg(feature = "plugins")]
use std::path::{Path, PathBuf};
use std::sync::Arc;
#[cfg(feature = "plugins")]
use tokio::sync::RwLock;
use utoipa::ToSchema;

#[cfg(feature = "plugins")]
use anyhow::Context;
#[cfg(feature = "plugins")]
use extism::{Manifest, Plugin, Wasm};

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
    #[cfg(feature = "plugins")]
    plugins: Arc<RwLock<HashMap<String, ScraperPlugin>>>,
    #[cfg(feature = "plugins")]
    plugins_dir: PathBuf,
}

/// 包装后的 scraper 插件
#[cfg(feature = "plugins")]
pub struct ScraperPlugin {
    pub info: PluginInfo,
    wasm_bytes: Vec<u8>,
}

impl PluginManager {
    pub fn new<P: AsRef<std::path::Path>>(plugins_dir: P) -> Self {
        #[cfg(feature = "plugins")]
        {
            return Self {
                plugins: Arc::new(RwLock::new(HashMap::new())),
                plugins_dir: plugins_dir.as_ref().to_path_buf(),
            };
        }

        #[cfg(not(feature = "plugins"))]
        {
            let _ = plugins_dir;
            Self {}
        }
    }

    pub fn is_compiled() -> bool {
        cfg!(feature = "plugins")
    }

    /// 扫描并加载插件
    #[cfg(feature = "plugins")]
    pub async fn load_plugins(&self) -> Result<()> {
        if !self.plugins_dir.exists() {
            tokio::fs::create_dir_all(&self.plugins_dir).await?;
        }

        let mut read_dir = tokio::fs::read_dir(&self.plugins_dir).await?;
        let mut plugins = self.plugins.write().await;

        while let Some(entry) = read_dir.next_entry().await? {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "wasm") {
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

    #[cfg(not(feature = "plugins"))]
    pub async fn load_plugins(&self) -> Result<()> {
        tracing::info!("Plugins feature is not compiled into this build");
        Ok(())
    }

    #[cfg(feature = "plugins")]
    async fn load_single_plugin(&self, path: &Path) -> Result<ScraperPlugin> {
        let wasm_bytes = tokio::fs::read(path).await?;

        let manifest = Manifest::new([Wasm::data(wasm_bytes.clone())]);
        let mut plugin = Plugin::new(&manifest, [], true)?;

        let info_json = plugin
            .call::<(), String>("plugin_info", ())
            .context("Failed to call plugin_info")?;

        let info: PluginInfo =
            serde_json::from_str(&info_json).context("Failed to parse PluginInfo")?;

        Ok(ScraperPlugin { info, wasm_bytes })
    }

    #[cfg(feature = "plugins")]
    pub async fn list_plugins(&self) -> Vec<PluginInfo> {
        self.plugins
            .read()
            .await
            .values()
            .map(|p| p.info.clone())
            .collect()
    }

    #[cfg(not(feature = "plugins"))]
    pub async fn list_plugins(&self) -> Vec<PluginInfo> {
        Vec::new()
    }

    /// 执行搜索
    #[cfg(feature = "plugins")]
    pub async fn search(
        &self,
        plugin_id: &str,
        query: PluginSearchQuery,
    ) -> Result<PluginSearchResult> {
        let wasm_bytes = {
            let plugins = self.plugins.read().await;
            plugins.get(plugin_id).map(|p| p.wasm_bytes.clone())
        };

        if let Some(bytes) = wasm_bytes {
            let query_json = serde_json::to_string(&query)?;

            let result_json = tokio::task::spawn_blocking(move || {
                let manifest = Manifest::new([Wasm::data(bytes)]);
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

    #[cfg(not(feature = "plugins"))]
    pub async fn search(
        &self,
        _plugin_id: &str,
        _query: PluginSearchQuery,
    ) -> Result<PluginSearchResult> {
        Err(anyhow::anyhow!(
            "Plugin support is not compiled into this build"
        ))
    }
}

#[cfg(feature = "plugins")]
impl Clone for ScraperPlugin {
    fn clone(&self) -> Self {
        Self {
            info: self.info.clone(),
            wasm_bytes: self.wasm_bytes.clone(),
        }
    }
}
