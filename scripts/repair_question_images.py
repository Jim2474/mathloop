from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PAGE_DIR = Path.home() / ".openclaw" / "workspace" / "math-review-data" / "_rebuild" / "pages"
PUBLIC_DIR = ROOT_DIR / "public"
QUESTIONS_PATH = PUBLIC_DIR / "data" / "questions.json"
OUTPUT_DIR = PUBLIC_DIR / "question-fixes"
FIXES_PATH = PUBLIC_DIR / "data" / "question-image-fixes.json"
AUDIT_PATH = PUBLIC_DIR / "data" / "question-crop-audit.json"


# Coordinates are from math-review-data/_rebuild/pages, rendered at 2x page pixels.
# Each crop must stay scoped to one question. Whole pages or whole groups must not
# become formal review images.
MANUAL_FIXES: dict[str, dict[str, Any]] = {
    "book001_ch02_p020_q006": {
        "page": 20,
        "crop": [0, 1080, 1190, 1560],
        "reason": "原始裁切主要显示上一题答案区，漏掉第 6 题题干。",
    },
    "book001_ch01_p013_q006": {
        "page": 13,
        "crop": [0, 1180, 1190, 1505],
        "reason": "原始裁切主要显示第 5 题答题区，第 6 题题干只露出一小段。",
    },
    "book001_ch01_p014_q009": {
        "page": 14,
        "crop": [0, 890, 1190, 1225],
        "reason": "审计发现原始图文字密度偏低，收紧为第 9 题单题区域。",
    },
    "book001_ch02_p023_q004": {
        "page": 23,
        "crop": [0, 500, 1190, 765],
        "reason": "原始裁切落在第 3 题答题区，实际第 4 题在下一段。",
    },
    "book001_ch02_p023_q005": {
        "page": 23,
        "crop": [0, 870, 1190, 1145],
        "reason": "原始裁切显示第 4 题，逐题裁切整体错后一段。",
    },
    "book001_ch02_p023_q006": {
        "page": 23,
        "crop": [0, 1208, 1190, 1425],
        "reason": "原始裁切只显示第 4 题答题区，复习页看不到第 6 题题干。",
    },
    "book001_ch05_p048_q004": {
        "page": 48,
        "crop": [0, 420, 1190, 760],
        "reason": "原始裁切只显示第 4 题下沿。",
    },
    "book001_ch01_p017_q009": {
        "page": 17,
        "crop": [0, 1035, 1190, 1320],
        "reason": "原始裁切上半部分为空白记录区，题干落在图片底部。",
    },
    "book001_ch05_p048_q006": {
        "page": 48,
        "crop": [0, 1110, 1190, 1500],
        "reason": "原始裁切被第 5 题空白记录区占据。",
    },
}


def main() -> None:
    questions = load_questions()
    question_by_id = {str(question["id"]): question for question in questions}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    remove_generated_fix_images()

    fixes_manifest: dict[str, dict[str, Any]] = {}
    audit_questions: list[dict[str, Any]] = []

    fixed_entries = generate_manual_fixes(question_by_id, fixes_manifest)
    fixed_ids = {entry["questionId"] for entry in fixed_entries}

    for question in questions:
        question_id = str(question["id"])
        if question_id in fixed_ids:
            audit_questions.append(next(entry for entry in fixed_entries if entry["questionId"] == question_id))
            continue
        audit_questions.append(audit_original_crop(question))

    summary = summarize_audit(audit_questions, len(questions), len(fixes_manifest))
    audit_payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePageDir": str(SOURCE_PAGE_DIR),
        "policy": "Only confirmed single-question fixes are used by the app. Suspicious crops stay in this audit until manually verified.",
        "summary": summary,
        "questions": audit_questions,
    }

    FIXES_PATH.write_text(
        json.dumps(fixes_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    AUDIT_PATH.write_text(json.dumps(audit_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        "Generated "
        f"{len(fixes_manifest)} precise fixes. "
        f"Audit: {summary['needsManualReview']} needs manual review, "
        f"{summary['missingOriginalImage']} missing original images."
    )


def load_questions() -> list[dict[str, Any]]:
    return json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))


def remove_generated_fix_images() -> None:
    if not OUTPUT_DIR.exists():
        return

    for path in OUTPUT_DIR.glob("*_fix.png"):
        resolved = path.resolve()
        if OUTPUT_DIR.resolve() not in resolved.parents:
            raise RuntimeError(f"Refusing to delete outside generated fix directory: {path}")
        path.unlink()

    for path in OUTPUT_DIR.iterdir():
        if path.is_dir() and path.name == "__pycache__":
            shutil.rmtree(path)


def generate_manual_fixes(
    question_by_id: dict[str, dict[str, Any]],
    fixes_manifest: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    for question_id, config in MANUAL_FIXES.items():
        question = question_by_id.get(question_id)
        page = int(config["page"])
        source_path = SOURCE_PAGE_DIR / f"page_{page:03d}.png"
        base_entry = build_audit_entry(question_id, question)
        base_entry.update(
            {
                "status": "fix_failed",
                "reason": config["reason"],
                "sourcePage": str(source_path),
            },
        )

        if question is None:
            base_entry["failure"] = "question_id_not_found"
            entries.append(base_entry)
            continue
        if not source_path.exists():
            base_entry["failure"] = "source_page_not_found"
            entries.append(base_entry)
            continue

        image = Image.open(source_path).convert("RGB")
        crop = normalize_crop(config["crop"], image.size)
        if crop is None:
            base_entry["failure"] = "invalid_crop"
            base_entry["crop"] = config["crop"]
            entries.append(base_entry)
            continue

        output_name = f"{question_id}_fix.png"
        output_path = OUTPUT_DIR / output_name
        image.crop(crop).save(output_path, optimize=True)

        fixed_image = f"question-fixes/{output_name}"
        fixes_manifest[question_id] = {
            "fixedImage": fixed_image,
            "reason": config["reason"],
            "source": f"{source_path.name}:{list(crop)}",
            "verified": True,
        }
        base_entry.update(
            {
                "status": "fixed",
                "fixedImage": fixed_image,
                "source": fixes_manifest[question_id]["source"],
                "diagnostics": image_diagnostics(output_path),
            },
        )
        entries.append(base_entry)

    return entries


def audit_original_crop(question: dict[str, Any]) -> dict[str, Any]:
    question_id = str(question["id"])
    entry = build_audit_entry(question_id, question)
    image_path = question.get("questionImage")
    if not isinstance(image_path, str) or not image_path.strip():
        entry.update({"status": "needs_manual_review", "reason": "questionImage 字段为空。"})
        return entry

    absolute_path = PUBLIC_DIR / image_path
    if not absolute_path.exists():
        entry.update(
            {
                "status": "missing_original_image",
                "reason": "questionImage 指向的原图不存在。",
                "imagePath": image_path,
            },
        )
        return entry

    diagnostics = image_diagnostics(absolute_path)
    reasons = classify_original_crop(diagnostics)
    entry.update(
        {
            "status": "needs_manual_review" if reasons else "ok",
            "reason": "；".join(reasons) if reasons else "",
            "imagePath": image_path,
            "diagnostics": diagnostics,
        },
    )
    return entry


def build_audit_entry(question_id: str, question: dict[str, Any] | None) -> dict[str, Any]:
    entry: dict[str, Any] = {"questionId": question_id}
    if question is None:
        return entry

    entry.update(
        {
            "chapter": question.get("chapter", ""),
            "section": question.get("section", ""),
            "questionNo": question.get("questionNo", ""),
            "printedPageNumber": question.get("printedPageNumber", ""),
            "pageStart": question.get("pageStart", ""),
        },
    )
    return entry


def image_diagnostics(path: Path) -> dict[str, Any]:
    image = Image.open(path).convert("L")
    width, height = image.size
    scale = max(1, width // 360)
    sample = image.resize((max(1, width // scale), max(1, height // scale))) if scale > 1 else image
    sample_width, sample_height = sample.size
    get_flattened_data = getattr(sample, "get_flattened_data", None)
    pixels = list(get_flattened_data() if get_flattened_data else sample.getdata())

    row_dark_ratios: list[float] = []
    for y in range(sample_height):
        row = pixels[y * sample_width : (y + 1) * sample_width]
        row_dark_ratios.append(sum(1 for value in row if value < 185) / sample_width)

    content_rows = [index for index, ratio in enumerate(row_dark_ratios) if ratio > 0.012]
    total_dark_ratio = sum(1 for value in pixels if value < 185) / len(pixels)

    return {
        "width": width,
        "height": height,
        "fileBytes": path.stat().st_size,
        "darkPixelRatio": round(total_dark_ratio, 5),
        "upperDarkRatio": round(region_dark_ratio(pixels, sample_width, sample_height, 0.0, 0.33), 5),
        "middleDarkRatio": round(region_dark_ratio(pixels, sample_width, sample_height, 0.33, 0.66), 5),
        "lowerDarkRatio": round(region_dark_ratio(pixels, sample_width, sample_height, 0.66, 1.0), 5),
        "contentTopRatio": round(content_rows[0] / sample_height, 5) if content_rows else None,
        "contentBottomRatio": round(content_rows[-1] / sample_height, 5) if content_rows else None,
        "contentRowRatio": round(len(content_rows) / sample_height, 5),
    }


def classify_original_crop(diagnostics: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    height = int(diagnostics["height"])
    dark_ratio = float(diagnostics["darkPixelRatio"])
    middle_dark = float(diagnostics["middleDarkRatio"])
    lower_dark = float(diagnostics["lowerDarkRatio"])
    content_bottom = diagnostics["contentBottomRatio"]

    if height < 160:
        reasons.append("裁切高度过低，可能不是完整题目。")
    if dark_ratio < 0.015:
        reasons.append("文字像素密度很低，可能裁到了空白或答题区。")
    if height < 280 and middle_dark < 0.01 and lower_dark < 0.01:
        reasons.append("中下部几乎没有题干文字，疑似空白裁切。")
    if height < 280 and isinstance(content_bottom, float) and content_bottom < 0.35:
        reasons.append("有效内容过早结束，后半截可能为空白区域。")

    return reasons


def region_dark_ratio(
    pixels: list[int],
    width: int,
    height: int,
    start_ratio: float,
    end_ratio: float,
) -> float:
    start = max(0, min(height, int(height * start_ratio)))
    end = max(start + 1, min(height, int(height * end_ratio)))
    region: list[int] = []
    for y in range(start, end):
        region.extend(pixels[y * width : (y + 1) * width])
    return sum(1 for value in region if value < 185) / len(region)


def normalize_crop(value: object, size: tuple[int, int]) -> tuple[int, int, int, int] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    width, height = size
    left, top, right, bottom = [int(part) for part in value]
    left = max(0, min(left, width - 1))
    top = max(0, min(top, height - 1))
    right = max(left + 1, min(right, width))
    bottom = max(top + 1, min(bottom, height))
    if right - left < 80 or bottom - top < 80:
        return None
    return (left, top, right, bottom)


def summarize_audit(
    audit_questions: list[dict[str, Any]],
    total_questions: int,
    fixed_count: int,
) -> dict[str, int]:
    return {
        "totalQuestions": total_questions,
        "fixed": fixed_count,
        "ok": sum(1 for item in audit_questions if item.get("status") == "ok"),
        "needsManualReview": sum(1 for item in audit_questions if item.get("status") == "needs_manual_review"),
        "missingOriginalImage": sum(1 for item in audit_questions if item.get("status") == "missing_original_image"),
        "fixFailed": sum(1 for item in audit_questions if item.get("status") == "fix_failed"),
    }


if __name__ == "__main__":
    main()
