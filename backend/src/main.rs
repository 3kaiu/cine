use clap::{Parser, ValueEnum};

use cine_backend::bootstrap::{run_master, run_worker, BootstrapContext};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(short, long, value_enum, default_value_t = RunMode::Master)]
    mode: RunMode,

    #[arg(long, default_value = "http://127.0.0.1:3000")]
    master_url: String,

    #[arg(long)]
    node_id: Option<String>,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
enum RunMode {
    Master,
    Worker,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    // 初始化日志，使用配置中的日志级别
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cine=info,axum=info".into()),
        )
        .init();

    let ctx = BootstrapContext::new().await?;
    tracing::info!("Configuration and services initialized successfully");

    match cli.mode {
        RunMode::Master => {
            run_master(ctx).await?;
        }
        RunMode::Worker => {
            run_worker(cli.node_id, cli.master_url, ctx).await?;
        }
    }

    Ok(())
}
