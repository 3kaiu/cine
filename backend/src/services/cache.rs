use chrono::Utc;
use lru::LruCache;
use serde::{Deserialize, Serialize};
use std::num::NonZeroUsize;
use std::sync::Arc;
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

    /// 删除缓存
    #[allow(dead_code)]
    pub async fn remove(&self, key: &str) {
        let mut data = self.data.write().await;
        data.pop(key);
    }

    /// 清空缓存
    #[allow(dead_code)]
    pub async fn clear(&self) {
        let mut data = self.data.write().await;
        data.clear();
    }

    /// 清理过期项
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

    /// 获取缓存统计
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
        Self {
            cache: MemoryCache::new(10000), // 最多缓存10000个文件
        }
    }

    /// 使用指定容量创建缓存
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

    /// 清理缓存统计
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
