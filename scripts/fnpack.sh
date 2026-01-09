#!/bin/bash

# 飞牛OS fpk 打包脚本

set -e

echo "开始打包 fpk..."

# 清理旧构建
rm -rf app config manifest ICON.PNG ICON_256.PNG cmd

# 创建打包目录
mkdir -p app/{frontend,backend}
mkdir -p config
mkdir -p cmd # 创建 cmd 目录，即使为空也保留结构

# 构建后端
echo "构建后端..."
cd backend
cargo build --release
cp target/release/cine-backend ../app/backend/
cd ..

# 构建前端
echo "构建前端..."
cd frontend
npm install --legacy-peer-deps
npm run build
cp -r dist/* ../app/frontend/
cd ..

# 处理图标
echo "处理图标..."
if [ -f "frontend/public/icon.svg" ]; then
    # 尝试使用 sips (macOS) 转换图标，如果失败则直接复制为 PNG (仅作为占位)
    if command -v sips &> /dev/null; then
        sips -s format png frontend/public/icon.svg --out ICON.PNG --resampleHeightWidth 64 64
        sips -s format png frontend/public/icon.svg --out ICON_256.PNG --resampleHeightWidth 256 256
    else
        echo "警告: 未找到 sips 工具，直接复制 SVG 为 PNG"
        cp frontend/public/icon.svg ICON.PNG
        cp frontend/public/icon.svg ICON_256.PNG
    fi
else
    echo "警告: 未找到图标文件"
    touch ICON.PNG ICON_256.PNG
fi

# 创建配置文件 (注意：config 在根目录，不在 app 下)
echo "创建配置文件..."
cat > config/privilege <<EOF
{
    "defaults": {
        "run-as": "root"
    },
    "filesystem": {
        "read": ["/", "/vol1", "/vol2", "/vol3", "/mnt"],
        "write": ["/data/cine"]
    }
}
EOF

# 应用特定配置仍放在 app/config 下，或者根据应用逻辑自行调整
# 这里假设 cine-backend 读取的是 app/config/config.json
mkdir -p app/config
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

# 创建 manifest (注意：文件名为 manifest，且在根目录)
cat > manifest <<EOF
{
    "app": "cine",
    "version": "$VERSION",
    "description": "Cine - 专为NAS用户打造的高性能影视文件管理工具",
    "main": "app/backend/cine-backend",
    "author": "Cine Team",
    "license": "MIT",
    "title": "Cine 影视管理",
    "icon": "ICON.PNG",
    "type": "iframe",
    "width": 1280,
    "height": 800,
    "min_width": 1024,
    "min_height": 768
}
EOF

echo "打包准备完成！"
echo "请确保已安装 fnpack 工具，然后运行: fnpack build"
