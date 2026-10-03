"""
Shared configuration for the MathLoop PDF import pipeline.
All other scripts import from here.
"""
import os

# ── PDF source (READ-ONLY, never modify or move) ──────────────────────────────
PDF_PATH = "/Users/jim./_courses/考研资料/27武忠祥高数辅导讲义-强化.pdf"

# ── Book info ─────────────────────────────────────────────────────────────────
BOOK_ID = "book4"
BOOK_NAME = "武忠祥高数强化讲义"
IMPORT_VERSION = 1

# ── Directories ───────────────────────────────────────────────────────────────
HOME = os.path.expanduser("~")
# Where the App reads import data from (Tauri staging dir)
STAGING_DIR = os.path.join(
    HOME, "Library", "Application Support",
    "MathLoop", "books", BOOK_ID, "pdf-import"
)
# Where this script writes intermediate files (local, gitignored)
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

# ── Rendering ─────────────────────────────────────────────────────────────────
RENDER_DPI = 150          # Good balance of quality vs. file-size for math diagrams
RENDER_SCALE = RENDER_DPI / 72.0

# ── Red-ink detection thresholds (RGB, 0.0–1.0 scale) ─────────────────────────
# Measured from actual PDF annotations: stroke ≈ (0.9607, 0.1333, 0.1333)
# Author: 'Jim', annotation type: Ink (subtype 15)
RED_R_MIN = 0.70
RED_G_MAX = 0.45
RED_B_MAX = 0.45

# ── Known annotated page indices (0-based) ─────────────────────────────────────
# From prior full-scan of all 315 pages.  Total: 126 pages with red Ink marks.
# 1-based page numbers: 19,41,42,44-56,59-67,74-77,79-87,91-98,100-113,
#   120-127,132-140,142-148,151-153,155-156,158-160,170,172-179,
#   186-188,191-198,200-202,204-209,216-217,220-227
ALL_ANNOTATED_PAGE_INDICES = [
    18, 40, 41, 43, 44, 45, 46, 48, 49, 50, 51, 52, 53, 54, 55, 58, 59, 60,
    62, 63, 64, 65, 66, 73, 74, 75, 76, 78, 79, 80, 81, 82, 83, 85, 86, 90,
    91, 92, 93, 94, 96, 97, 99, 100, 101, 102, 104, 105, 106, 107, 108, 109,
    110, 111, 112, 119, 120, 121, 122, 123, 124, 125, 126, 131, 132, 133, 134,
    135, 136, 137, 138, 139, 141, 142, 143, 144, 145, 146, 147, 150, 151, 152,
    154, 155, 157, 158, 159, 169, 171, 172, 173, 174, 175, 176, 177, 178, 185,
    186, 187, 190, 191, 192, 193, 194, 195, 196, 197, 199, 200, 201, 203, 204,
    205, 206, 207, 208, 215, 216, 219, 220, 221, 222, 223, 224, 225, 226,
]
