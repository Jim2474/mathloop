#!/usr/bin/env python3
"""
Book002 PDF Extraction Script
Extracts questions and answers from chapters 1-6 of 武忠祥高等数学辅导讲义·严选题
"""

import fitz  # PyMuPDF
import re
import json
import os
import io
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from PIL import Image


# Chapter configuration
CHAPTER_CONFIG = {
    1: {
        "name": "第一章 函数 极限 连续",
        "question_start": 6,   # PDF page (1-indexed)
        "question_end": 22,    # Last question page
        "answer_start": 147,   # Answer section start
        "answer_end": 157,     # Answer section end (before ch2 answers)
    },
    2: {
        "name": "第二章 一元函数微分学",
        "question_start": 23,
        "question_end": 38,
        "answer_start": 158,
        "answer_end": 167,
    },
    3: {
        "name": "第三章 一元函数积分学",
        "question_start": 39,
        "question_end": 58,
        "answer_start": 168,
        "answer_end": 177,
    },
    4: {
        "name": "第四章 常微分方程",
        "question_start": 59,
        "question_end": 71,
        "answer_start": 178,
        "answer_end": 183,
    },
    5: {
        "name": "第五章 多元函数微分学",
        "question_start": 72,
        "question_end": 88,
        "answer_start": 184,
        "answer_end": 192,
    },
    6: {
        "name": "第六章 二重积分",
        "question_start": 89,
        "question_end": 103,
        "answer_start": 193,
        "answer_end": 198,
    },
}


def load_pdf(pdf_path: str) -> fitz.Document:
    """Load PDF document."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    doc = fitz.open(pdf_path)
    return doc


def get_chapter_config() -> Dict:
    """Get chapter configuration."""
    return CHAPTER_CONFIG


@dataclass
class TextBlock:
    """Represents a text block with position information."""
    text: str
    x: float
    y: float
    width: float
    height: float
    page_num: int  # 1-indexed PDF page number


def parse_text_blocks(page: fitz.Page) -> List[TextBlock]:
    """Parse text blocks from a PDF page with position information."""
    blocks = []
    page_num = page.number + 1  # Convert to 1-indexed

    # Get text dict with position info
    text_dict = page.get_text("dict")

    for block in text_dict["blocks"]:
        if "lines" not in block:
            continue

        for line in block["lines"]:
            # Combine spans into single text
            text = "".join(span["text"] for span in line["spans"]).strip()
            if not text:
                continue

            # Get bounding box
            bbox = line["bbox"]
            x, y, x2, y2 = bbox

            blocks.append(TextBlock(
                text=text,
                x=x,
                y=y,
                width=x2 - x,
                height=y2 - y,
                page_num=page_num
            ))

    return blocks


@dataclass
class QuestionBoundary:
    """Represents the boundary of a question."""
    question_no: int
    page_start: int  # 1-indexed
    y_start: float
    page_end: int  # 1-indexed
    y_end: float
    section: str


def detect_questions(doc: fitz.Document, chapter_num: int) -> List[QuestionBoundary]:
    """Detect questions in a chapter."""
    config = CHAPTER_CONFIG[chapter_num]
    current_section = ""
    question_starts: List[QuestionBoundary] = []

    for pg_idx in range(config["question_start"] - 1, config["question_end"]):
        page = doc[pg_idx]
        blocks = parse_text_blocks(page)

        for block in blocks:
            # Detect section headers
            if re.match(r'^[一二三四五六七八九十]+[、．.]', block.text):
                if "选择题" in block.text:
                    current_section = "一、选择题"
                elif "填空题" in block.text:
                    current_section = "二、填空题"
                elif "解答题" in block.text:
                    current_section = "三、解答题"
                continue

            # Detect question numbers (allow space before dot: "4 .xxx")
            match = re.match(r'^(\d+)\s*[.．]', block.text)
            if match and block.x < 100 and block.y > 50:
                next_no = len(question_starts) + 1
                question_starts.append(QuestionBoundary(
                    question_no=next_no,
                    page_start=block.page_num,
                    y_start=block.y,
                    page_end=0,
                    y_end=0,
                    section=current_section
                ))

    # Set end boundaries
    for i in range(len(question_starts)):
        if i < len(question_starts) - 1:
            next_q = question_starts[i + 1]
            question_starts[i].page_end = next_q.page_start
            question_starts[i].y_end = next_q.y_start
        else:
            question_starts[i].page_end = config["question_end"]
            question_starts[i].y_end = 800  # Approximate page bottom

    return question_starts


@dataclass
class AnswerBoundary:
    """Represents the boundary of an answer."""
    question_no: int
    page_start: int  # 1-indexed
    y_start: float
    page_end: int  # 1-indexed
    y_end: float


def _normalize_ocr_number(text: str) -> str:
    """Normalize OCR errors in leading number (e.g., '1O' → '10').

    Only normalizes the leading number portion, then preserves the rest.
    """
    ocr_map = str.maketrans('OolISBGZ', '00115862')
    prefix = []
    for ch in text:
        if ch.isdigit() or ch in 'OolISBGZ':
            prefix.append(ch.translate(ocr_map))
        else:
            break
    rest = text[len(prefix):]
    return ''.join(prefix) + rest


def detect_answers(doc: fitz.Document, chapter_num: int) -> List[AnswerBoundary]:
    """Detect answers in a chapter's answer section."""
    config = CHAPTER_CONFIG[chapter_num]
    answers: List[AnswerBoundary] = []
    current_answer_no = 0

    for pg_idx in range(config["answer_start"] - 1, config["answer_end"]):
        page = doc[pg_idx]
        blocks = parse_text_blocks(page)

        for block in blocks:
            if block.x >= 130:
                continue

            # Try primary pattern: number + separator + 解/证
            match = re.match(
                r'^(\d+)\s*[.．∙，,：:]\s*[\[【（(]?[解证]', block.text
            )
            if match:
                a_num = int(match.group(1))
            else:
                # Fallback: number + separator (for answers without 解/证)
                match = re.match(
                    r'^(\d+)\s*[.．∙，,：:]', block.text
                )
                if match and len(block.text) <= 50:
                    a_num = int(match.group(1))
                else:
                    # Try OCR-normalized match for numbers like "1O"
                    ocr_text = _normalize_ocr_number(block.text)
                    match = re.match(
                        r'^(\d+)\s*[.．∙，,：:]', ocr_text
                    )
                    if match and len(block.text) <= 50:
                        a_num = int(match.group(1))
                    else:
                        continue

            # Accept if number is greater than current (incremental)
            if a_num > current_answer_no:
                current_answer_no = a_num
                answers.append(AnswerBoundary(
                    question_no=a_num,
                    page_start=block.page_num,
                    y_start=block.y,
                    page_end=0,
                    y_end=0
                ))

    # Set end boundaries
    for i in range(len(answers)):
        if i < len(answers) - 1:
            next_a = answers[i + 1]
            answers[i].page_end = next_a.page_start
            answers[i].y_end = next_a.y_start
        else:
            answers[i].page_end = config["answer_end"]
            answers[i].y_end = 800

    return answers


def render_page_image(doc: fitz.Document, page_num: int, dpi: int = 200) -> Image.Image:
    """Render a PDF page as an image."""
    page = doc[page_num - 1]  # Convert to 0-indexed
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)

    # Convert to PIL Image
    img_data = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_data))
    return img


def crop_question_image(
    doc: fitz.Document,
    question: QuestionBoundary,
    output_path: str,
    dpi: int = 200,
    padding: int = 10
) -> None:
    """Crop question image from PDF pages."""
    # Calculate pixel coordinates
    scale = dpi / 72

    if question.page_start == question.page_end:
        # Single page question
        img = render_page_image(doc, question.page_start, dpi)
        y1 = max(0, int(question.y_start * scale) - padding)
        y2 = min(img.height, int(question.y_end * scale) + padding)
        cropped = img.crop((0, y1, img.width, y2))
        cropped.save(output_path)
    else:
        # Multi-page question: crop from each page and concatenate
        images = []

        # First page: from y_start to bottom
        img1 = render_page_image(doc, question.page_start, dpi)
        y1 = max(0, int(question.y_start * scale) - padding)
        cropped1 = img1.crop((0, y1, img1.width, img1.height))
        images.append(cropped1)

        # Middle pages: full pages
        for pg in range(question.page_start + 1, question.page_end):
            img_mid = render_page_image(doc, pg, dpi)
            images.append(img_mid)

        # Last page: from top to y_end
        img_last = render_page_image(doc, question.page_end, dpi)
        y2 = min(img_last.height, int(question.y_end * scale) + padding)
        cropped_last = img_last.crop((0, 0, img_last.width, y2))
        images.append(cropped_last)

        # Concatenate images vertically
        total_height = sum(img.height for img in images)
        max_width = max(img.width for img in images)
        combined = Image.new("RGB", (max_width, total_height), "white")

        y_offset = 0
        for img in images:
            combined.paste(img, (0, y_offset))
            y_offset += img.height

        combined.save(output_path)


def crop_answer_image(
    doc: fitz.Document,
    answer: AnswerBoundary,
    output_path: str,
    dpi: int = 200,
    padding: int = 10
) -> None:
    """Crop answer image from PDF pages."""
    # Same logic as question cropping
    scale = dpi / 72

    if answer.page_start == answer.page_end:
        # Single page answer
        img = render_page_image(doc, answer.page_start, dpi)
        y1 = max(0, int(answer.y_start * scale) - padding)
        y2 = min(img.height, int(answer.y_end * scale) + padding)
        cropped = img.crop((0, y1, img.width, y2))
        cropped.save(output_path)
    else:
        # Multi-page answer
        images = []

        # First page
        img1 = render_page_image(doc, answer.page_start, dpi)
        y1 = max(0, int(answer.y_start * scale) - padding)
        cropped1 = img1.crop((0, y1, img1.width, img1.height))
        images.append(cropped1)

        # Middle pages
        for pg in range(answer.page_start + 1, answer.page_end):
            img_mid = render_page_image(doc, pg, dpi)
            images.append(img_mid)

        # Last page
        img_last = render_page_image(doc, answer.page_end, dpi)
        y2 = min(img_last.height, int(answer.y_end * scale) + padding)
        cropped_last = img_last.crop((0, 0, img_last.width, y2))
        images.append(cropped_last)

        # Concatenate
        total_height = sum(img.height for img in images)
        max_width = max(img.width for img in images)
        combined = Image.new("RGB", (max_width, total_height), "white")

        y_offset = 0
        for img in images:
            combined.paste(img, (0, y_offset))
            y_offset += img.height

        combined.save(output_path)


def generate_question_entry(
    chapter_num: int,
    question: QuestionBoundary,
    answer: AnswerBoundary
) -> Dict:
    """Generate a question entry in the required JSON format."""
    config = CHAPTER_CONFIG[chapter_num]

    # Generate ID
    q_id = f"book002_ch{chapter_num:02d}_p{question.page_start:03d}_q{question.question_no:03d}"

    # Generate image paths
    question_image = f"questions/{q_id}.png"
    answer_image = f"answers/{q_id}_answer.png"

    # Generate page range text
    if question.page_start == question.page_end:
        page_range_text = f"PDF第{question.page_start}页"
    else:
        page_range_text = f"PDF第{question.page_start}-{question.page_end}页"

    return {
        "id": q_id,
        "bookName": "武忠祥高等数学辅导讲义·严选题",
        "chapter": config["name"],
        "section": question.section,
        "questionNo": str(question.question_no),
        "pageStart": question.page_start,
        "pageEnd": question.page_end,
        "pdfPageLabel": str(question.page_start),
        "printedPageNumber": "",
        "pageRangeText": page_range_text,
        "questionText": "",
        "questionImage": question_image,
        "questionImages": [],
        "answerImage": answer_image,
        "answerImages": [],
        "knowledgeTags": [],
        "mistakeTags": [],
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
            "lapseCount": 0
        },
        "review": {
            "mastery": 0,
            "lastResult": None,
            "history": []
        },
        "meta": {
            "source": "pdf",
            "uncertain": False,
            "note": ""
        },
        "answerMeta": {
            "source": "pdf_answer_section",
            "answerPageStart": answer.page_start,
            "answerPageEnd": answer.page_end,
            "printedPageNumber": "",
            "uncertain": False,
            "note": ""
        }
    }


def generate_questions_json(
    doc: fitz.Document,
    output_path: str
) -> List[Dict]:
    """Generate questions.json for all chapters."""
    all_questions = []

    for chapter_num in range(1, 7):  # Chapters 1-6
        print(f"Processing chapter {chapter_num}...")

        # Detect questions and answers
        questions = detect_questions(doc, chapter_num)
        answers = detect_answers(doc, chapter_num)

        # Build answer lookup by question number
        answer_map = {a.question_no: a for a in answers}

        # Match questions with answers by question number
        for q in questions:
            answer = answer_map.get(q.question_no)
            if answer:
                entry = generate_question_entry(chapter_num, q, answer)
                all_questions.append(entry)
            else:
                print(f"Warning: No answer found for question {q.question_no} in chapter {chapter_num}")

    # Save to file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    return all_questions


def extract_book002(
    pdf_path: str,
    output_dir: str
) -> Dict:
    """Main extraction pipeline."""
    print(f"Starting extraction from: {pdf_path}")
    print(f"Output directory: {output_dir}")

    # Create output directories
    os.makedirs(os.path.join(output_dir, "data"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "questions"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "answers"), exist_ok=True)

    # Open PDF
    doc = load_pdf(pdf_path)

    # Generate questions.json
    json_path = os.path.join(output_dir, "data", "questions.json")
    questions = generate_questions_json(doc, json_path)

    # Crop images for each question
    print("\nCropping question and answer images...")
    for i, q in enumerate(questions):
        # Parse ID: book002_chXX_pYYY_qZZZ
        id_match = re.match(r'book002_ch(\d+)_p(\d+)_q(\d+)', q["id"])
        if not id_match:
            print(f"Warning: Could not parse ID: {q['id']}")
            continue
        chapter_num = int(id_match.group(1))
        question_no = int(id_match.group(3))

        # Get boundaries
        questions_boundary = detect_questions(doc, chapter_num)
        answers_boundary = detect_answers(doc, chapter_num)

        # Find matching boundaries
        q_boundary = next((b for b in questions_boundary if b.question_no == question_no), None)
        a_boundary = next((b for b in answers_boundary if b.question_no == question_no), None)

        if q_boundary and a_boundary:
            # Crop question image
            q_img_path = os.path.join(output_dir, q["questionImage"])
            crop_question_image(doc, q_boundary, q_img_path)

            # Crop answer image
            a_img_path = os.path.join(output_dir, q["answerImage"])
            crop_answer_image(doc, a_boundary, a_img_path)

            if (i + 1) % 10 == 0:
                print(f"  Processed {i + 1}/{len(questions)} questions")

    # Generate extraction log
    log_path = os.path.join(output_dir, "extraction_log.txt")
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write(f"Book002 Extraction Log\n")
        f.write(f"Generated: {datetime.now().isoformat()}\n")
        f.write(f"PDF: {pdf_path}\n")
        f.write(f"Total Questions: {len(questions)}\n\n")

        # Per-chapter stats
        for chapter_num in range(1, 7):
            chapter_questions = [q for q in questions if re.match(r'book002_ch' + f'{chapter_num:02d}', q["id"])]
            f.write(f"Chapter {chapter_num}: {len(chapter_questions)} questions\n")

    # Generate audit.json
    audit_path = os.path.join(output_dir, "audit.json")
    audit_data = {
        "generatedAt": datetime.now().isoformat(),
        "pdfPath": pdf_path,
        "totalQuestions": len(questions),
        "chapters": {}
    }

    for chapter_num in range(1, 7):
        chapter_questions = [q for q in questions if re.match(r'book002_ch' + f'{chapter_num:02d}', q["id"])]
        audit_data["chapters"][chapter_num] = {
            "name": CHAPTER_CONFIG[chapter_num]["name"],
            "questionCount": len(chapter_questions)
        }

    with open(audit_path, 'w', encoding='utf-8') as f:
        json.dump(audit_data, f, ensure_ascii=False, indent=2)

    doc.close()

    print(f"\nExtraction complete!")
    print(f"Total questions: {len(questions)}")
    print(f"Output saved to: {output_dir}")

    return {
        "success": True,
        "total_questions": len(questions),
        "output_dir": output_dir
    }


if __name__ == "__main__":
    import sys

    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    output_dir = r"G:\AI_Projects\Mathloop_04\book\output"

    result = extract_book002(pdf_path, output_dir)
    print(f"\nResult: {result}")
