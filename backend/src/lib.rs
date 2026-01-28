//! Cine Backend Library
//!
//! 这个库模块用于支持测试和作为库使用

pub mod api_version;
pub mod config;
pub mod error;
pub mod graphql;
pub mod handlers;
pub mod models;
pub mod openapi;
pub mod services;
pub mod utils;
pub mod websocket;

// 重新导出常用类型
pub use config::AppConfig;
pub use error::{AppError, AppResult};
pub use handlers::AppState;
pub use models::*;
