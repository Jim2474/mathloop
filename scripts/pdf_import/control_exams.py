"""Checked wrong-question crops for the user's scanned CJLU 801 papers.

Scores and correction strokes were visually distinguished for the checked ink.
Unrecognized ink is reported for review, rather than guessed to be another cross.
The PDF is read-only and every crop retains its own saved source page.
"""
import hashlib
import json
from pathlib import Path

import fitz

CATALOG = json.loads((Path(__file__).parent / "control_exam_catalog.json").read_text())
FINGERPRINT = CATALOG["fingerprint"]
PROFILE = {"id": "cjlu-control-exams", "name": "自动控制原理真题", "pages": 73}


def ink_signature(annot):
    strokes = [[[round(x, 2) for x in point] for point in stroke]
               for stroke in annot.vertices or []]
    return hashlib.sha256(json.dumps(strokes, separators=(",", ":")).encode()).hexdigest()


def select_marks(doc):
    checked = {(m["page"], m["signature"]): m for m in CATALOG["checkedInk"]}
    selected, issues, evidence = {}, [], []
    for number, page in enumerate(doc, 1):
        for ordinal, annot in enumerate(page.annots() or [], 1):
            color = annot.colors.get("stroke") or []
            if annot.type[1] != "Ink" or len(color) < 3 or not (color[0] > .7 and color[1] < .45 and color[2] < .45):
                continue
            signature = ink_signature(annot)
            rule = checked.get((number, signature))
            item = {"page": number, "annotation": ordinal, "signature": signature}
            if rule is None:
                item["result"] = "新增红色笔迹尚未核对，请确认是叉线还是得分；本笔迹未选题"
                issues.append({"page": number, "reason": item["result"]})
            else:
                item["result"] = rule["result"]
                if "target" in rule:
                    target = tuple(rule["target"])
                    selected.setdefault(target, []).append(item)
                    item.update({"year": target[0], "questionNumber": target[1]})
            evidence.append(item)
    return selected, issues, evidence


def render(page, path, bounds=None):
    # This scan uses large page coordinates. Cap the full-page width instead of
    # treating those coordinates as A4 points and producing huge raster files.
    clip = fitz.Rect(bounds[0] * page.rect.width, bounds[1] * page.rect.height,
                     bounds[2] * page.rect.width, bounds[3] * page.rect.height) if bounds else None
    page.get_pixmap(matrix=fitz.Matrix(2000 / page.rect.width, 2000 / page.rect.width),
                    clip=clip, colorspace=fitz.csRGB, annots=True).save(path)


def extract_control_exams(doc, fingerprint, source_path, output, existing, emit):
    selected, issues, evidence = select_marks(doc)
    oldkeys = {(q.get("pdfSource") or {}).get("sourceKey") for q in existing
               if (q.get("pdfSource") or {}).get("sourceFingerprint") == fingerprint}
    result, duplicates = [], 0
    for item in CATALOG["questions"]:
        year, number = item["year"], item["number"]
        if (year, number) not in selected:
            continue
        key = hashlib.sha256(f"{fingerprint}:cjlu801:{year}:{number}".encode()).hexdigest()[:24]
        if key in oldkeys:
            duplicates += 1
            continue
        emit("rendering", len(result) + 1, len(selected))
        crops, full, refs, lookup = [], [], [], {}
        for index, (page_number, bounds) in enumerate(item["parts"]):
            crop = f"{key}-question-{index + 1}.png"
            render(doc[page_number - 1], output / crop, bounds)
            crops.append(crop)
            if page_number not in lookup:
                name = f"source-{fingerprint[:16]}-p{page_number:03d}.png"
                if not (output / name).exists():
                    render(doc[page_number - 1], output / name)
                lookup[page_number] = len(full)
                full.append(name)
            refs.append({"pdfPath": source_path, "sourceFingerprint": fingerprint,
                         "pdfPageNumber": page_number, "printedPageNumber": str(CATALOG["printedPages"][str(page_number)]),
                         "pageImageIndex": lookup[page_number], "cropBoundingBox": bounds})
        first, last = item["parts"][0][0], item["parts"][-1][0]
        printed = str(first - 1) if first == last else f"{first - 1}–{last - 1}"
        parts = item["markedParts"]
        section = item["section"] or "解答题"
        result.append({
            "id": "pdf-" + key, "bookName": "", "chapter": f"{year}年自动控制原理真题",
            "section": section, "questionNo": str(number),
            "exam": {"year": year, "subject": "自动控制原理", "questionNumber": number,
                     "markedParts": parts, "sectionLabel": item["section"]},
            "pageStart": first, "pageEnd": last, "pdfPageLabel": f"PDF第{first}页",
            "printedPageNumber": printed,
            "pageRangeText": f"{year}年自动控制原理真题 · {item['section']}第{number}题 · 试卷册第{printed}页",
            "questionText": "", "tips": "", "questionImage": crops[0], "questionImages": crops,
            "answerImage": None, "answerImages": [], "pageImages": full,
            "answerMeta": {"hasAnswer": False, "source": "not-provided", "uncertain": False,
                           "note": "本次按要求仅导入题目，不附参考答案"},
            "knowledgeTags": [f"{year}年真题", "中国计量大学801"], "mistakeTags": [],
            "difficulty": 0, "valueStar": 0, "status": "active",
            "fsrs": {"state": "new", "difficulty": None, "stability": None, "retrievability": None,
                     "lastReview": None, "nextReview": None, "reviewCount": 0, "lapseCount": 0},
            "review": {"mastery": 0, "lastResult": None, "history": []},
            "meta": {"source": "pdf-import", "uncertain": False,
                     "note": "按已核对的红叉/斜线选题，得分数字不选题；保留整道大题及图表"},
            "pdfSource": {"pdfPath": source_path, "sourceFingerprint": fingerprint, "sourceKey": key,
                          "profileId": PROFILE["id"], "pdfPageIndex": first - 1, "pdfPageNumber": first,
                          "questionPageRefs": refs, "answerPageRefs": [],
                          "annotationColor": "red", "importVersion": 7},
        })
    return {"questions": result, "issues": issues, "duplicates": duplicates, "legacyDuplicates": 0,
            "annotatedPages": len({e["page"] for e in evidence}), "sourceFingerprint": fingerprint,
            "profile": PROFILE, "markEvidence": evidence}
