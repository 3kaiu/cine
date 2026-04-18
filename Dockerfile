# 多阶段构建 Dockerfile

# 阶段1: 构建 Rust 后端
# Use a mainland-accessible Docker Hub mirror. This is an inference from current
# mirror index results and may be adjusted if the mirror policy changes.
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/rust:1.87 AS rust-builder

WORKDIR /app

# 复制依赖文件
COPY backend/Cargo.toml backend/Cargo.lock ./

# 创建虚拟项目以缓存依赖（包含 bench 占位文件，避免 Cargo 报错）
RUN mkdir -p src benches && \
    echo "fn main() {}" > src/main.rs && \
    touch src/lib.rs && \
    echo "fn main() {}" > benches/hash_bench.rs && \
    echo "fn main() {}" > benches/performance_bench.rs && \
    cargo build --release --bin cine-backend && \
    rm -rf src benches

# 复制源代码
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/benches ./benches
COPY backend/build.rs ./

# 构建应用
RUN cargo build --release --bin cine-backend

# 阶段2: 构建前端
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# 复制依赖文件
COPY frontend/package.json frontend/package-lock.json ./

# 安装依赖
RUN npm ci --legacy-peer-deps

# 复制源代码
COPY frontend ./

# 构建前端
RUN npm run build

# 阶段3: 运行镜像
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/debian:bookworm-slim

# 安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从构建阶段复制文件
COPY --from=rust-builder /app/target/release/cine-backend ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 创建数据目录
RUN mkdir -p /app/data /app/data/hash_cache

# 设置环境变量
ENV PORT=3000
ENV DATABASE_URL=sqlite:/app/data/media_toolbox.db
ENV RUST_LOG=cine=info,axum=info

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["./backend/cine-backend"]
