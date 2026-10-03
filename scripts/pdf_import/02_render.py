#!/usr/bin/env python3
"""
02_render.py — Render annotated PDF pages, question crops, and answer crops to PNG images.

Reads scan_result.json and renders:
1. Full-page images WITH user's authentic red annotations (annots=True).
2. Question crop images WITH user's authentic red annotations (annots=True).
3. Answer crop images WITH user's authentic red annotations (annots=True).

Processes one page at a time to keep peak memory under ~50MB.
NEVER calls doc.save() — PDF is strictly read-only.

Usage:
    python3 02_render.py
    python3 02_render.py --scan-result output/scan_result.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: pymupdf not installed. Run: pip3 install pymupdf", file=sys.stderr)
    sys.exit(1)

from config import PDF_PATH, OUTPUT_DIR, STAGING_DIR, RENDER_SCALE


def main():
    parser = argparse.ArgumentParser(description="Render annotated PDF pages, question crops, and answer crops")
    parser.add_argument(
        "--scan-result",
        default=os.path.join(OUTPUT_DIR, "scan_result.json"),
        help="Path to scan_result.json from 01_scan.py",
    )
    args = parser.parse_args()

    if not os.path.exists(args.scan_result):
        print(
            f"ERROR: {args.scan_result} not found. Run 01_scan.py first.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(args.scan_result, "r", encoding="utf-8") as f:
        scan_data = json.load(f)

    pages = scan_data.get("annotated_pages", [])
    if not pages:
        print("No annotated pages in scan result — nothing to render.")
        return

    images_local = os.path.join(OUTPUT_DIR, "images")
    pages_local = os.path.join(OUTPUT_DIR, "pages")
    images_staging = os.path.join(STAGING_DIR, "images")
    pages_staging = os.path.join(STAGING_DIR, "pages")

    os.makedirs(images_local, exist_ok=True)
    os.makedirs(pages_local, exist_ok=True)
    os.makedirs(images_staging, exist_ok=True)
    os.makedirs(pages_staging, exist_ok=True)

    total_targets = scan_data.get("total_targets", sum(len(p.get("targets", [])) for p in pages))
    dpi = RENDER_SCALE * 72
    print(f"Rendering {len(pages)} pages ({total_targets} mistake targets) at {dpi:.0f} DPI (annots=True)...")
    print(f"PDF (streaming, read-only): {PDF_PATH}")

    doc = fitz.open(PDF_PATH)
    mat = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)

    rendered_pages = 0
    rendered_questions = 0
    rendered_answers = 0
    failed = []

    for page_info in pages:
        idx = page_info["pdf_page_index"]
        p_num = page_info["pdf_page_number"]
        full_fname = page_info.get("full_image_filename", f"p{p_num:03d}_full.png")
        page_fname = f"page_{p_num:03d}.png"
        targets = page_info.get("targets", [])

        try:
            page = doc[idx]

            # 1. Render Full Page with annotations (annots=True)
            pix_full = page.get_pixmap(matrix=mat, annots=True)
            local_full_path = os.path.join(images_local, full_fname)
            local_page_path = os.path.join(pages_local, page_fname)
            staging_full_path = os.path.join(images_staging, full_fname)
            staging_page_path = os.path.join(pages_staging, page_fname)

            pix_full.save(local_full_path)
            pix_full.save(local_page_path)
            pix_full.save(staging_full_path)
            pix_full.save(staging_page_path)
            del pix_full
            rendered_pages += 1

            # 2. Render each target's Question and Answer crops
            for t in targets:
                q_fname = t.get("question_image_filename", t.get("crop_image_filename"))
                a_fname = t.get("answer_image_filename", q_fname.replace("_question.png", "_answer.png"))

                q_box = t.get("question_bounding_box", t.get("crop_bounding_box"))
                a_box = t.get("answer_bounding_box")

                # Question crop
                q_rect = fitz.Rect(q_box["x0"], q_box["y0"], q_box["x1"], q_box["y1"])
                pix_q = page.get_pixmap(matrix=mat, clip=q_rect, annots=True)
                pix_q.save(os.path.join(images_local, q_fname))
                pix_q.save(os.path.join(images_staging, q_fname))
                del pix_q
                rendered_questions += 1

                # Answer crop
                if a_box:
                    a_rect = fitz.Rect(a_box["x0"], a_box["y0"], a_box["x1"], a_box["y1"])
                    pix_a = page.get_pixmap(matrix=mat, clip=a_rect, annots=True)
                    pix_a.save(os.path.join(images_local, a_fname))
                    pix_a.save(os.path.join(images_staging, a_fname))
                    del pix_a
                    rendered_answers += 1

            del page  # Release page memory immediately
            print(f"  ✓ p{p_num:03d}: full + {len(targets)} question crops + {len(targets)} answer crops rendered")

        except Exception as e:
            print(f"  ✗ p{p_num:03d}: {e}")
            failed.append(p_num)

    doc.close()  # Read-only — DO NOT call doc.save()

    print(f"\n✅ Rendered {rendered_pages} full pages, {rendered_questions} question crops, and {rendered_answers} answer crops.")
    if failed:
        print(f"   Failed pages: {failed}")
    print(f"   Local images: {images_local}")
    print(f"   Staging dir:  {images_staging}")


if __name__ == "__main__":
    main()
