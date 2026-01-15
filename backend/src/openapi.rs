//! OpenAPI 文档配置
//!
//! 提供 Swagger UI 和 OpenAPI 规范

use utoipa::OpenApi;

/// API 文档（基础版本）
///
/// 包含核心模型的 Schema 定义，用于 Swagger UI 展示。
/// 后续可逐步添加各 handler 的 path 注解以完善文档。
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Cine API",
        version = "1.2.0",
        description = "Cine - 高性能影视文件管理工具 API\n\n## 功能模块\n- 文件扫描和索引\n- 元数据刮削（TMDB）\n- 文件去重\n- 批量重命名\n- 回收站管理",
        license(name = "MIT"),
        contact(name = "Cine Team")
    ),
    servers(
        (url = "/api", description = "本地服务器")
    ),
    components(schemas(
        crate::models::MediaFile,
        crate::models::VideoInfo,
        crate::models::AudioStreamInfo,
        crate::models::SubtitleStreamInfo,
        crate::models::MovieMetadata,
        crate::models::TVShowMetadata,
        crate::models::SeasonInfo,
        crate::models::DuplicateGroup,
        crate::models::DuplicateMovieGroup,
        crate::models::OperationLog,
        crate::models::ScanHistory,
        crate::models::WatchFolder,
        crate::models::Setting,
    )),
    tags(
        (name = "scan", description = "文件扫描 - 扫描目录并索引媒体文件"),
        (name = "hash", description = "哈希计算 - 计算文件哈希用于去重"),
        (name = "video", description = "视频信息 - 提取视频元数据"),
        (name = "subtitle", description = "字幕管理 - 查找和匹配字幕文件"),
        (name = "scrape", description = "元数据刮削 - 从 TMDB 获取元数据"),
        (name = "rename", description = "批量重命名 - 按模板重命名文件"),
        (name = "dedupe", description = "文件去重 - 查找重复文件"),
        (name = "file_ops", description = "文件操作 - 移动/复制文件"),
        (name = "trash", description = "回收站 - 安全删除和恢复文件"),
        (name = "log", description = "操作日志 - 查看和撤销操作"),
        (name = "settings", description = "系统设置 - 配置应用参数"),
    )
)]
pub struct ApiDoc;

/// 获取 OpenAPI JSON 规范
pub fn openapi_json() -> String {
    ApiDoc::openapi().to_json().unwrap()
}
