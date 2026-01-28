use chrono::Utc;
use lru::LruCache;
use serde::{Deserialize, Serialize};
use std::num::NonZeroUsize;
use std::sync::Arc;
use sysinfo::System;
use tokio::sync::RwLock;

/// 缓存项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheItem<T> {
    pub value: T,
    pub expires_at: Option<chrono::DateTime<Utc>>,
    pub created_at: chrono::DateTime<Utc>,
}

/// 内存缓存（基于真正的 LRU 算法）
pub struct MemoryCache<T> {
    data: Arc<RwLock<LruCache<String, CacheItem<T>>>>,
}

impl<T: Clone> MemoryCache<T> {
    pub fn new(max_size: usize) -> Self {
        let cap = NonZeroUsize::new(max_size).unwrap_or(NonZeroUsize::new(1000).unwrap());
        Self {
            data: Arc::new(RwLock::new(LruCache::new(cap))),
        }
    }

    /// 获取缓存（自动 promote 为最近使用）
    pub async fn get(&self, key: &str) -> Option<T> {
        let mut data = self.data.write().await;
        if let Some(item) = data.get(key) {
            // 检查是否过期
            if let Some(expires_at) = item.expires_at {
                if Utc::now() > expires_at {
                    data.pop(key);
                    return None;
                }
            }
            return Some(item.value.clone());
        }
        None
    }

    /// 设置缓存（LRU 自动淘汰最久未使用的项）
    pub async fn set(&self, key: String, value: T, ttl_seconds: Option<u64>) {
        let expires_at = ttl_seconds.map(|ttl| Utc::now() + chrono::Duration::seconds(ttl as i64));

        let item = CacheItem {
            value,
            expires_at,
            created_at: Utc::now(),
        };

        let mut data = self.data.write().await;
        data.put(key, item);
    }

    /// 删除指定键的缓存项
    ///
    /// # 用途
    /// 用于主动失效特定缓存，例如文件被删除时清理对应缓存
    #[allow(dead_code)]
    pub async fn remove(&self, key: &str) {
        let mut data = self.data.write().await;
        data.pop(key);
    }

    /// 清空所有缓存项
    ///
    /// # 用途
    /// 用于重置缓存状态，例如配置变更后需要刷新缓存
    #[allow(dead_code)]
    pub async fn clear(&self) {
        let mut data = self.data.write().await;
        data.clear();
    }

    /// 清理过期缓存项
    ///
    /// # 返回值
    /// 返回被清理的过期项数量
    ///
    /// # 用途
    /// 可由定时任务调用，定期清理过期缓存以释放内存
    #[allow(dead_code)]
    pub async fn cleanup_expired(&self) -> usize {
        let now = Utc::now();
        let mut data = self.data.write().await;
        let mut removed = 0;

        // 收集需要删除的 key
        let expired_keys: Vec<String> = data
            .iter()
            .filter_map(|(k, item)| {
                if let Some(expires_at) = item.expires_at {
                    if now > expires_at {
                        return Some(k.clone());
                    }
                }
                None
            })
            .collect();

        for key in expired_keys {
            data.pop(&key);
            removed += 1;
        }

        removed
    }

    /// 获取缓存统计信息
    ///
    /// # 返回值
    /// 包含缓存总数、容量和使用率的统计信息
    ///
    /// # 用途
    /// 用于监控和诊断缓存使用情况
    #[allow(dead_code)]
    pub async fn stats(&self) -> CacheStats {
        let data = self.data.read().await;
        let total = data.len();
        let cap = data.cap().get();

        CacheStats {
            total,
            capacity: cap,
            usage_percent: if cap > 0 {
                (total as f64 / cap as f64) * 100.0
            } else {
                0.0
            },
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total: usize,
    pub capacity: usize,
    pub usage_percent: f64,
}

/// 文件哈希缓存（基于文件路径和修改时间）
pub struct FileHashCache {
    cache: MemoryCache<String>, // key: path:mtime, value: hash
}

impl FileHashCache {
    pub fn new() -> Self {
        // 基于可用内存动态调整缓存大小
        let cache_size = Self::calculate_optimal_cache_size();
        Self {
            cache: MemoryCache::new(cache_size),
        }
    }

    /// 根据系统可用内存计算最优缓存大小
    fn calculate_optimal_cache_size() -> usize {
        let mut sys = System::new_all();
        sys.refresh_all();

        let available_memory = sys.available_memory() as u64;

        // 为哈希缓存分配可用内存的5%，每个缓存项大约200字节
        let cache_memory_mb = (available_memory / 1024 / 1024) as usize / 20; // 5%
        let estimated_entries = (cache_memory_mb * 1024 * 1024) / 200; // 每项约200字节

        // 限制在合理范围内
        estimated_entries.clamp(1000, 50000)
    }

    /// 使用指定容量创建缓存
    ///
    /// # 参数
    /// - `max_size`: 最大缓存条目数
    ///
    /// # 用途
    /// 在需要调整缓存大小时使用，例如根据系统内存动态调整
    #[allow(dead_code)]
    pub fn with_capacity(max_size: usize) -> Self {
        Self {
            cache: MemoryCache::new(max_size),
        }
    }

    /// 生成缓存键（路径 + 修改时间）
    pub fn cache_key(path: &str, mtime: i64) -> String {
        format!("{}:{}", path, mtime)
    }

    /// 获取缓存的哈希值
    pub async fn get(&self, path: &str, mtime: i64) -> Option<String> {
        let key = Self::cache_key(path, mtime);
        self.cache.get(&key).await
    }

    /// 设置哈希值缓存（不过期，除非文件修改）
    pub async fn set(&self, path: &str, mtime: i64, hash: String) {
        let key = Self::cache_key(path, mtime);
        // 不设置过期时间，因为文件修改时间变化时键会不同
        self.cache.set(key, hash, None).await;
    }

    /// 获取文件哈希缓存统计信息
    ///
    /// # 用途
    /// 用于监控哈希缓存命中率和容量使用情况
    #[allow(dead_code)]
    pub async fn stats(&self) -> CacheStats {
        self.cache.stats().await
    }
}

impl Default for FileHashCache {
    fn default() -> Self {
        Self::new()
    }
}
