#!/usr/bin/env python3
"""
01_scan.py — Scan PDF pages for real mistake questions using colored question box detection.

Algorithm:
1. Detects colored question boxes (green/blue/coral/orange) using saturation thresholding.
2. Identifies red ink annotations (Author Jim, stroke color R>0.70, G<0.45, B<0.45).
3. Matches annotations against question boxes with vertical overlap >= 10.0 pt.
4. Filters out irrelevant notes/circles (e.g. page 50 notes on "数学二不要求").
5. Segregates Question bounding box (colored box only) and Answer bounding box (【解】 downwards).

Usage:
    python3 01_scan.py --start 41 --end 50     # test range
    python3 01_scan.py                         # scan all 315 pages
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: pymupdf not installed. Run: pip3 install pymupdf", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("ERROR: pillow not installed. Run: pip3 install pillow", file=sys.stderr)
    sys.exit(1)

from config import (
    PDF_PATH, OUTPUT_DIR, BOOK_ID, IMPORT_VERSION,
    RED_R_MIN, RED_G_MAX, RED_B_MAX,
)


def is_red(color: list) -> bool:
    if not color or len(color) < 3:
        return False
    r, g, b = color[0], color[1], color[2]
    return r > RED_R_MIN and g < RED_G_MAX and b < RED_B_MAX


def detect_colored_boxes(page) -> list[tuple[float, float]]:
    """Detect horizontal colored question boxes (green/blue/coral/orange) across all chapters.
    Uses pixel saturation: max(r,g,b) - min(r,g,b) > 20 on annots=False rendering.
    Returns sorted list of (y0_pt, y1_pt).
    """
    pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72), annots=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    w, h = img.size
    pixels = img.load()
    scale = 72.0 / 150.0

    row_colored = [0] * h
    for y in range(h):
        cnt = 0
        for x in range(int(w * 0.1), int(w * 0.9), 4):
            r, g, b = pixels[x, y]
            if max(r, g, b) - min(r, g, b) > 20:
                cnt += 1
        row_colored[y] = cnt

    boxes: list[tuple[float, float]] = []
    in_box = False
    start_y = 0
    for y in range(h):
        if row_colored[y] > 20:
            if not in_box:
                in_box = True
                start_y = y
        else:
            if in_box:
                in_box = False
                end_y = y
                if (end_y - start_y) * scale >= 16.0:
                    boxes.append((round(start_y * scale, 1), round(end_y * scale, 1)))
    if in_box:
        end_y = h
        if (end_y - start_y) * scale >= 16.0:
            boxes.append((round(start_y * scale, 1), round(end_y * scale, 1)))
    return boxes


def scan_page(page, page_index: int) -> dict | None:
    """Scan a single page for red annotations overlapping colored question boxes.
    Returns result dict with question & answer crop bounding boxes, or None if no valid mistakes.
    """
    red_annots = []
    annot = page.first_annot
    while annot:
        try:
            stroke = annot.colors.get("stroke", [])
            if is_red(stroke):
                red_annots.append({
                    "rect": [round(x, 2) for x in annot.rect],
                    "creation_date": annot.info.get("creationDate", ""),
                    "author": annot.info.get("title", ""),
                })
        except Exception:
            pass
        try:
            annot = annot.next
        except Exception:
            break

    if not red_annots:
        return None

    boxes = detect_colored_boxes(page)
    if not boxes:
        return None

    page_rect = page.rect
    page_w = round(page_rect.width, 2)
    page_h = round(page_rect.height, 2)
    p_num = page_index + 1

    # Match red annotations to colored question boxes (overlap >= 10.0 pt)
    matched_targets = []
    for b_idx, (by0, by1) in enumerate(boxes):
        overlap_pt = 0.0
        hit_annots = []
        for a in red_annots:
            ar = a["rect"]
            ov_top = max(by0, ar[1])
            ov_bottom = min(by1, ar[3])
            if ov_bottom > ov_top:
                ov = ov_bottom - ov_top
                overlap_pt += ov
                hit_annots.append(a)

        if overlap_pt >= 10.0:
            matched_targets.append({
                "box_index": b_idx,
                "box_y0": by0,
                "box_y1": by1,
                "overlap_pt": round(overlap_pt, 1),
                "hit_annots": hit_annots,
            })

    if not matched_targets:
        return None

    targets = []
    for t_idx, mt in enumerate(matched_targets, 1):
        by0 = mt["box_y0"]
        by1 = mt["box_y1"]

        # 1. Question bounding box:
        # Includes tag/badge above box (e.g. "训练思维" / "渗透方法"), extends to bottom border of box
        q_y0 = max(0.0, by0 - 15.0)
        q_y1 = by1 + 4.0
        q_bbox = {
            "x0": 0.0,
            "y0": round(q_y0, 2),
            "x1": page_w,
            "y1": round(q_y1, 2),
        }

        # 2. Answer bounding box:
        # Starts right below question box (where 【解】 begins)
        # Ends before next colored box on the page, or at page footer
        ans_y0 = q_y1
        next_box = next((b for b in boxes if b[0] > by1 + 10.0), None)
        if next_box:
            ans_y1 = max(ans_y0 + 30.0, next_box[0] - 8.0)
        else:
            ans_y1 = max(ans_y0 + 30.0, page_h - 25.0)

        ans_bbox = {
            "x0": 0.0,
            "y0": round(ans_y0, 2),
            "x1": page_w,
            "y1": round(ans_y1, 2),
        }

        target_id = f"pdfimport-{BOOK_ID}-p{p_num:03d}-t{t_idx}-v{IMPORT_VERSION}"
        question_filename = f"p{p_num:03d}_t{t_idx}_question.png"
        answer_filename = f"p{p_num:03d}_t{t_idx}_answer.png"

        targets.append({
            "target_index": t_idx,
            "proposed_id": target_id,
            "target_label": f"第{p_num}页-第{t_idx}题" if len(matched_targets) > 1 else f"第{p_num}页",
            "box_coords": [by0, by1],
            "overlap_pt": mt["overlap_pt"],
            "question_bounding_box": q_bbox,
            "answer_bounding_box": ans_bbox,
            "question_image_filename": question_filename,
            "answer_image_filename": answer_filename,
            # Backwards compatibility alias
            "crop_bounding_box": q_bbox,
            "crop_image_filename": question_filename,
            "hit_annots": mt["hit_annots"],
        })

    return {
        "pdf_page_index": page_index,
        "pdf_page_number": p_num,
        "page_label": f"第{p_num}页",
        "page_width_pt": page_w,
        "page_height_pt": page_h,
        "total_strokes": len(red_annots),
        "target_count": len(targets),
        "full_image_filename": f"p{p_num:03d}_full.png",
        "targets": targets,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Scan PDF for red mistake marks using colored question box detection"
    )
    parser.add_argument(
        "--start", type=int, default=1,
        help="Start page, 1-indexed inclusive (default: 1)"
    )
    parser.add_argument(
        "--end", type=int, default=None,
        help="End page, 1-indexed inclusive (default: last page)"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file path (default: output/scan_result.json)"
    )
    args = parser.parse_args()

    if not os.path.exists(PDF_PATH):
        print(f"ERROR: PDF not found: {PDF_PATH}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = args.output or os.path.join(OUTPUT_DIR, "scan_result.json")

    print(f"Opening PDF (read-only, streaming): {PDF_PATH}")
    doc = fitz.open(PDF_PATH)
    total_pages = len(doc)

    start_idx = args.start - 1
    end_idx = (args.end - 1) if args.end else (total_pages - 1)
    end_idx = min(end_idx, total_pages - 1)

    print(f"Scanning pages {start_idx + 1}–{end_idx + 1} of {total_pages} total...")

    annotated_pages = []
    total_targets = 0

    for i in range(start_idx, end_idx + 1):
        page = doc[i]
        result = scan_page(page, i)
        if result:
            annotated_pages.append(result)
            total_targets += result["target_count"]
            t_summary = ", ".join(
                [f"T{t['target_index']}(overlap:{t['overlap_pt']}pt)"
                 for t in result["targets"]]
            )
            print(f"  ✓ p{i+1:03d}: {result['target_count']} 题 [{t_summary}] ({result['total_strokes']} 处笔画)")
        del page

    doc.close()

    output = {
        "pdf_path": PDF_PATH,
        "scanned_at": datetime.now().isoformat(),
        "total_pdf_pages": total_pages,
        "scan_start_page": start_idx + 1,
        "scan_end_page": end_idx + 1,
        "pages_scanned": end_idx - start_idx + 1,
        "annotated_page_count": len(annotated_pages),
        "total_targets": total_targets,
        "annotated_pages": annotated_pages,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Found {len(annotated_pages)} annotated pages containing {total_targets} distinct mistake targets.")
    print(f"   Output: {output_path}")


if __name__ == "__main__":
    main()
