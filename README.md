# Cine - 影视文件管理工具

<div align="center">
  <img src="frontend/public/icon.svg" alt="Cine Logo" width="128" height="128">
  
  **一款专为 NAS 用户打造的高性能影视文件管理工具**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
  [![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
</div>

支持大型文件（100GB+）的智能刮削、去重、重命名等功能。

## ✨ 核心功能

### 1. 影视刮削
- 智能识别电影/剧集
- TMDb 元数据获取
- Bangumi 动漫检索
- 规则解析优先，AI 仅兜底
- 自动下载海报、背景图
- 生成 NFO 文件（Kodi/Jellyfin 兼容）
- 批量刮削支持

### 2. 文件去重
- 流式哈希计算（支持 100GB+ 文件）
- 快速哈希（xxHash）和精确哈希（MD5）
- 扫描历史缓存
- 并行哈希计算（多核加速）
- 数据库级分组优化

### 3. 批量重命名
- 剧集命名模板
- 自动识别集数
- 预览确认
- 批量操作

### 4. 文件管理
- 文件移动/复制（支持大文件流式复制）
- 回收站功能（安全删除）
- 批量操作
- 文件列表管理

### 5. 大文件查找
- 按大小筛选
- 可视化展示
- 快速定位

### 6. 空文件夹清理
- 智能分类（缓存、构建产物、系统目录）
- 批量删除
- 深度筛选

## 🚀 技术栈

### 后端
- **Rust** - 系统级性能，内存安全
- **Axum** - 高性能异步 Web 框架
- **Tokio** - 异步运行时
- **SQLx** - 异步 SQL 工具包（SQLite）
- **FFmpeg** - 视频信息提取
- **WebSocket** - 实时进度推送

### 前端
- **React 19** - UI 框架
- **Vite** - 构建工具
- **TypeScript** - 类型安全
- **HeroUI** - UI 组件库
- **原生 WebSocket** - 实时进度客户端
- **React Query** - 数据获取和缓存
- **@tanstack/react-virtual** - 虚拟滚动

## 📊 性能特点

### 后端性能
- **文件扫描**: Criterion 基准下 5000 文件约 `544ms`
- **快速哈希**: 100MB 文件约 `0.93ms`
- **完整哈希**: 100MB 文件约 `137ms`
- **去重查询**: 1000 条记录基准约 `690ms`
- **工程措施**: 流式哈希、SQLite WAL、批处理、候选集预筛选

### 前端性能
- **路由懒加载**: 业务页面按需加载
- **虚拟滚动**: 支持大列表渲染
- **CSS 体积**: 主样式包已从约 `328kB` 降到 `220kB`
- **现状**: 共享 UI 运行时代码仍偏重，仍需继续优化
- **虚拟滚动**: 支持万级数据流畅渲染

### 优化技术
- ✅ 流式处理（避免内存溢出）
- ✅ 异步并发（基于 Tokio）
- ✅ 批量操作（减少数据库交互）
- ✅ 并行计算（充分利用多核）
- ✅ 代码分割（优化前端加载）
- ✅ 请求去重和防抖（减少无效请求）

## 📁 项目结构

```
cine/
├── backend/          # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── handlers/    # API 处理器
│   │   ├── services/    # 业务逻辑
│   │   ├── models/      # 数据模型
│   │   ├── utils/       # 工具函数
│   │   └── websocket/   # WebSocket 处理
│   ├── tests/           # 测试文件
│   │   ├── unit/        # 单元测试
│   │   └── integration/ # 集成测试
│   └── benches/         # 性能测试
├── frontend/         # React 前端
│   ├── src/
│   │   ├── pages/       # 页面组件
│   │   ├── components/  # 通用组件
│   │   ├── api/         # API 客户端
│   │   ├── hooks/       # React Hooks
│   │   └── config/      # 配置文件
│   └── tests/           # 测试文件
│       └── e2e/         # E2E 测试
└── docs/             # 文档
```

## 🛠️ 快速开始

### 环境要求

- **Rust** 1.70+
- **Node.js** 20+
- **FFmpeg** (用于视频信息提取)
- **SQLite** 3.x

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd cine
```

2. **后端设置**
```bash
cd backend
cargo build
```

3. **前端设置**
```bash
cd frontend
npm install
```

4. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，设置基础运行参数
```

5. **启动服务**

终端 1 - 后端:
```bash
cd backend
cargo run
```

终端 2 - 前端:
```bash
cd frontend
npm run dev
```

6. **访问应用**
打开浏览器访问: http://localhost:5173

7. **配置识别与 AI**

后端基础配置走 `.env`，识别相关密钥走应用内“设置”页保存到数据库。

必配项：
- `TMDb API Key`

推荐配置：
- `Bangumi API Key`，用于动漫/番剧补充检索
- `Cloudflare Account ID`
- `Cloudflare API Token`
- `Cloudflare AI Model`

默认策略：
- 规则解析优先
- `TMDb + Bangumi` 双源候选
- `Cloudflare Workers AI` 只在规则和检索结果不足时参与兜底，不直接替代主判定链路
- `ai_budget_mode` 默认 `strict_free`，适合免费额度场景

## 🤖 Identify / AI 接入

这次改造已经把 `media-renamer-ai` 风格的“识别预览 -> 人工审核 -> 批量应用”链路迁入 `cine`，但实现方式保持 `cine` 原有服务化架构，而不是照搬桌面应用模式。

### 识别链路

1. 文件名规则解析
2. 结构化标题、年份、季集信息提取
3. TMDb / Bangumi 检索候选
4. 命中不足时，使用 Cloudflare Workers AI 做轻量补充判断
5. 进入预览任务
6. 在任务页或刮削页审查并批量应用

### 为什么 Cloudflare 免费 AI 只做兜底

- 免费额度有限，不适合做主链路逐文件强依赖
- 文件名识别是高度结构化问题，规则和检索通常更稳定
- AI 输出天然存在漂移，必须被限制在“补充候选”和“辅助 disambiguation”范围
- 这样才能兼顾成本、稳定性和可审计性

### 推荐的 Cloudflare 免费配置

在“设置”页的 AI 配置中填写：

- `cloudflare_account_id`: Cloudflare Account ID
- `cloudflare_api_token`: 具备 Workers AI 调用权限的 API Token
- `cloudflare_ai_model`: 默认 `@cf/meta/llama-3.1-8b-instruct`
- `cloudflare_ai_base_url`: 留空时走默认 Workers AI 地址；若使用 AI Gateway，可填自定义 base URL
- `ai_mode`: 推荐 `assist`
- `ai_budget_mode`: 推荐 `strict_free`
- `ai_daily_budget`: 推荐保守值，例如 `100`

### 配置入口

当前支持两种方式：

- Web UI: 进入“设置”页保存 TMDb / Bangumi / Cloudflare AI 配置
- Settings API: 调用 `/api/settings` 写入 `tmdb_api_key`、`bgm_api_key`、`cloudflare_account_id`、`cloudflare_api_token`、`cloudflare_ai_model`、`cloudflare_ai_base_url`、`ai_mode`、`ai_budget_mode`、`ai_daily_budget`

示例：

```bash
curl -X POST http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{
    "settings": {
      "tmdb_api_key": "your_tmdb_key",
      "bgm_api_key": "your_bangumi_key",
      "cloudflare_account_id": "your_account_id",
      "cloudflare_api_token": "your_cloudflare_token",
      "cloudflare_ai_model": "@cf/meta/llama-3.1-8b-instruct",
      "cloudflare_ai_base_url": "",
      "ai_mode": "assist",
      "ai_budget_mode": "strict_free",
      "ai_daily_budget": "100"
    }
  }'
```

### 任务流入口

- 单文件人工识别预览：刮削页“手动识别”
- 批量识别预览：`/api/identify/preview/batch`
- 批量应用：`/api/identify/apply/batch`
- 兼容旧链路：`/api/scrape` 仍可走自动识别，但内部已经转接到新的 identify 流程

批量识别预览示例：

```bash
curl -X POST http://localhost:3000/api/identify/preview/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "file_ids": ["file-id-1", "file-id-2"],
    "allow_ai": true
  }'
```

批量应用示例：

```bash
curl -X POST http://localhost:3000/api/identify/apply/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "selections": [
      {
        "file_id": "file-id-1",
        "provider": "tmdb",
        "external_id": "12345",
        "media_type": "movie",
        "lock_match": true,
        "download_images": true,
        "generate_nfo": true
      }
    ]
  }'
```

## 🧪 测试

### 运行测试

**后端测试**
```bash
cd backend
cargo test --lib          # 单元测试
cargo test --test '*'     # 集成测试
cargo bench               # 性能测试
```

**前端测试**
```bash
cd frontend
npm test                  # 单元测试
npm run test:e2e          # E2E 测试
```

可使用 `scripts/run_tests.sh` 统一运行后端和前端测试。

## 📦 部署

### 开发环境
见上方"快速开始"部分

### 生产环境
见 [部署指南](DEPLOYMENT.md)

### Docker 部署
```bash
docker-compose up -d
```

默认 `docker-compose.yml` 已切到更适合 NAS 的 `latest-core` 镜像，并默认关闭启动期缓存预热。

如果你明确需要视频探测 / 缩略图 / 更完整的多媒体依赖，再切换为：

```bash
CINE_IMAGE_TAG=latest docker-compose up -d
```

### 飞牛OS (fnOS) 部署
```bash
# 直接使用更保守的 NAS 覆盖配置
docker compose -f docker-compose.yml -f docker-compose.fnos.yml up -d
```

## 📈 性能优化

项目已完成深度性能优化，包括：

- ✅ 文件扫描优化（O(2n) → O(n)）
- ✅ 数据库批量插入（20x 提升）
- ✅ 数据库索引优化（5-10x 提升）
- ✅ 去重算法优化（数据库分组，5-10x 提升）
- ✅ 并行哈希计算（10x 提升）
- ✅ 前端代码分割（50-70% 首屏减少）
- ✅ API 请求去重和防抖（30-50% 请求减少）
- ✅ 虚拟滚动组件（支持万级数据）

### Docker / FNOS 部署建议

- 默认优先使用 `ghcr.io/3kaiu/cine:latest-core`，体积和拉取时间都明显低于 full 镜像
- 只有在需要 `ffmpeg` 缩略图或视频探测能力时再使用 `latest`
- FNOS 首次启动建议保持 `CINE_ENABLE_CACHE_WARMUP=false`，避免容器刚起来就做缓存预热
- 媒体目录很大时，首次真正耗时往往来自扫描和哈希，而不是 HTTP 服务启动本身
- 如果网络到 `ghcr.io` 较差，应优先复用已拉取镜像，避免在 NAS 本机做完整多阶段构建
- `docker-compose.fnos.yml` 额外收紧了日志、健康检查和停止宽限期，更适合 NAS 长期开机环境


## 📝 文档

- [部署指南](DEPLOYMENT.md) - 生产环境部署
- [更新日志](CHANGELOG.md) - 版本更新记录

## 🎯 功能状态

### ✅ 已完成
- 文件扫描和索引
- 流式哈希计算
- 视频信息提取
- 元数据刮削（TMDb）
- 批量重命名
- 文件去重
- 文件移动/复制
- 回收站功能
- 空文件夹清理
- 字幕文件匹配
- 缓存机制
- 性能优化
- 完整测试体系（96+ 测试用例）

### 🚧 进行中
- 前端共享运行时代码瘦身
- fnOS 打包与部署链路完善

### 📋 计划中
- 元数据匹配策略优化
- 部署与监控文档补齐

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## ⚠️ 当前限制

- README 中的性能表述以当前仓库内基准与测试结果为准，不代表所有 NAS 设备上的实际吞吐。
- `scripts/fnpack.sh` 仍处于实验阶段，当前仓库没有经过完整验证的 FNOS 安装闭环。
- 后端当前只提供 API / WebSocket / GraphQL 路由，没有内置静态前端托管，需要额外提供前端静态资源服务。

## 📄 许可证

MIT License

## 🙏 致谢

- [TMDb](https://www.themoviedb.org/) - 元数据来源
- [FFmpeg](https://ffmpeg.org/) - 视频处理
- [HeroUI](https://www.heroui.com/) - UI 组件库

---

**版本**: v1.2.0  
