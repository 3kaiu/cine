use cine_backend::services::cache::{MemoryCache, FileHashCache};
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
async fn test_memory_cache_basic() {
    let cache = MemoryCache::<String>::new(100);
    
    // 设置和获取
    cache.set("key1".to_string(), "value1".to_string(), None).await;
    let value = cache.get("key1").await;
    assert_eq!(value, Some("value1".to_string()));
    
    // 不存在的键
    let value = cache.get("nonexistent").await;
    assert!(value.is_none());
}

#[tokio::test]
async fn test_memory_cache_expiration() {
    let cache = MemoryCache::<String>::new(100);
    
    // 设置带过期时间的缓存
    cache.set("key1".to_string(), "value1".to_string(), Some(1)).await;
    
    // 立即获取应该存在
    let value = cache.get("key1").await;
    assert_eq!(value, Some("value1".to_string()));
    
    // 等待过期
    sleep(Duration::from_secs(2)).await;
    
    // 应该已过期
    let value = cache.get("key1").await;
    assert!(value.is_none());
}

#[tokio::test]
async fn test_memory_cache_max_size() {
    let cache = MemoryCache::<String>::new(3);
    
    // 添加超过最大大小的项
    cache.set("key1".to_string(), "value1".to_string(), None).await;
    cache.set("key2".to_string(), "value2".to_string(), None).await;
    cache.set("key3".to_string(), "value3".to_string(), None).await;
    cache.set("key4".to_string(), "value4".to_string(), None).await;
    
    // 最旧的项应该被删除
    let value = cache.get("key1").await;
    assert!(value.is_none());
    
    // 新的项应该存在
    assert_eq!(cache.get("key4").await, Some("value4".to_string()));
}

#[tokio::test]
async fn test_file_hash_cache() {
    let cache = FileHashCache::new();
    
    let path = "/test/path/file.mp4";
    let mtime = 1234567890;
    let hash = "test_hash_value";
    
    // 设置缓存
    cache.set(path, mtime, hash.to_string()).await;
    
    // 获取缓存
    let cached = cache.get(path, mtime).await;
    assert_eq!(cached, Some(hash.to_string()));
    
    // 不同的修改时间应该返回 None
    let cached = cache.get(path, mtime + 1).await;
    assert!(cached.is_none());
}

#[tokio::test]
async fn test_cache_cleanup() {
    let cache = MemoryCache::<String>::new(100);
    
    // 添加一些带过期时间的项
    cache.set("key1".to_string(), "value1".to_string(), Some(1)).await;
    cache.set("key2".to_string(), "value2".to_string(), None).await;
    
    sleep(Duration::from_secs(2)).await;
    
    // 清理过期项
    let removed = cache.cleanup_expired().await;
    assert!(removed > 0);
    
    // 验证过期项已删除
    assert!(cache.get("key1").await.is_none());
    // 未过期的项应该还在
    assert_eq!(cache.get("key2").await, Some("value2".to_string()));
}
