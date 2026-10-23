"""Offline, fingerprint-bound Math II paper and separate-answer extraction.

Catalog coordinates are normalized in the upright rendered page. OCR is used
only while preparing this checked catalog; runtime formulas remain source images.
"""
import hashlib
import json
import re
from pathlib import Path

import fitz
from PIL import Image

CATALOG = json.loads((Path(__file__).parent / "math2_catalog.json").read_text())
FINGERPRINT = CATALOG["examFingerprint"]
PROFILE = {"id": "math2-exams-2010-2026", "name": "数学二真题", "pages": 52}


def answer_matches(folder, fingerprint):
    root = Path(folder).resolve()
    if not root.is_dir():
        raise ValueError("请选择有效的答案文件夹")
    found = {year: [] for year in range(2010, 2027)}
    issues = []
    for path in sorted(root.iterdir()):
        if path.suffix.lower() != ".pdf" or not path.is_file():
            continue
        try:
            with fitz.open(path) as doc:
                fp = fingerprint(doc)
                matched = [int(year) for year, data in CATALOG["answers"].items()
                           if data["fingerprint"] == fp and data["pages"] == len(doc)]
                if len(matched) == 1:
                    year = matched[0]
                    # Fingerprint catalog binds the verified content title and question index,
                    # not the name of the file. Renaming cannot change its assigned year.
                    found[year].append({"year": year, "pdfPath": str(path.resolve()),
                                        "sourceFingerprint": fp, "pages": len(doc)})
                else:
                    issues.append({"file": path.name, "reason": "未匹配已核对的解析内容，请检查资料版本"})
        except Exception as error:
            issues.append({"file": path.name, "reason": str(error)})
    matches = []
    for year, candidates in found.items():
        status = "matched" if len(candidates) == 1 else "conflict" if candidates else "missing"
        item = {"year": year, "status": status,
                "detail": "已按内容核对" if status == "matched" else "同年解析有多个副本，请保留一份" if candidates else "缺少已核对的解析"}
        if status == "matched":
            item.update(candidates[0])
        matches.append(item)
    return {"matches": matches, "issues": issues}


def question_parts(year, number):
    data = CATALOG["exams"][str(year)]
    anchors = data["anchors"]
    i = number - 1
    n, first, y = anchors[i]
    assert n == number
    if i + 1 < len(anchors):
        _, last, end = anchors[i + 1]
        end -= .0005
    else:
        last, end = data["lastPage"], .935
    return [(p, (.085, max(.04, y) if p == first else .047,
                  .925, end if p == last else .935)) for p in range(first, last + 1) if p == first or (end if p == last else .935) > .055]


def answer_parts(year, number):
    data = CATALOG["answers"][str(year)]
    anchors = data["anchors"]
    n, first, y = anchors[number - 1]
    assert n == number
    if number < len(anchors):
        _, last, end = anchors[number]
        end -= .0005
    else:
        last, end = data.get("lastPage", data["pages"]), data["bodyBottom"]
    return [(p, (.025, max(.025, y) if p == first else data["bodyTop"],
                  .975, end if p == last else data["bodyBottom"])) for p in range(first, last + 1) if p == first or (end if p == last else data["bodyBottom"]) > data["bodyTop"] + .008]


def select_marks(doc):
    selected, issues, evidence = {}, [], []
    for index, page in enumerate(doc):
        year = 2010 + (index - 1) // 3
        for ordinal, annot in enumerate(page.annots() or [], 1):
            color = annot.colors.get("stroke") or []
            if annot.type[1] not in ("Ink", "StrikeOut") or len(color) < 3 or not (color[0] > .7 and color[1] < .45 and color[2] < .45):
                continue
            # Use actual vertices, not annotation appearance padding.
            points = annot.vertices or []
            if annot.type[1] == "Ink":
                points = [point for stroke in points for point in stroke]
            r = fitz.Rect(min(p[0] for p in points), min(p[1] for p in points),
                          max(p[0] for p in points), max(p[1] for p in points)) if points else annot.rect
            r = r * page.rotation_matrix
            rect = (r.x0 / page.rect.width, r.y0 / page.rect.height,
                    r.x1 / page.rect.width, r.y1 / page.rect.height)
            item = {"page": index + 1, "annotation": ordinal, "bounds": list(rect)}
            if max(r.width, r.height) < 6:
                item["result"] = "忽略孤立小红点"; evidence.append(item); continue
            if year not in range(2010, 2027):
                item["result"] = "目录页批注，待核对"; issues.append({"page": index + 1, "reason": item["result"]}); evidence.append(item); continue
            # Select marks touching the printed question-number column. Interior
            # underlining is retained in the image but does not select another question.
            if rect[0] > .23 or rect[2] < .085:
                item["result"] = "正文补充笔迹，不单独选题"; evidence.append(item); continue
            center = (rect[1] + rect[3]) / 2
            matches = []
            for n, _, _ in CATALOG["exams"][str(year)]["anchors"]:
                for p, bounds in question_parts(year, n):
                    if p == index + 1 and bounds[1] <= center <= bounds[3]:
                        matches.append(n)
            if len(matches) != 1:
                item["result"] = "标记跨越或超出已核对题目边界";issues.append({"page":index+1,"reason":item["result"]});evidence.append(item);continue
            number = matches[0]
            selected.setdefault((year, number), []).append(item)
            item.update({"result": "归入整题", "year": year, "questionNumber": number})
            evidence.append(item)
    return selected, issues, evidence


# Subquestion labels were checked on the annotated source. Only report a label
# while the corresponding mark is present in this subquestion's vertical band.
SUBPARTS = {(2010,16):[(3,.42,.47,"Ⅱ")], (2011,19):[(6,.64,.68,"Ⅱ")],
            (2012,21):[(10,.045,.085,"Ⅱ")], (2012,22):[(10,.21,.245,"Ⅱ")],
            (2013,18):[(12,.65,.685,"Ⅱ")], (2014,19):[(15,.76,.815,"Ⅱ")],
            (2015,22):[(19,.15,.19,"Ⅱ")], (2016,22):[(22,.225,.26,"Ⅱ")],
            (2016,23):[(22,.36,.415,"Ⅱ")]}


def render(page, dest, bounds=None):
    clip = fitz.Rect(bounds[0]*page.rect.width,bounds[1]*page.rect.height,
                     bounds[2]*page.rect.width,bounds[3]*page.rect.height) if bounds else None
    pix = page.get_pixmap(dpi=180, clip=clip, colorspace=fitz.csRGB, annots=True)
    actual = bounds
    if bounds:
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        mask = image.convert("L").point(lambda value: 255 if value < 220 else 0)
        box = mask.getbbox()
        if box is None or sum(mask.histogram()[1:]) < 12:
            return False
        x0,y0,x1,y1=box
        box=(max(0,x0-10),max(0,y0-10),min(pix.width,x1+10),min(pix.height,y1+10))
        image.crop(box).save(dest)
        scale=180/72
        actual=[(pix.x+box[0])/scale/page.rect.width,(pix.y+box[1])/scale/page.rect.height,
                (pix.x+box[2])/scale/page.rect.width,(pix.y+box[3])/scale/page.rect.height]
    else:
        pix.save(dest)
    return actual if bounds else True


def extract_math2(doc, fingerprint, source_path, output, existing, emit, answers_dir, fingerprint_fn):
    if not answers_dir:
        raise ValueError("请选择真题答案文件夹，再识别并预览")
    matched = answer_matches(answers_dir, fingerprint_fn)
    answers = {m["year"]: m for m in matched["matches"] if m["status"] == "matched"}
    selected, issues, evidence = select_marks(doc)
    questions, duplicates = [], 0
    oldkeys = {(q.get("pdfSource") or {}).get("sourceKey") for q in existing
               if (q.get("pdfSource") or {}).get("sourceFingerprint") == fingerprint}
    for count, ((year, number), marks) in enumerate(sorted(selected.items()), 1):
        emit("rendering", count, len(selected))
        key = hashlib.sha256(f"{fingerprint}:math2:{year}:{number}".encode()).hexdigest()[:24]
        if key in oldkeys:
            duplicates += 1; continue
        if year not in answers:
            issues.append({"page": marks[0]["page"], "reason": f"{year}年第{number}题：解析缺失或冲突，本题未导入"});continue
        answer = answers[year]
        apath = Path(answer["pdfPath"])
        before = apath.stat()
        qparts, aparts = question_parts(year,number), answer_parts(year,number)
        page_images, qrefs, arefs, qimages, aimages = [], [], [], [], []
        page_lookup = {}
        with fitz.open(apath) as adoc:
            if fingerprint_fn(adoc) != answer["sourceFingerprint"]:
                raise ValueError("答案 PDF 在匹配后发生变化，请重新识别")
            for kind, srcdoc, parts, path, fp, images, refs in [
                ("question",doc,qparts,source_path,fingerprint,qimages,qrefs),
                ("answer",adoc,aparts,str(apath),answer["sourceFingerprint"],aimages,arefs)]:
                for j,(p,bounds) in enumerate(parts):
                    crop = f"{key}-{kind}-{j+1}.png"
                    actual = render(srcdoc[p-1],output/crop,bounds)
                    if not actual:
                        continue
                    images.append(crop)
                    ident = (fp,p)
                    if ident not in page_lookup:
                        full = f"source-{fp[:16]}-p{p:03d}.png"
                        if not (output/full).is_file():render(srcdoc[p-1],output/full)
                        page_lookup[ident]=len(page_images);page_images.append(full)
                    refs.append({"pdfPath":path,"sourceFingerprint":fp,"pdfPageNumber":p,
                                 "pageImageIndex":page_lookup[ident],"cropBoundingBox":actual})
        after=apath.stat()
        if (before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns):
            raise ValueError("识别期间答案 PDF 被修改，请重新识别")
        if not qimages or not aimages:
            raise ValueError(f"{year}年第{number}题的裁切为空，请核对资料边界")
        marked_parts = [label for p,lo,hi,label in SUBPARTS.get((year,number),[])
                        if any(m["page"]==p and lo <= (m["bounds"][1]+m["bounds"][3])/2 <=hi for m in marks)]
        section = "选择题" if number <= (8 if year<=2020 else 10) else "填空题" if number <= (14 if year<=2020 else 16) else "解答题"
        note = "红斜线/红叉标记；保留整题与完整解析" + (f"；出错小问：{'、'.join(marked_parts)}" if marked_parts else "")
        first,last=qparts[0][0],qparts[-1][0]
        questions.append({"id":"pdf-"+key,"bookName":"","chapter":f"{year}年数学二真题","section":section,"questionNo":str(number),
            "exam":{"year":year,"subject":"数学二","questionNumber":number,"markedParts":marked_parts},
            "pageStart":first,"pageEnd":last,"pdfPageLabel":f"PDF第{first}页","printedPageNumber":str(first) if first==last else f"{first}–{last}",
            "pageRangeText":f"{year}年数学二真题 · 第{number}题 · PDF第{first}–{last}页","questionText":"","tips":"",
            "questionImage":qimages[0],"questionImages":qimages,"answerImage":aimages[0],"answerImages":aimages,"pageImages":page_images,
            "answerMeta":{"hasAnswer":True,"source":apath.name,"answerPageStart":arefs[0]["pdfPageNumber"],"answerPageEnd":arefs[-1]["pdfPageNumber"],"uncertain":False,"note":"按解析内容年份与题号核对，保留整题解析及方法说明"},
            "knowledgeTags":[f"{year}年真题",section],"mistakeTags":[],"difficulty":0,"valueStar":0,"status":"active",
            "fsrs":{"state":"new","difficulty":None,"stability":None,"retrievability":None,"lastReview":None,"nextReview":None,"reviewCount":0,"lapseCount":0},
            "review":{"mastery":0,"lastResult":None,"history":[]},"meta":{"source":"pdf-import","uncertain":False,"note":note},
            "pdfSource":{"pdfPath":source_path,"sourceFingerprint":fingerprint,"sourceKey":key,"profileId":PROFILE["id"],"pdfPageIndex":first-1,"pdfPageNumber":first,
                         "questionPageRefs":qrefs,"answerPageRefs":arefs,"annotationColor":"red","importVersion":6}})
    return {"questions":questions,"issues":issues,"duplicates":duplicates,"legacyDuplicates":0,
            "annotatedPages":len({e["page"] for e in evidence}),"sourceFingerprint":fingerprint,"profile":PROFILE,
            "answerMatches":matched,"markEvidence":evidence}
