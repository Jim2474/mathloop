#!/usr/bin/env bash
# run_full.sh — Full scan of all 315 pages.
#
# Run ONLY after verifying that run_test.sh output is accurate.
# Expected: ~126 annotated pages, rendering ~20 minutes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================="
echo " MathLoop PDF Import — FULL RUN"
echo " Pages: 1–315 (all pages)"
echo " Expected: ~126 annotated pages"
echo "======================================="
echo ""
echo "⚠️  This will render 126 PNG images (~20 min)."
echo "   Press Ctrl+C within 5 seconds to cancel."
sleep 5

echo "[1/4] Scanning all 315 pages..."
python3 01_scan.py --start 1 --end 315

echo ""
echo "[2/4] Rendering all annotated pages..."
python3 02_render.py

echo ""
echo "[3/4] Building import_batch.json..."
python3 03_build_batch.py

echo ""
echo "[4/4] Generating HTML preview..."
python3 04_preview.py

echo ""
echo "======================================="
echo " Full run complete!"
echo "======================================="
echo ""
echo "👉 Review in browser:"
echo "   open \"$SCRIPT_DIR/output/preview.html\""
