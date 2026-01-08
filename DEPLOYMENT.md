# 部署指南

## 环境要求

### 系统要求
- Linux/macOS/Windows
- 支持的文件系统：ext4, NTFS, exFAT 等

### 软件依赖

#### 后端
- **Rust** 1.70+ ([安装指南](https://www.rust-lang.org/tools/install))
- **SQLite** 3.x
- **FFmpeg** (用于视频信息提取)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install ffmpeg
  
  # macOS
  brew install ffmpeg
  
  # Windows
  # 从 https://ffmpeg.org/download.html 下载
  ```

#### 前端
- **Node.js** 18+ ([下载](https://nodejs.org/))
- **npm** 或 **pnpm**

## 开发环境部署

### 1. 克隆项目

```bash
git clone <repository-url>
cd cine
```

### 2. 后端设置

```bash
cd backend

# 安装 Rust 依赖（首次运行会自动下载）
cargo build

# 配置环境变量
cp ../.env.example .env
# 编辑 .env 文件，设置 TMDB_API_KEY 等配置

# 运行开发服务器
cargo run
```

后端将在 `http://localhost:3000` 启动

### 3. 前端设置

```bash
cd frontend

# 安装依赖
npm install
# 或
pnpm install

# 启动开发服务器
npm run dev
# 或
pnpm dev
```

前端将在 `http://localhost:5173` 启动

## 生产环境部署

### 1. 构建后端

```bash
cd backend

# Release 模式构建（优化性能）
cargo build --release

# 可执行文件位置
# target/release/cine-backend
```

### 2. 构建前端

```bash
cd frontend

# 构建生产版本
npm run build
# 或
pnpm build

# 构建产物在 dist/ 目录
```

### 3. 运行生产服务器

#### 方式一：直接运行

```bash
# 设置环境变量
export PORT=3000
export DATABASE_URL=sqlite:./data/cine.db
export TMDB_API_KEY=your_api_key

# 运行后端
./target/release/cine-backend

# 前端可以使用 Nginx 等 Web 服务器部署
```

#### 方式二：使用 systemd (Linux)

创建服务文件 `/etc/systemd/system/media-toolbox.service`:

```ini
[Unit]
Description=Cine Backend
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/cine/backend
ExecStart=/path/to/cine/backend/target/release/cine-backend
Environment="PORT=3000"
Environment="DATABASE_URL=sqlite:/path/to/data/cine.db"
Environment="TMDB_API_KEY=your_api_key"
Restart=always

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl enable media-toolbox
sudo systemctl start media-toolbox
```

#### 方式三：使用 Docker

创建 `Dockerfile`:

```dockerfile
FROM rust:1.70 as builder
WORKDIR /app
COPY backend/ .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/media-toolbox-backend .
CMD ["./media-toolbox-backend"]
```

构建和运行：

```bash
docker build -t media-toolbox .
docker run -d \
  -p 3000:3000 \
  -v /path/to/data:/app/data \
  -v /path/to/media:/app/media \
  -e TMDB_API_KEY=your_api_key \
  media-toolbox
```

### 4. Nginx 配置（前端）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/cine/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 飞牛OS (fnOS) 部署

### 1. 准备 fpk 包

```bash
# 创建打包目录
mkdir -p app/{frontend,backend,config}

# 复制后端可执行文件
cp backend/target/release/media-toolbox-backend app/backend/

# 复制前端构建产物
cp -r frontend/dist/* app/frontend/

# 创建配置文件
cat > app/config/privilege <<EOF
{
    "defaults": {
        "run-as": "root"
    },
    "filesystem": {
        "read": ["/"],
        "write": ["/data/media-toolbox"]
    }
}
EOF

cat > app/config/config.json <<EOF
{
    "port": 3000,
    "database_url": "sqlite:/data/cine.db"
}
EOF

# 创建 fnpack.json
cat > fnpack.json <<EOF
{
    "name": "cine",
    "version": "1.2.0",
    "description": "Cine - 影视文件刮削工具",
    "main": "app/backend/cine-backend"
}
EOF
```

### 2. 打包 fpk

```bash
# 使用 fnpack 工具打包
fnpack build
```

### 3. 安装

在飞牛OS管理界面中上传并安装 `cine.fpk`

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | 3000 |
| `DATABASE_URL` | 数据库连接字符串 | `sqlite:./data/cine.db` |
| `TMDB_API_KEY` | TMDB API 密钥 | 无（必需） |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | 200000000000 (200GB) |
| `CHUNK_SIZE` | 流式处理块大小（字节） | 67108864 (64MB) |
| `HASH_CACHE_DIR` | 哈希缓存目录 | `./data/hash_cache` |
| `RUST_LOG` | 日志级别 | `media_toolbox=debug,axum=info` |

### 获取 TMDB API Key

1. 访问 [TMDB](https://www.themoviedb.org/)
2. 注册/登录账号
3. 进入 [API 设置](https://www.themoviedb.org/settings/api)
4. 申请 API Key
5. 将 API Key 配置到环境变量中

## 性能优化建议

### 1. 数据库优化

```sql
-- 为常用查询创建索引
CREATE INDEX IF NOT EXISTS idx_media_files_hash_md5 ON media_files(hash_md5);
CREATE INDEX IF NOT EXISTS idx_media_files_file_type ON media_files(file_type);
CREATE INDEX IF NOT EXISTS idx_media_files_size ON media_files(size);
```

### 2. 系统资源

- **内存**：建议至少 2GB 可用内存
- **CPU**：多核 CPU 可以提升并发处理能力
- **磁盘**：SSD 可以显著提升文件扫描和哈希计算速度

### 3. 并发控制

对于大量文件处理，建议：
- 限制同时进行的任务数
- 使用任务队列（如 Redis + BullMQ）
- 分批处理文件

## 故障排查

### 后端无法启动

1. 检查端口是否被占用
2. 检查数据库文件权限
3. 查看日志输出

### 前端无法连接后端

1. 检查后端是否运行
2. 检查 CORS 配置
3. 检查网络连接

### 视频信息提取失败

1. 确认 FFmpeg 已安装
2. 检查文件路径是否正确
3. 检查文件权限

### WebSocket 连接失败

1. 检查防火墙设置
2. 检查代理配置
3. 查看浏览器控制台错误

## 监控和维护

### 日志查看

```bash
# 查看实时日志
tail -f logs/media-toolbox.log

# 查看错误日志
grep ERROR logs/media-toolbox.log
```

### 数据库备份

```bash
# 备份数据库
cp data/cine.db data/cine.db.backup

# 恢复数据库
cp data/cine.db.backup data/cine.db
```

### 清理缓存

```bash
# 清理哈希缓存
rm -rf data/hash_cache/*
```

## 安全建议

1. **API Key 保护**：不要将 API Key 提交到版本控制
2. **文件权限**：限制应用的文件访问权限
3. **网络安全**：使用 HTTPS 和 WSS
4. **定期更新**：保持依赖库和系统更新
