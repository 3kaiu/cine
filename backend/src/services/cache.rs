use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;
use serde::{Deserialize, Serialize};

/// 缓存项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheItem<T> {
    pub key: String,
    pub value: T,
    pub expires_at: Option<chrono::DateTime<Utc>>,
    pub created_at: chrono::DateTime<Utc>,
}

/// 内存缓存
pub struct MemoryCache<T> {
    data: Arc<RwLock<HashMap<String, CacheItem<T>>>>,
    max_size: usize,
}

impl<T: Clone> MemoryCache<T> {
    pub fn new(max_size: usize) -> Self {
        Self {
            data: Arc::new(RwLock::new(HashMap::new())),
            max_size,
        }
    }

    /// 获取缓存
    pub async fn get(&self, key: &str) -> Option<T> {
        let data = self.data.read().await;
        if let Some(item) = data.get(key) {
            // 检查是否过期
            if let Some(expires_at) = item.expires_at {
                if Utc::now() > expires_at {
                    drop(data);
                    // 异步删除过期项
                    let mut data = self.data.write().await;
                    data.remove(key);
                    return None;
                }
            }
            return Some(item.value.clone());
        }
        None
    }

    /// 设置缓存
    pub async fn set(&self, key: String, value: T, ttl_seconds: Option<u64>) {
        let expires_at = ttl_seconds.map(|ttl| Utc::now() + chrono::Duration::seconds(ttl as i64));
        
        let item = CacheItem {
            key: key.clone(),
            value,
            expires_at,
            created_at: Utc::now(),
        };

        let mut data = self.data.write().await;

        // 如果超过最大大小，删除最旧的项
        if data.len() >= self.max_size && !data.contains_key(&key) {
            if let Some(oldest_key) = data.iter()
                .min_by_key(|(_, item)| item.created_at)
                .map(|(k, _)| k.clone()) {
                data.remove(&oldest_key);
            }
        }

        data.insert(key, item);
    }

    /// 删除缓存
    pub async fn remove(&self, key: &str) {
        let mut data = self.data.write().await;
        data.remove(key);
    }

    /// 清空缓存
    pub async fn clear(&self) {
        let mut data = self.data.write().await;
        data.clear();
    }

    /// 清理过期项
    pub async fn cleanup_expired(&self) -> usize {
        let now = Utc::now();
        let mut data = self.data.write().await;
        let mut removed = 0;

        data.retain(|_, item| {
            if let Some(expires_at) = item.expires_at {
                if now > expires_at {
                    removed += 1;
                    return false;
                }
            }
            true
        });

        removed
    }

    /// 获取缓存统计
    pub async fn stats(&self) -> CacheStats {
        let data = self.data.read().await;
        let total = data.len();
        let expired = data.values()
            .filter(|item| {
                if let Some(expires_at) = item.expires_at {
                    Utc::now() > expires_at
                } else {
                    false
                }
            })
            .count();

        CacheStats {
            total,
            expired,
            active: total - expired,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total: usize,
    pub active: usize,
    pub expired: usize,
}

/// 文件哈希缓存（基于文件路径和修改时间）
pub struct FileHashCache {
    cache: MemoryCache<String>, // key: path, value: hash
}

impl FileHashCache {
    pub fn new() -> Self {
        Self {
            cache: MemoryCache::new(10000), // 最多缓存10000个文件
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
    pub async fn stats(&self) -> CacheStats {
        self.cache.stats().await
    }
}

impl Default for FileHashCache {
    fn default() -> Self {
        Self::new()
    }
}
