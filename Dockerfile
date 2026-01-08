# 多阶段构建 Dockerfile

# 阶段1: 构建 Rust 后端
FROM rust:1.70 as rust-builder

WORKDIR /app/backend

# 复制依赖文件
COPY backend/Cargo.toml backend/Cargo.lock ./

# 创建虚拟项目以缓存依赖
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# 复制源代码
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/build.rs ./

# 构建应用
RUN cargo build --release

# 阶段2: 构建前端
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend

# 复制依赖文件
COPY frontend/package.json frontend/pnpm-lock.yaml* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY frontend ./

# 构建前端
RUN pnpm run build

# 阶段3: 运行镜像
FROM debian:bookworm-slim

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从构建阶段复制文件
COPY --from=rust-builder /app/backend/target/release/media-toolbox-backend ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 创建数据目录
RUN mkdir -p /app/data /app/data/hash_cache

# 设置环境变量
ENV PORT=3000
ENV DATABASE_URL=sqlite:/app/data/media_toolbox.db
ENV RUST_LOG=media_toolbox=info,axum=info

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["./backend/media-toolbox-backend"]
