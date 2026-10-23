#!/usr/bin/env python3
"""Read-only PDF recognition worker. stdout is a JSON-lines progress protocol.

Profiles identify the unannotated document content, so adding annotations or
renaming a file does not change its identity. No source PDF is ever saved.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import fitz
from PIL import Image
from control_textbook import FINGERPRINT as CONTROL_FINGERPRINT, PROFILE as CONTROL_PROFILE, extract_control, render as render_control_page

from math2_exams import FINGERPRINT as MATH2_FINGERPRINT, PROFILE as MATH2_PROFILE, extract_math2, answer_matches

PROFILES = {
    MATH2_FINGERPRINT: MATH2_PROFILE,
    CONTROL_FINGERPRINT: CONTROL_PROFILE,
    "2982c22df232fcd23181ab865b147a0784e49259d7a0dd1bdb78d95a92da5006": {
        "id": "wzx-calculus-2027", "name": "武忠祥高数辅导讲义·强化", "pages": 315,
    },
    "3a86329ba20153d00b52a1e1f72b7a77c751c61a8c18a35ef9daad12bb638b0a": {
        "id": "linear-algebra-answers-2027", "name": "线代强化讲义答案", "pages": 109,
    },
}


def emit(stage, done=0, total=0):
    print(json.dumps({"stage": stage, "done": done, "total": total}), flush=True)


def source_fingerprint(doc):
    digest = hashlib.sha256()
    seen_images = set()
    for page in doc:
        digest.update(f"{page.rect.width:.3f},{page.rect.height:.3f};".encode())
        for xref in page.get_contents():
            digest.update(doc.xref_stream(xref) or b"")
        for image in page.get_images(full=True):
            xref = image[0]
            if xref not in seen_images:
                digest.update(doc.xref_stream_raw(xref) or b"")
                seen_images.add(xref)
    return digest.hexdigest()


def red_marks(page):
    marks = []
    for annot in page.annots() or []:
        color = annot.colors.get("stroke") or []
        if annot.type[1] not in ("Ink", "StrikeOut") or len(color) < 3:
            continue
        if not (color[0] > .70 and color[1] < .45 and color[2] < .45):
            continue
        points = annot.vertices or []
        if annot.type[1] == "Ink":
            points = [point for stroke in points for point in stroke]
        if points:
            rect = fitz.Rect(min(p[0] for p in points), min(p[1] for p in points),
                             max(p[0] for p in points), max(p[1] for p in points))
            rect += (-2, -2, 2, 2)
        else:
            rect = annot.rect
        marks.append(rect & page.rect)
    return marks


def merge_rects(rects):
    result = []
    for rect in sorted(rects, key=lambda r: r.y0):
        if result and rect.y0 <= result[-1].y1 + 2:
            result[-1] |= rect
        else:
            result.append(fitz.Rect(rect))
    return result


def linear_regions(page):
    rects = [d["rect"] for d in page.get_drawings()
             if d.get("fill") and .85 < min(d["fill"]) < .99
             and d["rect"].width > page.rect.width * .6
             and 10 < d["rect"].height < page.rect.height * .8]
    rects = merge_rects(rects)
    starts, answers = [], []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"])
            rect = fitz.Rect(line["bbox"])
            match = re.search(r"【\s*例\s*(\d+)\s*】", text)
            if match:
                box = next((b for b in rects if b.y0 - 5 <= rect.y0 <= b.y1), None)
                starts.append({"rect": box, "top": min(box.y0, rect.y0) - 3 if box else rect.y0 - 3,
                               "label": "例" + match.group(1)})
            if re.search(r"【\s*解\s*】", text):
                answers.append(rect.y0 - 2)
    return starts, answers


def calculus_regions(page):
    # Filled horizontal question bands; outlined notes and marginal headings
    # have too few saturated pixels to qualify.
    pix = page.get_pixmap(matrix=fitz.Matrix(100 / 72, 100 / 72),
                          colorspace=fitz.csRGB, annots=False)
    original = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    im = original.crop((int(original.width * .16), 0, int(original.width * .95), original.height))
    im = im.resize((100, im.height))
    pixels = im.load()
    runs, start, last = [], None, None
    for y in range(im.height):
        count = sum(max(pixels[x, y]) - min(pixels[x, y]) > 35 for x in range(100))
        if count >= 45:
            if start is None:
                start = y
            last = y
        elif start is not None and y - last > 3:
            if (last - start) * .72 >= 12:
                runs.append((start * .72, (last + 1) * .72))
            start = None
    if start is not None and (last - start) * .72 >= 12:
        runs.append((start * .72, (last + 1) * .72))
    return [{"rect": fitz.Rect(page.rect.width * .08, top, page.rect.width * .96, bottom),
             "top": max(30, top - 14), "label": f"题框{i + 1}",
             "isQuestion": solution_badge(original, bottom)}
            for i, (top, bottom) in enumerate(runs)]


def solution_badge(image, bottom):
    """Verified scan layout: an answer starts with a solid, square 解 badge.

    General-method panels have no answer badge. Keep them as end fences, but
    never turn their underlines into questions. Missing/continued badges cause
    a conservative skip rather than inventing a solution boundary.
    """
    top = int((bottom + 1) / .72)
    end = min(image.height - 42, int((bottom + 65) / .72))
    if end <= top:
        return False
    crop = image.crop((int(image.width * .08), top, int(image.width * .20), end))
    pixels, seen = crop.load(), set()
    for y in range(crop.height):
        for x in range(crop.width):
            if (x, y) in seen or max(pixels[x, y]) - min(pixels[x, y]) < 45:
                continue
            pending, points = [(x, y)], []
            seen.add((x, y))
            while pending:
                xx, yy = pending.pop()
                points.append((xx, yy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = xx + dx, yy + dy
                    if (0 <= nx < crop.width and 0 <= ny < crop.height
                            and (nx, ny) not in seen
                            and max(pixels[nx, ny]) - min(pixels[nx, ny]) >= 45):
                        seen.add((nx, ny))
                        pending.append((nx, ny))
            width = max(p[0] for p in points) - min(p[0] for p in points) + 1
            height = max(p[1] for p in points) - min(p[1] for p in points) + 1
            if (8 < width * .72 < 17 and 8 < height * .72 < 17
                    and .8 < width / height < 1.2 and len(points) / (width * height) > .6):
                return True
    return False


def segments(doc, start, end, profile):
    """Page slices of a contiguous question/answer, excluding page furniture."""
    result = []
    for index in range(start[0], end[0] + 1):
        page = doc[index]
        top = start[1] if index == start[0] else (66 if profile.startswith("linear") else 35)
        bottom = end[1] if index == end[0] else page.rect.height - (45 if profile.startswith("linear") else 32)
        if profile.startswith("linear"):
            # Horizontal native text gives a reliable content extent. Ignore
            # diagonal watermarks and blank continuation pages, while keeping
            # handwritten notes within the fenced answer region.
            lines = []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(span["text"] for span in line["spans"]).strip()
                    r = fitz.Rect(line["bbox"])
                    if text and abs(line.get("dir", (1, 0))[1]) < .05 and r.y0 < bottom and r.y1 > top:
                        lines.append(r)
            if not lines:
                continue
            content_top = min(r.y0 for r in lines) - 5
            content_bottom = max(r.y1 for r in lines) + 8
            for annot in page.annots() or []:
                r = annot.rect
                if r.y0 < bottom and r.y1 > top and r.x0 < page.rect.width * .92:
                    content_top = min(content_top, r.y0 - 3)
                    content_bottom = max(content_bottom, r.y1 + 3)
            top, bottom = max(top, content_top), min(bottom, content_bottom)
        if bottom - top > 3:
            result.append((index, fitz.Rect(0, max(0, top), page.rect.width, min(page.rect.height, bottom))))
    return result


def same_target(question, existing, fingerprint, source_path):
    source = existing.get("pdfSource") or {}
    same_source = source.get("sourceFingerprint") == fingerprint
    if not same_source and source.get("pdfPath"):
        same_source = os.path.realpath(source["pdfPath"]) == source_path
        # Compatibility with this repository's published legacy calculus
        # library, whose metadata predates content fingerprints. A renamed
        # source still compares with those verified legacy crops.
        if (not same_source and fingerprint == "2982c22df232fcd23181ab865b147a0784e49259d7a0dd1bdb78d95a92da5006"
                and os.path.basename(source["pdfPath"]) == "27武忠祥高数辅导讲义-强化.pdf"
                and existing.get("id", "").startswith("book005_p") and source.get("importVersion") == 2):
            same_source = True
    if not same_source or source.get("pdfPageIndex") != question["page"]:
        return False
    if source.get("sourceKey") == question["key"]:
        return True
    box = source.get("questionBoundingBox") or source.get("cropBoundingBox")
    if not box:
        return False
    old = fitz.Rect(box["x0"], box["y0"], box["x1"], box["y1"])
    new = question["rect"]
    overlap = max(0, min(old.y1, new.y1) - max(old.y0, new.y0))
    return overlap / max(1, min(old.height, new.height)) > .75


def bbox(rect):
    return dict(zip(("x0", "y0", "x1", "y1"), [round(v, 2) for v in rect]))


def extract(doc, profile, fingerprint, source_path, output, existing):
    questions, all_marks, issues = [], {}, []
    answers, boundaries = [], []
    for index, page in enumerate(doc):
        emit("scanning", index + 1, len(doc))
        marks = red_marks(page)
        if marks:
            all_marks[index] = marks
        if profile["id"].startswith("linear"):
            starts, answer_tops = linear_regions(page)
            answers.extend((index, y) for y in answer_tops)
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(span["text"] for span in line["spans"])
                    if re.match(r"^\s*\d+\.\d+(?:\.\d+)?\s*[\u4e00-\u9fff]", text):
                        boundaries.append((index, line["bbox"][1] - 3))
        else:
            starts = calculus_regions(page)
        for target_index, item in enumerate(starts, 1):
            item.update(page=index, targetIndex=target_index)
            if item["rect"]:
                coords = ",".join(str(round(v, 1)) for v in item["rect"])
                item["key"] = hashlib.sha256(f"{fingerprint}:{index}:{coords}".encode()).hexdigest()[:24]
            questions.append(item)

    selected = []
    for page_index, marks in all_marks.items():
        targets = [q for q in questions if q["page"] == page_index and q["rect"]]
        matched = set()
        unmatched = 0
        for mark in marks:
            overlaps = [(q, (q["rect"] & mark).height) for q in targets if (q["rect"] & mark).width > 0]
            overlaps = [(q, height) for q, height in overlaps if height >= min(4, mark.height * .5)]
            if len(overlaps) == 1:
                matched.add(overlaps[0][0]["key"])
            else:
                unmatched += 1
        for q in targets:
            if q["key"] in matched:
                if q.get("isQuestion", True):
                    selected.append(q)
                else:
                    issues.append({"page": page_index + 1, "reason": "彩色框下未找到可靠的解析起始标记；方法笔记或不完整题目已跳过"})
        if unmatched:
            issues.append({"page": page_index + 1, "reason": f"{unmatched} 处笔迹未唯一匹配到题干；解析区笔记或跨题标记已跳过"})

    rendered, duplicates, legacy_duplicates = [], 0, 0
    for ordinal, q in enumerate(selected):
        emit("rendering", ordinal + 1, len(selected))
        pos = questions.index(q)
        next_q = questions[pos + 1] if pos + 1 < len(questions) else None
        if next_q is None or next_q["page"] - q["page"] > 2:
            issues.append({"page": q["page"] + 1, "reason": "无法可靠确认解析结束边界，已跳过"})
            continue
        end = (next_q["page"], next_q["top"] - 2)
        if profile["id"].startswith("linear"):
            end = min([end] + [boundary for boundary in boundaries if (q["page"], q["top"]) < boundary < end])
            answer = next((a for a in answers if (q["page"], q["rect"].y0) < a < end), None)
            if answer is None:
                issues.append({"page": q["page"] + 1, "reason": "未找到题目对应的【解】边界，已跳过"})
                continue
            question_end = answer
            if answer[0] == q["page"]:
                question_end = (answer[0], max(q["rect"].y1, answer[1]))
        else:
            answer = (q["page"], q["rect"].y1 + 1)
            question_end = answer
        q_parts = segments(doc, (q["page"], q["top"]), question_end, profile["id"])
        a_parts = segments(doc, answer, end, profile["id"])
        if not q_parts or not a_parts or sum(r.height for _, r in a_parts) < 15:
            issues.append({"page": q["page"] + 1, "reason": "题目或解析区域不完整，已跳过"})
            continue
        matches = [old for old in existing if same_target(q, old, fingerprint, source_path)]
        if matches:
            duplicates += 1
            if any(not (old.get("pdfSource") or {}).get("batchId") for old in matches):
                legacy_duplicates += 1
            continue
        images = []
        for kind, parts in (("question", q_parts), ("answer", a_parts)):
            names = []
            for part, (page_index, rect) in enumerate(parts):
                name = f"{q['key']}-{kind}-{part + 1}.png"
                doc[page_index].get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72),
                                           clip=rect, colorspace=fitz.csRGB, annots=True).save(output / name)
                names.append(name)
            images.append(names)
        page_indices = sorted({index for index, _ in q_parts + a_parts})
        full_images = []
        for page_index in page_indices:
            name = f"page-{page_index + 1:03d}-full.png"
            if not (output / name).exists():
                doc[page_index].get_pixmap(dpi=150, colorspace=fitz.csRGB, annots=True).save(output / name)
            full_images.append(name)
        printed = printed_range(doc, q_parts, profile)
        rendered.append({
            "id": "pdf-" + q["key"], "bookName": "", "chapter": "PDF导入", "section": "",
            "questionNo": q["label"], "pageStart": q["page"] + 1, "pageEnd": q_parts[-1][0] + 1,
            "pdfPageLabel": f"PDF第{q['page'] + 1}页", "printedPageNumber": printed,
            "pageRangeText": f"{profile['name']} · PDF第{q['page'] + 1}页 · {q['label']}",
            "questionText": "", "tips": "", "questionImage": images[0][0], "questionImages": images[0],
            "answerImage": images[1][0], "answerImages": images[1], "pageImages": full_images,
            "answerMeta": {"source": "pdf-import", "answerPageStart": answer[0] + 1,
                           "answerPageEnd": a_parts[-1][0] + 1, "printedPageNumber": printed_range(doc, a_parts, profile), "uncertain": False},
            "knowledgeTags": [], "mistakeTags": [], "difficulty": 0, "valueStar": 0, "status": "active",
            "fsrs": {"state": "new", "difficulty": None, "stability": None, "retrievability": None,
                     "lastReview": None, "nextReview": None, "reviewCount": 0, "lapseCount": 0},
            "review": {"mastery": 0, "lastResult": None, "history": []},
            "meta": {"source": "pdf-import", "uncertain": False, "note": "已验证资料规则识别"},
            "pdfSource": {"pdfPath": source_path, "sourceFingerprint": fingerprint, "sourceKey": q["key"],
                          "profileId": profile["id"], "pdfPageIndex": q["page"], "pdfPageNumber": q["page"] + 1,
                          "pdfPageLabel": f"第{q['page'] + 1}页", "targetIndex": q["targetIndex"],
                          "targetLabel": q["label"], "questionBoundingBox": bbox(q["rect"]),
                          "pageImageNumbers": [i + 1 for i in page_indices],
                          "questionPageNumbers": [i + 1 for i, _ in q_parts],
                          "answerPageNumbers": [i + 1 for i, _ in a_parts],
                          "importVersion": 4},
        })
    return {"questions": rendered, "issues": issues, "duplicates": duplicates, "legacyDuplicates": legacy_duplicates,
            "annotatedPages": len(all_marks), "sourceFingerprint": fingerprint, "profile": profile}


def printed_page(doc, page_index, profile):
    if profile["id"].startswith("linear"):
        page = doc[page_index]
        footer = page.get_text(clip=fitz.Rect(0, page.rect.height - 45, page.rect.width, page.rect.height))
        numbers = re.findall(r"(?m)^\s*(\d+)\s*$", footer)
        return numbers[0] if len(numbers) == 1 else ""
    # Verified pagination for this exact scanned document, excluding front matter.
    return str(page_index + 1 - 13) if page_index + 1 > 13 else ""


def printed_range(doc, parts, profile):
    first, last = (printed_page(doc, parts[i][0], profile) for i in (0, -1))
    return first if first == last else f"{first}–{last}" if first and last else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--existing")
    parser.add_argument("--answers-dir")
    parser.add_argument("--inspect-answers", action="store_true")
    parser.add_argument("--render-page", type=int)
    parser.add_argument("--fingerprint")
    args = parser.parse_args()
    path = os.path.realpath(args.input)
    before = os.stat(path)
    with fitz.open(path) as doc:
        if doc.needs_pass:
            raise ValueError("PDF 已加密，请先提供可直接读取的副本")
        if not doc.is_pdf:
            raise ValueError("请选择 PDF 文件")
        emit("validating")
        fingerprint = source_fingerprint(doc)
        profile = PROFILES.get(fingerprint)
        if not profile or len(doc) != profile["pages"]:
            raise ValueError("这份 PDF 尚未验证裁题规则，暂不自动导入。目前支持提供的高数、线代讲义、自控课本及数学二真题套卷；更改文件名仍可识别")
        if args.inspect_answers:
            if profile["id"] != MATH2_PROFILE["id"]: raise ValueError("此资料无需独立答案目录")
            print(json.dumps(answer_matches(args.answers_dir, source_fingerprint), ensure_ascii=False), flush=True)
            return
        if args.inspect:
            print(json.dumps({"pdfPath": path, "sourceFingerprint": fingerprint,
                              "profileId": profile["id"], "name": profile["name"],
                              "pages": len(doc)}, ensure_ascii=False), flush=True)
            return
        if args.render_page is not None:
            if args.fingerprint != fingerprint:
                raise ValueError("源 PDF 与导入资料不一致，无法查看整页")
            if not 1 <= args.render_page <= len(doc):
                raise ValueError("PDF 页码超出范围")
            if profile["id"] == CONTROL_PROFILE["id"]:
                doc[42].set_rotation(180)
                render_control_page(doc[args.render_page - 1], args.output)
            else:
                doc[args.render_page - 1].get_pixmap(dpi=150, colorspace=fitz.csRGB, annots=True).save(args.output)
            after = os.stat(path)
            if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                raise ValueError("读取期间 PDF 被修改，请稍后再试")
            return
        output = Path(args.output)
        output.mkdir(parents=True, exist_ok=True)
        existing = json.loads(Path(args.existing).read_text()) if args.existing else []
        if profile["id"] == MATH2_PROFILE["id"]:
            result = extract_math2(doc, fingerprint, path, output, existing, emit, args.answers_dir, source_fingerprint)
        elif profile["id"] == CONTROL_PROFILE["id"]:
            result = extract_control(doc, fingerprint, path, output, existing, emit)
        else:
            result = extract(doc, profile, fingerprint, path, output, existing)
        after = os.stat(path)
        if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
            raise ValueError("识别期间 PDF 被修改，请保存标注后重新选择；本次未导入")
        (output / "manifest.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        emit("ready", len(result["questions"]), len(result["questions"]))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), flush=True)
        sys.exit(1)
