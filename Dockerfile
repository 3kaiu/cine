# 多阶段构建 Dockerfile

# 阶段1: 构建 Rust 后端（edition 2024 已稳定，使用固定版本避免 nightly tag 波动）
# Rust 1.85+ 支持 edition 2024；这里选择 bookworm 变体便于依赖兼容。
FROM rust:1.87-bookworm AS rust-builder

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

# 复制源代码（仅后端 crate）
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/build.rs ./

# 构建应用（仅后端二进制，使用 release 配置以获得运行时性能）
RUN cargo build --release --bin cine-backend

# 阶段2: 构建前端
FROM node:22-alpine AS frontend-builder

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
