#!/usr/bin/env python3
"""
03_build_batch.py — Build import_batch.json from scan_result.json with multi-target support.

Creates Question objects in the format MathLoop expects:
- Each distinct marked question target becomes an individual Question.
- questionImage points to the focused crop image showing the problem, user's red cross, and solution.
- questionImages includes both the focused crop and the full-page view.
- Fields that cannot be extracted from image-only PDF are left EMPTY — never fabricated.

Usage:
    python3 03_build_batch.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

from config import (
    OUTPUT_DIR, STAGING_DIR,
    BOOK_ID, BOOK_NAME, IMPORT_VERSION, PDF_PATH,
)


def build_question(page_info: dict, target: dict, total_targets_on_page: int) -> dict:
    idx = page_info["pdf_page_index"]
    t_idx = target["target_index"]
    full_img = f"pdf-import/images/{page_info['full_image_filename']}"
    crop_img = f"pdf-import/images/{target['crop_image_filename']}"

    q_no = f"PDF第{idx + 1}页-第{t_idx}题" if total_targets_on_page > 1 else f"PDF第{idx + 1}页"

    return {
        # ── Identity ─────────────────────────────────────────────────────────
        "id": target["proposed_id"],
        "bookName": BOOK_NAME,

        # ── Location metadata ─────────────────────────────────────────────────
        "chapter": "",
        "section": "",
        "questionNo": q_no,
        "pageStart": idx + 1,
        "pageEnd": idx + 1,
        "pdfPageLabel": f"第{idx + 1}页",
        "printedPageNumber": "",   # Printed page ≠ PDF page; user fills later
        "pageRangeText": f"{BOOK_NAME} {q_no}",

        # ── Content ───────────────────────────────────────────────────────────
        "questionText": "",
        "tips": "",
        # Default view is the focused crop containing the question and its solution
        "questionImage": crop_img,
        # Both crop and full page are available in images array
        "questionImages": [crop_img, full_img],
        # Answer is contained within the crop image
        "answerImage": None,
        "answerImages": None,
        "answerMeta": None,

        # ── Tags / difficulty ─────────────────────────────────────────────────
        "knowledgeTags": [],
        "mistakeTags": [],
        "difficulty": 0,
        "valueStar": 0,
        "status": "active",

        # ── FSRS — starts fresh ───────────────────────────────────────────────
        "fsrs": {
            "state": "new",
            "difficulty": None,
            "stability": None,
            "retrievability": None,
            "lastReview": None,
            "nextReview": None,
            "reviewCount": 0,
            "lapseCount": 0,
        },
        "review": {"mastery": 0, "lastResult": None, "history": []},

        # ── Provenance ────────────────────────────────────────────────────────
        "meta": {
            "source": "pdf-import",
            "uncertain": False,
            "note": f"武忠祥强化讲义 PDF导入 v{IMPORT_VERSION}",
        },
        # Extended metadata used by MathLoop for display, highlighting, and deduplication
        "pdfSource": {
            "pdfPath": PDF_PATH,
            "pdfPageIndex": idx,
            "pdfPageNumber": idx + 1,
            "pdfPageLabel": f"第{idx + 1}页",
            "targetIndex": t_idx,
            "targetLabel": target["target_label"],
            "totalTargetsOnPage": total_targets_on_page,
            "annotBoundingBox": target["mark_bounding_box"],
            "cropBoundingBox": target["crop_bounding_box"],
            "strokeCount": target["stroke_count"],
            "cropImage": crop_img,
            "fullImage": full_img,
            "importedAt": datetime.now(timezone.utc).isoformat(),
            "importVersion": IMPORT_VERSION,
        },
    }


def main():
    scan_path = os.path.join(OUTPUT_DIR, "scan_result.json")
    if not os.path.exists(scan_path):
        print(f"ERROR: {scan_path} not found. Run 01_scan.py first.", file=sys.stderr)
        sys.exit(1)

    with open(scan_path, "r", encoding="utf-8") as f:
        scan_data = json.load(f)

    pages = scan_data.get("annotated_pages", [])
    if not pages:
        print("No annotated pages in scan result — nothing to build.")
        return

    questions = []
    for page_info in pages:
        targets = page_info.get("targets", [])
        for t in targets:
            q = build_question(page_info, t, len(targets))
            questions.append(q)

    # Write to local output dir (for inspection)
    local_path = os.path.join(OUTPUT_DIR, "import_batch.json")
    with open(local_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    # Also write to staging dir so the App can pick it up
    os.makedirs(STAGING_DIR, exist_ok=True)
    staging_path = os.path.join(STAGING_DIR, "import_batch.json")
    with open(staging_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"✅ Built {len(questions)} distinct question entries from {len(pages)} annotated pages.")
    print(f"   Local:   {local_path}")
    print(f"   Staging: {staging_path}")
    if questions:
        print(f"   ID range: {questions[0]['id']} → {questions[-1]['id']}")


if __name__ == "__main__":
    main()
