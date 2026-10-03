#!/usr/bin/env bash
# run_auto_publish.sh — Full automated scan, render, and publish for book005
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo " MathLoop — 全自动全量 PDF 错题入库管道 (book005)"
echo " 目标：315 页扫描、红笔原迹保留、章节关联、发布到网页版"
echo "=========================================================="
echo ""

echo "[1/3] 扫描全书 315 页，提取全部红色笔迹并聚类..."
python3 01_scan.py --start 1 --end 315

echo ""
echo "[2/3] 渲染带红笔笔迹的整页图与聚焦切片图..."
python3 02_render.py

echo ""
echo "[3/3] 自动关联目录章节与页码，发布到 public/books/book005/..."
python3 05_auto_publish_book.py

echo ""
echo "=========================================================="
echo " 🎉 入库完成！"
echo "=========================================================="
echo "启动本地网页版测试："
echo "   npm run dev"
echo "然后在浏览器中打开 http://localhost:5173/ 并切换到 '武忠祥高数辅导讲义·强化错题'"
