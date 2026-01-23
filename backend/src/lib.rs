//! Cine Backend Library
//! 
//! 这个库模块用于支持测试和作为库使用

pub mod api_version;
pub mod business_metrics;
pub mod config;
pub mod graphql;
pub mod handlers;
pub mod models;
pub mod services;
pub mod utils;
pub mod websocket;
pub mod error;
pub mod queries;

// 重新导出常用类型
pub use config::AppConfig;
pub use handlers::AppState;
pub use models::*;
pub use error::{AppError, AppResult};
