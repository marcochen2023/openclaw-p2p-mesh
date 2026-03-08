#!/bin/bash

# OpenClaw P2P Mesh 安装脚本
# 支持 macOS 和 Linux

set -e

echo "🌐 Installing OpenClaw P2P Mesh..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   brew install node   # macOS"
    echo "   apt install nodejs  # Debian/Ubuntu"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18+. Current: $(node -v)"
    exit 1
fi

# 安装依赖
echo "📦 Installing dependencies..."
npm install

# 创建OpenClaw集成链接
P2P_DIR="$HOME/.openclaw/p2p-mesh"
mkdir -p "$P2P_DIR"

# 复制启动脚本
cp oc-p2p.js "$P2P_DIR/"
chmod +x "$P2P_DIR/oc-p2p.js"

# 创建启动命令链接（可选）
if command -v ln &> /dev/null; then
    sudo ln -sf "$P2P_DIR/oc-p2p.js" /usr/local/bin/oc-p2p 2>/dev/null || true
fi

echo ""
echo "✅ OpenClaw P2P Mesh installed successfully!"
echo ""
echo "Quick Start:"
echo "  1. Start your first agent:"
echo "     node p2p-bridge.js --id my-agent --alias 'My Agent' --discovery"
echo ""
echo "  2. From another device, connect:"
echo "     node p2p-bridge.js"
echo "     > connect my-agent"
echo ""
echo "  3. Send message:"
echo "     > broadcast Hello everyone!"
echo ""
echo "🐯 Happy P2P networking!"
