#!/usr/bin/env bash
# run_test.sh — Small-range test: pages 41–67 (first major annotated cluster, ~20 pages)
#
# Run this FIRST to verify that recognition is accurate before processing
# all 315 pages.  Expected output: 15–20 annotated pages.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================="
echo " MathLoop PDF Import — Test Run"
echo " Range: pages 41–67"
echo "======================================="
echo ""

echo "[1/4] Scanning for red annotations..."
python3 01_scan.py --start 41 --end 67

echo ""
echo "[2/4] Rendering annotated pages (annots=False, clean)..."
python3 02_render.py

echo ""
echo "[3/4] Building import_batch.json..."
python3 03_build_batch.py

echo ""
echo "[4/4] Generating HTML preview..."
python3 04_preview.py

echo ""
echo "======================================="
echo " Test run complete!"
echo "======================================="
echo ""
echo "👉 Review in browser:"
echo "   open \"$SCRIPT_DIR/output/preview.html\""
echo ""
echo "👉 Staging dir (App reads from here):"
HOME_PY=$(python3 -c "import os; print(os.path.expanduser('~'))")
echo "   $HOME_PY/Library/Application Support/MathLoop/books/book4/pdf-import/"
echo ""
echo "Next steps:"
echo "  1. Open preview.html and verify recognition accuracy"
echo "  2. If accurate → open MathLoop App → PDF Import tab"
echo "  3. Confirm import of approved questions"
echo "  4. If accurate → run run_full.sh for all 315 pages"
