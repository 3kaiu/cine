use sqlx::SqlitePool;
use tokio_cron_scheduler::{Job, JobScheduler};

pub struct SchedulerService {
    scheduler: JobScheduler,
    db: SqlitePool,
}

impl SchedulerService {
    pub async fn new(db: SqlitePool) -> anyhow::Result<Self> {
        let scheduler = JobScheduler::new().await?;
        Ok(Self { scheduler, db })
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        // 示例：每天凌晨 3 点运行扫描清理
        let _db_clone = self.db.clone();
        let job = Job::new_async("0 0 3 * * *", move |_uuid, _l| {
            // let db = _db_clone.clone();
            Box::pin(async move {
                tracing::info!("Running scheduled maintenance task...");
                // 这里可以调用 scanner::run_cleanup etc.
                if let Err(e) = crate::services::empty_dirs::delete_empty_directories(&[]).await {
                    tracing::error!("Scheduled cleanup failed: {}", e);
                }
            })
        })?;

        self.scheduler.add(job).await?;
        self.scheduler.start().await?;

        tracing::info!("Scheduler started");
        Ok(())
    }
}

// 后续可以增加从数据库加载自定义 Cron 任务的逻辑
