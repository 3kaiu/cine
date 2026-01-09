//! 计划任务服务测试

use cine_backend::services::scheduler::SchedulerService;

#[tokio::test]
async fn test_scheduler_service_init() {
    let (db_pool, _temp_db) = crate::common::create_test_db().await;

    let result = SchedulerService::new(db_pool).await;
    assert!(result.is_ok());

    let service = result.unwrap();
    let start_result = service.start().await;
    assert!(start_result.is_ok());
}
