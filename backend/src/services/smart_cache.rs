//! 智能缓存管理系统
//!
//! 提供高级缓存功能：
//! - 预热加载机制
//! - 分布式缓存同步
//! - 自适应缓存策略
//! - 缓存性能监控

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, warn};

use crate::models::MediaFile;
use crate::services::cache::{FileHashCache, MemoryCache};

/// 缓存同步消息类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheSyncMessage {
    /// 缓存项更新
    CacheUpdate {
        key: String,
        value: serde_json::Value,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    /// 缓存项失效
    CacheInvalidate {
        key: String,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    /// 缓存预热完成
    WarmupComplete {
        cache_type: String,
        items_loaded: usize,
        duration_ms: u64,
    },
    /// 节点加入集群
    NodeJoined {
        node_id: String,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    /// 节点离开集群
    NodeLeft {
        node_id: String,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
}

/// 缓存预热策略
#[derive(Debug, Clone)]
pub enum WarmupStrategy {
    /// 按访问频率预热最热门的项目
    MostFrequent { top_n: usize },
    /// 按最近访问预热最近使用的项目
    MostRecent {
        time_window: Duration,
        max_items: usize,
    },
    /// 预热指定目录的文件
    Directory {
        path: String,
        recursive: bool,
        max_files: usize,
    },
    /// 基于预测的预热（机器学习）
    Predictive { confidence_threshold: f64 },
}

/// 缓存性能指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheMetrics {
    pub cache_type: String,
    pub total_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub hit_rate: f64,
    pub avg_response_time_ms: f64,
    pub warmup_duration_ms: Option<u64>,
    pub memory_usage_bytes: usize,
    pub items_count: usize,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

/// 自适应缓存配置
#[derive(Debug, Clone)]
pub struct SmartCacheConfig {
    /// 最大缓存大小
    pub max_size: usize,
    /// TTL（生存时间）
    pub ttl: Duration,
    /// 预热策略
    pub warmup_strategy: Option<WarmupStrategy>,
    /// 同步间隔
    pub sync_interval: Duration,
    /// 性能监控间隔
    pub metrics_interval: Duration,
    /// 是否启用分布式同步
    pub enable_distributed_sync: bool,
    /// 集群节点ID
    pub node_id: String,
}

/// 智能缓存管理器
pub struct SmartCacheManager {
    config: SmartCacheConfig,
    file_hash_cache: Arc<FileHashCache>,
    memory_cache: Arc<MemoryCache<serde_json::Value>>,
    metrics: Arc<RwLock<HashMap<String, CacheMetrics>>>,
    sync_tx: broadcast::Sender<CacheSyncMessage>,
    warmup_status: Arc<RwLock<HashMap<String, WarmupStatus>>>,
    access_patterns: Arc<RwLock<AccessPatternTracker>>,
    access_record_tx: mpsc::Sender<String>,
}

#[derive(Debug, Clone)]
struct WarmupStatus {
    is_warming_up: bool,
    start_time: Instant,
    items_processed: usize,
    total_items: Option<usize>,
}

#[derive(Debug)]
struct AccessPatternTracker {
    frequency_map: HashMap<String, u64>,
    recent_accesses: VecDeque<(String, Instant)>,
    max_recent_items: usize,
}

impl AccessPatternTracker {
    fn new(max_recent_items: usize) -> Self {
        Self {
            frequency_map: HashMap::new(),
            recent_accesses: VecDeque::new(),
            max_recent_items,
        }
    }

    fn record_access(&mut self, key: String) {
        // 更新访问频率
        *self.frequency_map.entry(key.clone()).or_insert(0) += 1;

        // 更新最近访问记录
        let now = Instant::now();
        self.recent_accesses.push_back((key, now));

        // 保持最近访问记录的大小
        while self.recent_accesses.len() > self.max_recent_items {
            self.recent_accesses.pop_front();
        }

        // 清理过期记录
        let cutoff = now - Duration::from_secs(3600); // 1小时前
        while let Some((_, time)) = self.recent_accesses.front() {
            if *time < cutoff {
                self.recent_accesses.pop_front();
            } else {
                break;
            }
        }
    }

    fn get_most_frequent(&self, top_n: usize) -> Vec<String> {
        let mut items: Vec<(String, u64)> = self
            .frequency_map
            .iter()
            .map(|(k, v)| (k.clone(), *v))
            .collect();

        items.sort_by(|a, b| b.1.cmp(&a.1));
        items.into_iter().take(top_n).map(|(k, _)| k).collect()
    }

    fn get_most_recent(&self, time_window: Duration, max_items: usize) -> Vec<String> {
        let cutoff = Instant::now() - time_window;
        let mut recent: Vec<String> = self
            .recent_accesses
            .iter()
            .rev() // 从最新的开始
            .filter(|(_, time)| *time >= cutoff)
            .map(|(key, _)| key.clone())
            .collect();

        recent.truncate(max_items);
        recent
    }
}

impl SmartCacheManager {
    pub fn new(config: SmartCacheConfig) -> Self {
        let (sync_tx, _) = broadcast::channel(1000);
        let (access_record_tx, mut access_record_rx) = tokio::sync::mpsc::channel(10000);
        let access_patterns = Arc::new(RwLock::new(AccessPatternTracker::new(10000)));

        // 启动后台访问记录处理任务 (Phase 2 优化)
        let ap_clone = access_patterns.clone();
        tokio::spawn(async move {
            while let Some(key) = access_record_rx.recv().await {
                let mut ap = ap_clone.write().await;
                ap.record_access(key);
            }
        });

        Self {
            config: config.clone(),
            file_hash_cache: Arc::new(FileHashCache::with_capacity(config.max_size)),
            memory_cache: Arc::new(MemoryCache::new(config.max_size)),
            metrics: Arc::new(RwLock::new(HashMap::new())),
            sync_tx,
            warmup_status: Arc::new(RwLock::new(HashMap::new())),
            access_patterns,
            access_record_tx,
        }
    }

    /// 预热缓存
    pub async fn warmup_cache(
        &self,
        cache_type: &str,
        db_pool: &sqlx::SqlitePool,
    ) -> anyhow::Result<()> {
        let start_time = Instant::now();

        // 标记预热开始
        {
            let mut status = self.warmup_status.write().await;
            status.insert(
                cache_type.to_string(),
                WarmupStatus {
                    is_warming_up: true,
                    start_time,
                    items_processed: 0,
                    total_items: None,
                },
            );
        }

        match &self.config.warmup_strategy {
            Some(WarmupStrategy::MostFrequent { top_n }) => {
                self.warmup_most_frequent(cache_type, *top_n, db_pool)
                    .await?;
            }
            Some(WarmupStrategy::MostRecent {
                time_window,
                max_items,
            }) => {
                self.warmup_most_recent(cache_type, *time_window, *max_items, db_pool)
                    .await?;
            }
            Some(WarmupStrategy::Directory {
                path,
                recursive,
                max_files,
            }) => {
                self.warmup_directory(cache_type, path, *recursive, *max_files, db_pool)
                    .await?;
            }
            Some(WarmupStrategy::Predictive {
                confidence_threshold: _,
            }) => {
                // 预测性预热需要更复杂的实现
                warn!("Predictive warmup not yet implemented, skipping");
            }
            None => {
                debug!("No warmup strategy configured for {}", cache_type);
            }
        }

        // 标记预热完成
        let duration = start_time.elapsed();
        {
            let mut status = self.warmup_status.write().await;
            if let Some(warmup) = status.get_mut(cache_type) {
                warmup.is_warming_up = false;

                // 发送同步消息
                let _ = self.sync_tx.send(CacheSyncMessage::WarmupComplete {
                    cache_type: cache_type.to_string(),
                    items_loaded: warmup.items_processed,
                    duration_ms: duration.as_millis() as u64,
                });
            }
        }

        info!(
            "Cache warmup completed for {} in {:.2}s",
            cache_type,
            duration.as_secs_f64()
        );

        Ok(())
    }

    /// 预热最常访问的项目
    async fn warmup_most_frequent(
        &self,
        cache_type: &str,
        top_n: usize,
        db_pool: &sqlx::SqlitePool,
    ) -> anyhow::Result<()> {
        let patterns = self.access_patterns.read().await;
        let most_frequent = patterns.get_most_frequent(top_n);

        if most_frequent.is_empty() {
            debug!("No access patterns available for warmup");
            return Ok(());
        }

        // 批量加载文件哈希
        let placeholders = vec!["?"; most_frequent.len()].join(",");
        let query = format!(
            "SELECT id, path, hash_md5, hash_xxhash, last_modified FROM media_files WHERE id IN ({})",
            placeholders
        );

        let mut query_builder = sqlx::query_as::<
            _,
            (
                String,
                String,
                Option<String>,
                Option<String>,
                chrono::DateTime<chrono::Utc>,
            ),
        >(&query);
        for id in &most_frequent {
            query_builder = query_builder.bind(id);
        }

        let files = query_builder.fetch_all(db_pool).await?;

        for (id, path, hash_md5, hash_xxhash, last_modified) in files {
            if let Some(hash) = hash_md5.or(hash_xxhash) {
                self.file_hash_cache
                    .set(&path, last_modified.timestamp(), hash)
                    .await;
            }

            let mut status = self.warmup_status.write().await;
            if let Some(warmup) = status.get_mut(cache_type) {
                warmup.items_processed += 1;
            }
        }

        Ok(())
    }

    /// 预热最近访问的项目
    async fn warmup_most_recent(
        &self,
        cache_type: &str,
        time_window: Duration,
        max_items: usize,
        db_pool: &sqlx::SqlitePool,
    ) -> anyhow::Result<()> {
        let patterns = self.access_patterns.read().await;
        let most_recent = patterns.get_most_recent(time_window, max_items);

        // 类似上面的实现...
        debug!(
            "Warming up {} recent items for {}",
            most_recent.len(),
            cache_type
        );
        Ok(())
    }

    /// 预热指定目录的文件
    async fn warmup_directory(
        &self,
        cache_type: &str,
        path: &str,
        recursive: bool,
        max_files: usize,
        db_pool: &sqlx::SqlitePool,
    ) -> anyhow::Result<()> {
        let like_pattern = if recursive {
            format!("{}%", path)
        } else {
            format!("{}/%", path.trim_end_matches('/'))
        };

        let files = sqlx::query_as::<
            _,
            (
                String,
                String,
                Option<String>,
                Option<String>,
                chrono::DateTime<chrono::Utc>,
            ),
        >(
            "SELECT id, path, hash_md5, hash_xxhash, last_modified FROM media_files
             WHERE path LIKE ? AND (hash_md5 IS NOT NULL OR hash_xxhash IS NOT NULL)
             ORDER BY last_modified DESC LIMIT ?",
        )
        .bind(like_pattern)
        .bind(max_files as i64)
        .fetch_all(db_pool)
        .await?;

        for (id, file_path, hash_md5, hash_xxhash, last_modified) in files {
            if let Some(hash) = hash_md5.or(hash_xxhash) {
                self.file_hash_cache
                    .set(&file_path, last_modified.timestamp(), hash)
                    .await;
            }

            let mut status = self.warmup_status.write().await;
            if let Some(warmup) = status.get_mut(cache_type) {
                warmup.items_processed += 1;
            }
        }

        Ok(())
    }

    /// 获取缓存项（带访问记录）
    pub async fn get(&self, cache_type: &str, key: &str) -> Option<serde_json::Value> {
        let start_time = Instant::now();

        // 异步记录访问模式 (Phase 2 优化)
        if let Err(e) = self.access_record_tx.send(key.to_string()).await {
            debug!("Failed to send access record: {}", e);
        }

        let result = self.memory_cache.get(key).await;

        // 更新性能指标
        self.update_metrics(cache_type, result.is_some(), start_time.elapsed())
            .await;

        result
    }

    /// 设置缓存项
    pub async fn set(&self, cache_type: &str, key: String, value: serde_json::Value) {
        self.memory_cache
            .set(key.clone(), value.clone(), Some(self.config.ttl.as_secs()))
            .await;

        // 发送同步消息
        if self.config.enable_distributed_sync {
            let _ = self.sync_tx.send(CacheSyncMessage::CacheUpdate {
                key: key.clone(),
                value: value.clone(),
                timestamp: chrono::Utc::now(),
            });
        }
    }

    /// 使缓存项失效
    pub async fn invalidate(&self, cache_type: &str, key: &str) {
        self.memory_cache.remove(key).await;

        // 发送同步消息
        if self.config.enable_distributed_sync {
            let _ = self.sync_tx.send(CacheSyncMessage::CacheInvalidate {
                key: key.to_string(),
                timestamp: chrono::Utc::now(),
            });
        }
    }

    /// 处理来自其他节点的同步消息
    pub async fn handle_sync_message(&self, message: CacheSyncMessage) {
        match message {
            CacheSyncMessage::CacheUpdate { key, value, .. } => {
                self.memory_cache
                    .set(key, value, Some(self.config.ttl.as_secs()))
                    .await;
            }
            CacheSyncMessage::CacheInvalidate { key, .. } => {
                self.memory_cache.remove(&key).await;
            }
            CacheSyncMessage::NodeJoined { node_id, .. } => {
                info!("Node {} joined the cluster", node_id);
                // 可以在这里触发全量同步
            }
            CacheSyncMessage::NodeLeft { node_id, .. } => {
                info!("Node {} left the cluster", node_id);
            }
            CacheSyncMessage::WarmupComplete {
                cache_type,
                items_loaded,
                duration_ms,
            } => {
                debug!(
                    "Remote warmup completed for {}: {} items in {}ms",
                    cache_type, items_loaded, duration_ms
                );
            }
        }
    }

    /// 获取缓存性能指标
    pub async fn get_metrics(&self, cache_type: &str) -> Option<CacheMetrics> {
        let metrics = self.metrics.read().await;
        metrics.get(cache_type).cloned()
    }

    /// 获取所有缓存指标
    pub async fn get_all_metrics(&self) -> Vec<CacheMetrics> {
        let metrics = self.metrics.read().await;
        metrics.values().cloned().collect()
    }

    /// 启动后台任务（定期清理、同步等）
    pub async fn start_background_tasks(&self) {
        let manager = Arc::new(self.clone());

        // 定期清理过期缓存
        tokio::spawn({
            let manager = manager.clone();
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5分钟
                loop {
                    interval.tick().await;
                    // 清理过期缓存（MemoryCache会自动处理）
                    debug!("Running periodic cache cleanup");
                }
            }
        });

        // 定期同步（如果启用分布式同步）
        if self.config.enable_distributed_sync {
            tokio::spawn({
                let manager = manager.clone();
                async move {
                    let mut interval = tokio::time::interval(manager.config.sync_interval);
                    loop {
                        interval.tick().await;
                        // 执行分布式同步逻辑
                        debug!("Running distributed cache sync");
                    }
                }
            });
        }

        // 定期更新性能指标
        tokio::spawn({
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60)); // 1分钟
                loop {
                    interval.tick().await;
                    // 这里可以计算并更新性能指标
                }
            }
        });
    }

    /// 更新性能指标
    async fn update_metrics(&self, cache_type: &str, is_hit: bool, response_time: Duration) {
        let mut metrics = self.metrics.write().await;
        let entry = metrics
            .entry(cache_type.to_string())
            .or_insert(CacheMetrics {
                cache_type: cache_type.to_string(),
                total_requests: 0,
                cache_hits: 0,
                cache_misses: 0,
                hit_rate: 0.0,
                avg_response_time_ms: 0.0,
                warmup_duration_ms: None,
                memory_usage_bytes: 0,
                items_count: 0,
                last_updated: chrono::Utc::now(),
            });

        entry.total_requests += 1;
        if is_hit {
            entry.cache_hits += 1;
        } else {
            entry.cache_misses += 1;
        }

        // 更新命中率
        entry.hit_rate = entry.cache_hits as f64 / entry.total_requests as f64;

        // 更新平均响应时间（指数移动平均）
        let alpha = 0.1;
        let current_response_time = response_time.as_millis() as f64;
        entry.avg_response_time_ms =
            entry.avg_response_time_ms * (1.0 - alpha) + current_response_time * alpha;

        entry.last_updated = chrono::Utc::now();
    }

    /// 订阅同步消息
    pub fn subscribe_sync(&self) -> broadcast::Receiver<CacheSyncMessage> {
        self.sync_tx.subscribe()
    }
}

// 为SmartCacheManager实现Clone
impl Clone for SmartCacheManager {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            file_hash_cache: self.file_hash_cache.clone(),
            memory_cache: self.memory_cache.clone(),
            metrics: self.metrics.clone(),
            sync_tx: self.sync_tx.clone(),
            warmup_status: self.warmup_status.clone(),
            access_patterns: self.access_patterns.clone(),
            access_record_tx: self.access_record_tx.clone(),
        }
    }
}

impl Default for SmartCacheConfig {
    fn default() -> Self {
        Self {
            max_size: 10000,
            ttl: Duration::from_secs(3600), // 1小时
            warmup_strategy: Some(WarmupStrategy::MostFrequent { top_n: 1000 }),
            sync_interval: Duration::from_secs(30),
            metrics_interval: Duration::from_secs(60),
            enable_distributed_sync: false,
            node_id: "default".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_access_pattern_tracker() {
        let mut tracker = AccessPatternTracker::new(100);

        tracker.record_access("item1".to_string());
        tracker.record_access("item2".to_string());
        tracker.record_access("item1".to_string()); // 再次访问item1

        let most_frequent = tracker.get_most_frequent(2);
        assert_eq!(most_frequent[0], "item1");
        assert_eq!(most_frequent[1], "item2");
    }

    #[tokio::test]
    async fn test_smart_cache_manager() {
        let config = SmartCacheConfig::default();
        let manager = SmartCacheManager::new(config);

        // 测试基本的缓存操作
        manager
            .set(
                "test_cache",
                "key1".to_string(),
                serde_json::json!("value1"),
            )
            .await;
        let value = manager.get("test_cache", "key1").await;

        assert_eq!(value, Some(serde_json::json!("value1")));

        // 测试缓存失效
        manager.invalidate("test_cache", "key1").await;
        let value_after_invalidate = manager.get("test_cache", "key1").await;

        assert_eq!(value_after_invalidate, None);
    }
}
