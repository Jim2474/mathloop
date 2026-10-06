"""Verified crop catalog for the user's 50-page control textbook scan.

Only these visually checked exercises are eligible. New marks outside this
catalog are reported for manual review. Coordinates refer to the upright scan,
not OCR text; formulas remain source images. The source PDF is never saved.
"""
import hashlib

import fitz

FINGERPRINT = "94a29d17b3aeff98dd5be7610455e0da6f3ff413c9bc04883a4857a2ecae18e4"
PROFILE = {"id": "control-textbook-4th", "name": "自动控制原理（第4版）", "pages": 50}
PRINTED = {1: 10, 2: 11, 4: 51, 5: 52, 6: 53, 7: 54, 11: 94,
           16: 129, 17: 130, 18: 131, 21: 190, 22: 191, 23: 192,
           24: 193, 25: 194, 26: 195, 34: 295, 35: 296,
           43: 422, 44: 423, 45: 424, 49: 442}
CHAPTERS = {1: "绪论", 2: "控制系统的数学模型", 3: "控制系统的时域分析法",
            4: "根轨迹法", 5: "频率响应法", 7: "离散控制系统",
            9: "状态空间分析法", 10: "李雅普诺夫稳定性分析"}

# label, mark page, selection fence, ordered (page, crop) parts.
# Separate figure parts prevent unrelated exercises from entering the crop.
CATALOG = [
    ("1-4", 1, (0, .845, .23, .92), [(1, (0, .851, 1, .900)), (2, (.19, .13, .75, .310))]),
    ("2-1", 4, (0, .935, .15, 1), [(4, (0, .934, 1, 1)), (5, (.18, .03, .94, .354))]),
    ("2-9", 6, (0, .91, .17, .98), [(6, (0, .915, 1, .978)), (7, (.14, .06, .95, .244))]),
    ("3-4", 11, (.12, .12, .24, .19), [(11, (.09, .128, 1, .219))]),
    ("3-7", 11, (.12, .60, .22, .66), [(11, (.09, .600, 1, .634)), (11, (.675, .637, 1, .833))]),
    ("4-2", 16, (0, .70, .18, .79), [(16, (0, .711, .95, .804))]),
    ("4-5", 17, (.10, .245, .24, .30), [(17, (.10, .249, 1, .399))]),
    ("4-10", 17, (.05, .79, .25, .89), [(17, (.05, .832, 1, .944)), (18, (.05, .082, .60, .105))]),
    ("5-1", 21, (.10, .92, .24, .99), [(21, (.10, .932, 1, .985)), (22, (0, .072, .96, .198))]),
    ("5-6", 22, (0, .635, .22, .72), [(22, (0, .670, 1, .714)), (23, (.12, .586, .98, .759))]),
    ("5-16", 24, (.03, .81, .21, .94), [(24, (.03, .857, .96, .950)), (25, (.10, .048, 1, .151))]),
    ("5-22", 26, (.04, .43, .21, .55), [(26, (0, .474, .57, .541)), (26, (.27, .548, .77, .782))]),
    ("7-1", 34, (.40, .605, .73, .69), [(34, (.04, .602, .93, .694))]),
    ("7-3", 34, (.21, .78, .43, .87), [(34, (.07, .754, .92, .873))]),
    ("7-11", 35, (.08, .75, .22, .82), [(35, (.07, .757, 1, .947))]),
    ("9-7", 44, (.02, .375, .15, .55), [(43, (.04, .899, .92, .924)), (44, (.02, .238, .44, .589))]),
    ("9-13", 45, (.07, .27, .18, .33), [(45, (.06, .277, .73, .389))]),
    ("10-1", 49, (.09, .40, .20, .47), [(49, (.09, .416, .61, .492))]),
    ("10-3", 49, (.05, .59, .23, .68), [(49, (.05, .611, .72, .725))]),
]


def blue_marks(page):
    marks = []
    for annot in page.annots() or []:
        color = annot.colors.get("stroke") or []
        if (annot.type[1] not in ("Ink", "Stamp") or len(color) < 3
                or not (color[2] > .8 and color[0] < .5 and color[1] > .25)):
            continue
        # Stamps include duplicate stroke appearances and tiny pen dots.
        if max(annot.rect.width, annot.rect.height) <= 30:
            continue
        rect = annot.rect * page.rotation_matrix
        marks.append(fitz.Rect(rect.x0 / page.rect.width, rect.y0 / page.rect.height,
                              rect.x1 / page.rect.width, rect.y1 / page.rect.height))
    return marks


def pixel_rect(page, bounds):
    return fitz.Rect(bounds[0] * page.rect.width, bounds[1] * page.rect.height,
                     bounds[2] * page.rect.width, bounds[3] * page.rect.height)


def render(page, path, bounds=None):
    scale = min(1, 1800 / page.rect.width)
    page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                   clip=pixel_rect(page, bounds) if bounds else None,
                   colorspace=fitz.csRGB, annots=True).save(path)


def extract_control(doc, fingerprint, source_path, output, existing, emit):
    issues, selected, annotated = [], set(), 0
    for page_number, page in enumerate(doc, 1):
        emit("scanning", page_number, len(doc))
        marks = blue_marks(page)
        annotated += bool(marks)
        unmatched = 0
        for mark in marks:
            matches = []
            for item in CATALOG:
                if item[1] != page_number:
                    continue
                overlap = fitz.Rect(item[2]) & mark
                if overlap.width * overlap.height / max(mark.width * mark.height, 1e-9) > .6:
                    matches.append(item)
            if len(matches) == 1:
                selected.add(matches[0][0])
            else:
                unmatched += 1
        if unmatched:
            issues.append({"page": page_number, "reason": "蓝色标记超出已核对题目边界，已跳过，请人工核对"})
    # PDF page 43 has an incorrect quarter-turn in this exact scan. Fix only
    # the in-memory view after fingerprinting, keeping the source file intact.
    doc[42].set_rotation(180)
    result, duplicates, legacy_duplicates = [], 0, 0
    for target_index, (label, _, _, parts) in enumerate(CATALOG, 1):
        if label not in selected:
            continue
        emit("rendering", len(result) + 1, len(selected))
        key = hashlib.sha256(f"{fingerprint}:exercise:{label}".encode()).hexdigest()[:24]
        prior = [q for q in existing if (q.get("pdfSource") or {}).get("sourceFingerprint") == fingerprint
                 and ((q.get("pdfSource") or {}).get("sourceKey") == key or q.get("questionNo") == label)]
        if prior:
            duplicates += 1
            legacy_duplicates += any(not (q.get("pdfSource") or {}).get("batchId") for q in prior)
            continue
        names = []
        for i, (number, bounds) in enumerate(parts, 1):
            name = f"{key}-question-{i}.png"
            render(doc[number - 1], output / name, bounds)
            names.append(name)
        pages = sorted({number for number, _ in parts})
        full = []
        for number in pages:
            name = f"page-{number:03d}-full.png"
            if not (output / name).exists():
                render(doc[number - 1], output / name)
            full.append(name)
        printed = "、".join(str(PRINTED[number]) for number in pages)
        first, last = pages[0], pages[-1]
        page_label = f"PDF第{first}页" if first == last else f"PDF第{first}–{last}页"
        chapter = int(label.split("-")[0])
        rect = pixel_rect(doc[first - 1], parts[0][1])
        result.append({
            "id": "pdf-" + key, "bookName": "", "chapter": f"第{chapter}章 {CHAPTERS[chapter]}",
            "section": "习题", "questionNo": label, "pageStart": first, "pageEnd": last,
            "pdfPageLabel": page_label, "printedPageNumber": printed,
            "pageRangeText": f"{PROFILE['name']} · {page_label} · 书本第{printed}页 · {label}",
            "questionText": "", "tips": "", "questionImage": names[0], "questionImages": names,
            "answerImage": None, "answerImages": [], "pageImages": full,
            "answerMeta": {"source": "not-provided", "hasAnswer": False, "uncertain": False,
                           "note": "原书未提供参考答案"},
            "knowledgeTags": [CHAPTERS[chapter]], "mistakeTags": [], "difficulty": 0,
            "valueStar": 0, "status": "active",
            "fsrs": {"state": "new", "difficulty": None, "stability": None, "retrievability": None,
                     "lastReview": None, "nextReview": None, "reviewCount": 0, "lapseCount": 0},
            "review": {"mastery": 0, "lastResult": None, "history": []},
            "meta": {"source": "pdf-import", "uncertain": False, "note": "蓝色标记选题；题干和引用图表边界已逐页核对"},
            "pdfSource": {"pdfPath": source_path, "sourceFingerprint": fingerprint, "sourceKey": key,
                          "profileId": PROFILE["id"], "pdfPageIndex": first - 1, "pdfPageNumber": first,
                          "pdfPageLabel": page_label, "targetIndex": target_index,
                          "targetLabel": label, "questionBoundingBox": dict(zip(("x0", "y0", "x1", "y1"), rect)),
                          "pageImageNumbers": pages, "questionPageNumbers": [n for n, _ in parts],
                          "answerPageNumbers": [], "annotationColor": "blue", "importVersion": 5},
        })
    return {"questions": result, "issues": issues, "duplicates": duplicates,
            "legacyDuplicates": legacy_duplicates, "annotatedPages": annotated,
            "sourceFingerprint": fingerprint, "profile": PROFILE}
