//! 测试辅助函数

/// 设置测试环境
pub fn setup_test_env() {
    // 设置测试日志级别
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug"))
        .try_init();
}
