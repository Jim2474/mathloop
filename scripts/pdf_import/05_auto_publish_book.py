#!/usr/bin/env python3
"""
05_auto_publish_book.py — Automatically assemble, tag, and publish the full mistake book (book005).

1. Reads scan_result.json.
2. Applies the exact catalog mapping (printed page = pdf_page - 13) to tag chapter & section.
3. Generates complete Question objects adhering strictly to MathLoop's questions.json schema:
     - questionImage:  "images/p{page:03d}_t{t}_question.png"  (Colored box only with red ink)
     - questionImages: ["images/p{page:03d}_t{t}_question.png"]
     - answerImage:    "images/p{page:03d}_t{t}_answer.png"    (【解】 downwards)
     - answerImages:   ["images/p{page:03d}_t{t}_answer.png"]
4. Copies rendered images to:
     - Web directory:     public/books/book005/images/ and public/books/book005/pages/
     - Desktop directory: ~/Library/Application Support/MathLoop/books/book005/images/ and pages/
5. Writes questions.json to:
     - Web directory:     public/books/book005/data/questions.json
     - Desktop directory: ~/Library/Application Support/MathLoop/books/book005/data/questions.json
6. Registers book005 in:
     - public/books.json
     - SQLite mathloop.db (book-registry)

Usage:
    python3 05_auto_publish_book.py
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

from config import OUTPUT_DIR, PDF_PATH

NEW_BOOK_ID = "book005"
NEW_BOOK_NAME = "武忠祥高数辅导讲义·强化错题"

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_BOOKS_DIR = os.path.join(REPO_ROOT, "public", "books", NEW_BOOK_ID)
PUBLIC_BOOKS_JSON = os.path.join(REPO_ROOT, "public", "books.json")

HOME_DIR = os.path.expanduser("~")
DESKTOP_BOOK_DIR = os.path.join(
    HOME_DIR, "Library", "Application Support", "MathLoop", "books", NEW_BOOK_ID
)
SQLITE_DB_PATH = os.path.join(
    HOME_DIR, "Library", "Application Support", "MathLoop", "mathloop.db"
)

# ── Chapter and Section Mapping Table (from printed catalog on pages 10–13) ────
# printed_page = pdf_page - 13
CHAPTER_RANGES = [
    (3, 55, "第一章 函数 极限 连续", [
        (3, "第一节 函数"),
        (10, "第二节 极限"),
        (49, "第三节 连续"),
    ]),
    (56, 103, "第二章 一元函数微分学", [
        (56, "第一节 导数与微分"),
        (74, "第二节 导数应用"),
    ]),
    (104, 152, "第三章 一元函数积分学", [
        (104, "第一节 不定积分"),
        (115, "第二节 定积分"),
        (135, "第三节 反常积分"),
        (141, "第四节 定积分应用"),
        (147, "第五节 导数在经济学中的应用"),
    ]),
    (153, 167, "第四章 常微分方程", [
        (153, "常微分方程"),
    ]),
    (168, 199, "第五章 多元函数微分学", [
        (168, "第一节 重极限、连续、偏导数、全微分"),
        (176, "第二节 偏导数与全微分的计算"),
        (189, "第三节 极值与最值"),
    ]),
    (200, 217, "第六章 二重积分", [
        (200, "二重积分"),
    ]),
    (218, 248, "第七章 无穷级数", [
        (218, "第一节 常数项级数"),
        (230, "第二节 幂级数"),
        (243, "第三节 傅里叶级数"),
    ]),
    (249, 265, "第八章 向量代数与空间解析几何及多元微分学在几何上的应用", [
        (249, "第一节 向量代数"),
        (251, "第二节 空间平面与直线"),
        (255, "第三节 曲面与空间曲线"),
        (258, "第四节 多元函数微分在几何上的应用"),
        (261, "第五节 方向导数与梯度"),
    ]),
    (266, 294, "第九章 多元函数积分学及其应用", [
        (266, "第一节 三重积分与线面积分"),
        (288, "第二节 多元函数积分应用"),
        (292, "第三节 场论初步"),
    ]),
    (295, 315, "附录 2026年高等数学试题", [
        (295, "试题与答案解析"),
    ]),
]


def resolve_chapter_section(pdf_page: int) -> tuple[str, str, str]:
    """Returns (chapter, section, printed_page_str)."""
    printed_page = pdf_page - 13
    if printed_page < 3:
        return "前言与目录", "前言", ""
    for start_p, end_p, ch_name, sections in CHAPTER_RANGES:
        if start_p <= printed_page <= end_p:
            sec_name = sections[0][1]
            for s_start, s_title in sections:
                if printed_page >= s_start:
                    sec_name = s_title
                else:
                    break
            return ch_name, sec_name, str(printed_page)
    return "附录与综合", "", str(printed_page)


def register_in_sqlite():
    if not os.path.exists(SQLITE_DB_PATH):
        return
    try:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT value FROM review_store WHERE key='book-registry'")
        row = cur.fetchone()
        if row:
            registry = json.loads(row[0])
            if not any(b.get("id") == NEW_BOOK_ID for b in registry):
                registry.append({
                    "id": NEW_BOOK_ID,
                    "name": NEW_BOOK_NAME,
                    "addedAt": datetime.now(timezone.utc).isoformat(),
                })
                now_str = datetime.now(timezone.utc).isoformat()
                cur.execute(
                    "UPDATE review_store SET value = ?, updated_at = ? WHERE key='book-registry'",
                    (json.dumps(registry, ensure_ascii=False), now_str)
                )
                conn.commit()
                print(f"✓ Registered '{NEW_BOOK_ID}' in SQLite {SQLITE_DB_PATH}")
            else:
                print(f"✓ '{NEW_BOOK_ID}' already present in SQLite book-registry")
        conn.close()
    except Exception as e:
        print(f"Notice: SQLite registry update skipped: {e}")


def main():
    scan_path = os.path.join(OUTPUT_DIR, "scan_result.json")
    images_dir = os.path.join(OUTPUT_DIR, "images")
    pages_dir = os.path.join(OUTPUT_DIR, "pages")

    if not os.path.exists(scan_path):
        print(f"ERROR: {scan_path} not found. Run 01_scan.py first.", file=sys.stderr)
        sys.exit(1)

    with open(scan_path, "r", encoding="utf-8") as f:
        scan_data = json.load(f)

    pages = scan_data.get("annotated_pages", [])
    if not pages:
        print("ERROR: No annotated pages in scan result.", file=sys.stderr)
        sys.exit(1)

    print(f"Publishing {len(pages)} annotated pages to book '{NEW_BOOK_ID}' ({NEW_BOOK_NAME})...")

    # Create destination directories
    web_data_dir = os.path.join(PUBLIC_BOOKS_DIR, "data")
    web_images_dir = os.path.join(PUBLIC_BOOKS_DIR, "images")
    web_pages_dir = os.path.join(PUBLIC_BOOKS_DIR, "pages")
    desktop_data_dir = os.path.join(DESKTOP_BOOK_DIR, "data")
    desktop_images_dir = os.path.join(DESKTOP_BOOK_DIR, "images")
    desktop_pages_dir = os.path.join(DESKTOP_BOOK_DIR, "pages")

    os.makedirs(web_data_dir, exist_ok=True)
    os.makedirs(web_images_dir, exist_ok=True)
    os.makedirs(web_pages_dir, exist_ok=True)
    os.makedirs(desktop_data_dir, exist_ok=True)
    os.makedirs(desktop_images_dir, exist_ok=True)
    os.makedirs(desktop_pages_dir, exist_ok=True)

    questions = []
    copied_images = 0

    for page_info in pages:
        p_idx = page_info["pdf_page_index"]
        p_num = page_info["pdf_page_number"]
        targets = page_info.get("targets", [])
        total_targets = len(targets)
        full_img_name = page_info.get("full_image_filename", f"p{p_num:03d}_full.png")
        page_img_name = f"page_{p_num:03d}.png"

        # Copy full page image to images/
        src_full = os.path.join(images_dir, full_img_name)
        if os.path.exists(src_full):
            shutil.copy2(src_full, os.path.join(web_images_dir, full_img_name))
            shutil.copy2(src_full, os.path.join(desktop_images_dir, full_img_name))
            copied_images += 1

        # Copy full page image to pages/ for native "查看整页" modal
        src_page = os.path.join(pages_dir, page_img_name)
        if not os.path.exists(src_page) and os.path.exists(src_full):
            src_page = src_full
        if os.path.exists(src_page):
            shutil.copy2(src_page, os.path.join(web_pages_dir, page_img_name))
            shutil.copy2(src_page, os.path.join(desktop_pages_dir, page_img_name))

        ch_name, sec_name, printed_p = resolve_chapter_section(p_num)

        for t in targets:
            t_idx = t["target_index"]
            q_img_name = t.get("question_image_filename", t.get("crop_image_filename"))
            a_img_name = t.get("answer_image_filename", q_img_name.replace("_question.png", "_answer.png"))
            qid = f"{NEW_BOOK_ID}_p{p_num:03d}_t{t_idx}"

            # Copy Question crop image
            src_q = os.path.join(images_dir, q_img_name)
            if os.path.exists(src_q):
                shutil.copy2(src_q, os.path.join(web_images_dir, q_img_name))
                shutil.copy2(src_q, os.path.join(desktop_images_dir, q_img_name))
                copied_images += 1

            # Copy Answer crop image
            src_a = os.path.join(images_dir, a_img_name)
            if os.path.exists(src_a):
                shutil.copy2(src_a, os.path.join(web_images_dir, a_img_name))
                shutil.copy2(src_a, os.path.join(desktop_images_dir, a_img_name))
                copied_images += 1

            q_no = f"PDF第{p_num}页-第{t_idx}题" if total_targets > 1 else f"PDF第{p_num}页"
            p_text = f"PDF第{p_num}页"
            if printed_p:
                p_text += f"，教材第{printed_p}页"

            question_obj = {
                "id": qid,
                "bookName": NEW_BOOK_NAME,
                "chapter": ch_name,
                "section": sec_name,
                "questionNo": q_no,
                "pageStart": p_num,
                "pageEnd": p_num,
                "pdfPageLabel": str(p_num),
                "printedPageNumber": printed_p,
                "pageRangeText": p_text,
                "questionText": "",
                "tips": "",
                # Strictly separated: questionImage only has colored box; answerImage has solution
                "questionImage": f"images/{q_img_name}",
                "questionImages": [f"images/{q_img_name}"],
                "answerImage": f"images/{a_img_name}",
                "answerImages": [f"images/{a_img_name}"],
                "answerMeta": None,
                "knowledgeTags": [ch_name, sec_name] if sec_name else [ch_name],
                "mistakeTags": ["手写红叉标注"],
                "difficulty": 3,
                "valueStar": 3,
                "status": "new",
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
                "meta": {
                    "source": "pdf-import",
                    "uncertain": False,
                    "note": f"武忠祥强化讲义 PDF第{p_num}页",
                },
                "pdfSource": {
                    "pdfPath": PDF_PATH,
                    "pdfPageIndex": p_idx,
                    "pdfPageNumber": p_num,
                    "pdfPageLabel": f"第{p_num}页",
                    "targetIndex": t_idx,
                    "targetLabel": t.get("target_label", q_no),
                    "totalTargetsOnPage": total_targets,
                    "questionBoundingBox": t.get("question_bounding_box", {}),
                    "answerBoundingBox": t.get("answer_bounding_box", {}),
                    "overlapPt": t.get("overlap_pt", 0.0),
                    "questionImage": f"images/{q_img_name}",
                    "answerImage": f"images/{a_img_name}",
                    "fullImage": f"images/{full_img_name}",
                    "importedAt": datetime.now(timezone.utc).isoformat(),
                    "importVersion": 2,
                },
            }
            questions.append(question_obj)

    # 1. Write questions.json to Web and Desktop dirs
    web_q_path = os.path.join(web_data_dir, "questions.json")
    desktop_q_path = os.path.join(desktop_data_dir, "questions.json")

    with open(web_q_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    with open(desktop_q_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    # 2. Register book005 in public/books.json if not present
    if os.path.exists(PUBLIC_BOOKS_JSON):
        with open(PUBLIC_BOOKS_JSON, "r", encoding="utf-8") as f:
            books_list = json.load(f)
    else:
        books_list = []

    if not any(b.get("id") == NEW_BOOK_ID for b in books_list):
        books_list.append({"id": NEW_BOOK_ID, "name": NEW_BOOK_NAME})
        with open(PUBLIC_BOOKS_JSON, "w", encoding="utf-8") as f:
            json.dump(books_list, f, ensure_ascii=False, indent=2)
        print(f"✓ Registered '{NEW_BOOK_ID}' in {PUBLIC_BOOKS_JSON}")
    else:
        print(f"✓ '{NEW_BOOK_ID}' already registered in {PUBLIC_BOOKS_JSON}")

    # 3. Register in SQLite
    register_in_sqlite()

    # Summary
    print(f"\n🎉 Successfully published {len(questions)} questions to '{NEW_BOOK_ID}'!")
    print(f"   Web questions:     {web_q_path}")
    print(f"   Web images:        {web_images_dir}")
    print(f"   Web pages:         {web_pages_dir}")
    print(f"   Desktop questions: {desktop_q_path}")
    print(f"   Desktop images:    {desktop_images_dir}")

    # Group by chapter
    chapters_count: dict[str, int] = {}
    for q in questions:
        ch = q["chapter"]
        chapters_count[ch] = chapters_count.get(ch, 0) + 1

    print("\n📚 Questions by Chapter:")
    for ch, count in sorted(chapters_count.items()):
        print(f"   {ch}: {count} 道")


if __name__ == "__main__":
    main()
