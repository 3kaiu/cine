# Cine - 影视文件刮削工具

<div align="center">
  <img src="frontend/public/icon.svg" alt="Cine Logo" width="128" height="128">
  
  **一款专为 NAS 用户打造的高性能影视文件管理工具**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
  [![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
</div>

支持大型文件（100GB+）的智能刮削、去重、重命名等功能。

## ✨ 核心功能

### 1. 影视刮削
- 智能识别电影/剧集
- TMDB/豆瓣元数据获取
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
- **React 18** - UI 框架
- **Vite** - 构建工具
- **TypeScript** - 类型安全
- **Ant Design** - UI 组件库
- **Socket.io-client** - WebSocket 客户端
- **React Query** - 数据获取和缓存
- **react-window** - 虚拟滚动

## 📊 性能特点

### 后端性能
- **文件扫描**: 5000+ 文件/秒（5x 提升）
- **数据库插入**: 20000+ 条/秒（20x 提升）
- **数据库查询**: 5-10x 提升（索引优化）
- **去重查询**: 1-2秒（10万文件，5-10x 提升）
- **哈希计算**: 500MB/秒（多核，10x 提升）

### 前端性能
- **首屏加载**: 0.5-1秒（3x 提升）
- **代码分割**: 50-70% 首屏减少
- **请求优化**: 30-50% 请求减少
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
- **Node.js** 18+
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
# 编辑 .env 文件，设置 TMDB_API_KEY
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

详细说明请查看 [测试报告](TEST_REPORT.md)

## 📦 部署

### 开发环境
见上方"快速开始"部分

### 生产环境
见 [部署指南](DEPLOYMENT.md)

### Docker 部署
```bash
docker-compose up -d
```

### 飞牛OS (fnOS) 部署
```bash
# 使用 fnpack 打包
./scripts/fnpack.sh
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


## 📝 文档

- [部署指南](DEPLOYMENT.md) - 生产环境部署
- [测试报告](TEST_REPORT.md) - 测试覆盖和执行情况
- [项目状态](PROJECT_STATUS.md) - 项目当前状态
- [更新日志](CHANGELOG.md) - 版本更新记录

## 🎯 功能状态

### ✅ 已完成
- 文件扫描和索引
- 流式哈希计算
- 视频信息提取
- 元数据刮削（TMDB）
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
- 虚拟滚动集成到页面

### 📋 计划中
- 任务队列系统
- 分布式处理支持
- 插件系统

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [TMDB](https://www.themoviedb.org/) - 元数据来源
- [FFmpeg](https://ffmpeg.org/) - 视频处理
- [Ant Design](https://ant.design/) - UI 组件库

---

**版本**: v1.2.0  
