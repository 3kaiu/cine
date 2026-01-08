#!/bin/bash

# 飞牛OS fpk 打包脚本

set -e

echo "开始打包 fpk..."

# 创建打包目录
mkdir -p app/{frontend,backend,config}

# 构建后端
echo "构建后端..."
cd backend
cargo build --release
cp target/release/cine-backend ../app/backend/
cd ..

# 构建前端
echo "构建前端..."
cd frontend
npm install
npm run build
cp -r dist/* ../app/frontend/
cd ..

# 创建配置文件
echo "创建配置文件..."
cat > app/config/privilege <<EOF
{
    "defaults": {
        "run-as": "root"
    },
    "filesystem": {
        "read": ["/"],
        "write": ["/data/cine"]
    }
}
EOF

cat > app/config/config.json <<EOF
{
    "port": 3000,
    "database_url": "sqlite:/data/cine.db",
    "hash_cache_dir": "/data/cine/hash_cache",
    "trash_dir": "/data/cine/trash"
}
EOF

# 读取版本号
VERSION=$(grep -m1 '^version' backend/Cargo.toml | cut -d'"' -f2)

# 创建 fnpack.json
cat > fnpack.json <<EOF
{
    "name": "cine",
    "version": "$VERSION",
    "description": "Cine - 专为NAS用户打造的高性能影视文件管理工具",
    "main": "app/backend/cine-backend",
    "author": "Cine Team",
    "license": "MIT"
}
EOF

echo "打包完成！"
echo "使用 fnpack build 命令生成 fpk 文件"
