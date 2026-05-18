# Book002 PDF Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract questions and answers from chapters 1-6 of "武忠祥高等数学辅导讲义·严选题" (book002) and generate questions.json with cropped images.

**Architecture:** Single Python script that uses PyMuPDF to parse PDF text blocks with coordinates, detect question/answer boundaries via regex, render pages at 200 DPI, crop images, and generate JSON output.

**Tech Stack:** Python 3, PyMuPDF (fitz), Pillow (PIL)

---

## File Structure

```
book/
├── extract_book002.py          # Main extraction script
├── output/                     # Output directory (created by script)
│   ├── data/questions.json
│   ├── questions/
│   ├── answers/
│   ├── extraction_log.txt
│   └── audit.json
└── test_extract_book002.py     # Unit tests
```

---

### Task 1: Setup and PDF Loading

**Files:**
- Create: `book/extract_book002.py`
- Create: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for PDF loading**

```python
# book/test_extract_book002.py
import pytest
import sys
import os

# Add book directory to path
sys.path.insert(0, os.path.dirname(__file__))

from extract_book002 import load_pdf, get_chapter_config


def test_load_pdf():
    """Test that PDF loads successfully and has expected page count."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)
    assert doc is not None
    assert len(doc) == 219
    assert doc.is_encrypted == False
    doc.close()


def test_get_chapter_config():
    """Test chapter configuration returns correct page ranges."""
    config = get_chapter_config()
    assert len(config) == 6  # Only chapters 1-6
    assert config[1]["name"] == "第一章 函数 极限 连续"
    assert config[1]["question_start"] == 6
    assert config[1]["question_end"] == 22
    assert config[1]["answer_start"] == 147
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_load_pdf -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'extract_book002'"

- [ ] **Step 3: Write minimal implementation**

```python
# book/extract_book002.py
#!/usr/bin/env python3
"""
Book002 PDF Extraction Script
Extracts questions and answers from chapters 1-6 of 武忠祥高等数学辅导讲义·严选题
"""

import fitz  # PyMuPDF
import re
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_load_pdf test_extract_book002.py::test_get_chapter_config -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add PDF loading and chapter configuration"
```

---

### Task 2: Text Block Parsing

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for text block parsing**

```python
# Add to book/test_extract_book002.py

from extract_book002 import parse_text_blocks, TextBlock


def test_parse_text_blocks():
    """Test text block extraction from PDF page."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)

    # Test page 6 (first question page)
    page = doc[5]  # 0-indexed
    blocks = parse_text_blocks(page)

    assert len(blocks) > 0
    # First question should be detected
    question_blocks = [b for b in blocks if re.match(r'^\d+\s*[.．]', b.text)]
    assert len(question_blocks) >= 1

    doc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_parse_text_blocks -v`
Expected: FAIL with "cannot import name 'parse_text_blocks'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after load_pdf function

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_parse_text_blocks -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add text block parsing with position information"
```

---

### Task 3: Question Detection

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for question detection**

```python
# Add to book/test_extract_book002.py

from extract_book002 import detect_questions, QuestionBoundary


def test_detect_questions_chapter1():
    """Test question detection for chapter 1."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)
    config = get_chapter_config()

    # Detect questions in chapter 1
    questions = detect_questions(doc, chapter_num=1)

    # Chapter 1 should have around 13-15 questions
    assert len(questions) >= 10
    assert len(questions) <= 20

    # First question should be on page 6
    assert questions[0].page_start == 6
    assert questions[0].question_no == 1

    # Check that questions are sequential
    for i, q in enumerate(questions):
        assert q.question_no == i + 1

    doc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_detect_questions_chapter1 -v`
Expected: FAIL with "cannot import name 'detect_questions'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after parse_text_blocks function

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
    questions = []
    current_section = ""
    current_question_no = 0

    # Track question starts across pages
    question_starts = []

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

            # Detect question numbers
            match = re.match(r'^(\d+)\s*[.．]', block.text)
            if match and block.x < 100 and block.y > 80:
                q_num = int(match.group(1))

                # Verify sequential numbering
                if q_num == current_question_no + 1:
                    current_question_no = q_num
                    question_starts.append(QuestionBoundary(
                        question_no=q_num,
                        page_start=block.page_num,
                        y_start=block.y,
                        page_end=0,  # Will be set when next question found
                        y_end=0,
                        section=current_section
                    ))

    # Set end boundaries
    for i in range(len(question_starts)):
        if i < len(question_starts) - 1:
            # End at next question's start
            next_q = question_starts[i + 1]
            question_starts[i].page_end = next_q.page_start
            question_starts[i].y_end = next_q.y_start
        else:
            # Last question ends at chapter's last page bottom
            question_starts[i].page_end = config["question_end"]
            question_starts[i].y_end = 800  # Approximate page bottom

    return question_starts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_detect_questions_chapter1 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add question detection with section tracking"
```

---

### Task 4: Answer Detection

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for answer detection**

```python
# Add to book/test_extract_book002.py

from extract_book002 import detect_answers


def test_detect_answers_chapter1():
    """Test answer detection for chapter 1."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)

    # Detect answers in chapter 1
    answers = detect_answers(doc, chapter_num=1)

    # Should have same number of answers as questions
    questions = detect_questions(doc, chapter_num=1)
    assert len(answers) == len(questions)

    # First answer should be on page 147
    assert answers[0].page_start == 147
    assert answers[0].question_no == 1

    doc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_detect_answers_chapter1 -v`
Expected: FAIL with "cannot import name 'detect_answers'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after detect_questions function

@dataclass
class AnswerBoundary:
    """Represents the boundary of an answer."""
    question_no: int
    page_start: int  # 1-indexed
    y_start: float
    page_end: int  # 1-indexed
    y_end: float


def detect_answers(doc: fitz.Document, chapter_num: int) -> List[AnswerBoundary]:
    """Detect answers in a chapter's answer section."""
    config = CHAPTER_CONFIG[chapter_num]
    answers = []
    current_answer_no = 0

    # Track answer starts across pages
    answer_starts = []

    for pg_idx in range(config["answer_start"] - 1, config["answer_end"]):
        page = doc[pg_idx]
        blocks = parse_text_blocks(page)

        for block in blocks:
            # Detect answer numbers (format: N.【解】or N .【解】)
            match = re.match(r'^(\d+)\s*[.．]\s*【解】', block.text)
            if match and block.x < 150:
                a_num = int(match.group(1))

                # Verify sequential numbering
                if a_num == current_answer_no + 1:
                    current_answer_no = a_num
                    answer_starts.append(AnswerBoundary(
                        question_no=a_num,
                        page_start=block.page_num,
                        y_start=block.y,
                        page_end=0,  # Will be set when next answer found
                        y_end=0
                    ))

    # Set end boundaries
    for i in range(len(answer_starts)):
        if i < len(answer_starts) - 1:
            # End at next answer's start
            next_a = answer_starts[i + 1]
            answer_starts[i].page_end = next_a.page_start
            answer_starts[i].y_end = next_a.y_start
        else:
            # Last answer ends at chapter's answer section end
            answer_starts[i].page_end = config["answer_end"]
            answer_starts[i].y_end = 800  # Approximate page bottom

    return answer_starts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_detect_answers_chapter1 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add answer detection with sequential numbering"
```

---

### Task 5: Image Cropping

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for image cropping**

```python
# Add to book/test_extract_book002.py

from extract_book002 import crop_question_image, crop_answer_image
from PIL import Image


def test_crop_question_image():
    """Test question image cropping."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)

    # Get first question boundary
    questions = detect_questions(doc, chapter_num=1)
    q = questions[0]

    # Crop image
    output_path = "test_question_crop.png"
    crop_question_image(doc, q, output_path)

    # Verify image was created
    assert os.path.exists(output_path)

    # Verify image dimensions
    img = Image.open(output_path)
    assert img.width > 0
    assert img.height > 0

    # Cleanup
    os.remove(output_path)
    doc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_crop_question_image -v`
Expected: FAIL with "cannot import name 'crop_question_image'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after detect_answers function

from PIL import Image
import io


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_crop_question_image -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add image cropping for questions and answers"
```

---

### Task 6: JSON Generation

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for JSON generation**

```python
# Add to book/test_extract_book002.py

from extract_book002 import generate_question_entry, generate_questions_json


def test_generate_question_entry():
    """Test question entry generation."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)

    # Get first question and answer
    questions = detect_questions(doc, chapter_num=1)
    answers = detect_answers(doc, chapter_num=1)

    # Generate entry
    entry = generate_question_entry(
        chapter_num=1,
        question=questions[0],
        answer=answers[0]
    )

    # Verify required fields
    assert entry["id"] == "book002_ch01_p006_q001"
    assert entry["bookName"] == "武忠祥高等数学辅导讲义·严选题"
    assert entry["chapter"] == "第一章 函数 极限 连续"
    assert entry["section"] == "一、选择题"
    assert entry["questionNo"] == "1"
    assert entry["pageStart"] == 6
    assert entry["pageEnd"] == 6
    assert entry["questionImage"] == "questions/book002_ch01_p006_q001.png"
    assert entry["answerImage"] == "answers/book002_ch01_p006_q001_answer.png"
    assert entry["status"] == "new"
    assert entry["difficulty"] == 3
    assert entry["valueStar"] == 3

    # Verify fsrs structure
    assert entry["fsrs"]["state"] == "new"
    assert entry["fsrs"]["difficulty"] is None
    assert entry["fsrs"]["reviewCount"] == 0

    # Verify review structure
    assert entry["review"]["mastery"] == 0
    assert entry["review"]["history"] == []

    # Verify meta structure
    assert entry["meta"]["source"] == "pdf"
    assert entry["meta"]["uncertain"] == False

    # Verify answerMeta structure
    assert entry["answerMeta"]["source"] == "pdf_answer_section"
    assert entry["answerMeta"]["answerPageStart"] == 147

    doc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_generate_question_entry -v`
Expected: FAIL with "cannot import name 'generate_question_entry'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after crop_answer_image function

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

        # Match questions with answers
        for i, q in enumerate(questions):
            if i < len(answers):
                entry = generate_question_entry(chapter_num, q, answers[i])
                all_questions.append(entry)
            else:
                print(f"Warning: No answer found for question {q.question_no} in chapter {chapter_num}")

    # Save to file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    return all_questions
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_generate_question_entry -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add JSON generation with complete schema"
```

---

### Task 7: Main Extraction Pipeline

**Files:**
- Modify: `book/extract_book002.py`
- Modify: `book/test_extract_book002.py`

- [ ] **Step 1: Write the failing test for main extraction**

```python
# Add to book/test_extract_book002.py

from extract_book002 import extract_book002


def test_extract_book002():
    """Test complete extraction pipeline."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    output_dir = "test_output"

    # Run extraction
    result = extract_book002(pdf_path, output_dir)

    # Verify result
    assert result["success"] == True
    assert result["total_questions"] >= 50
    assert result["total_questions"] <= 200

    # Verify output files exist
    assert os.path.exists(os.path.join(output_dir, "data", "questions.json"))
    assert os.path.exists(os.path.join(output_dir, "questions"))
    assert os.path.exists(os.path.join(output_dir, "answers"))
    assert os.path.exists(os.path.join(output_dir, "extraction_log.txt"))
    assert os.path.exists(os.path.join(output_dir, "audit.json"))

    # Verify questions.json is valid
    with open(os.path.join(output_dir, "data", "questions.json"), 'r', encoding='utf-8') as f:
        questions = json.load(f)
    assert len(questions) == result["total_questions"]

    # Verify unique IDs
    ids = [q["id"] for q in questions]
    assert len(ids) == len(set(ids))

    # Cleanup
    import shutil
    shutil.rmtree(output_dir)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd book && python -m pytest test_extract_book002.py::test_extract_book002 -v`
Expected: FAIL with "cannot import name 'extract_book002'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to book/extract_book002.py after generate_questions_json function

import shutil
from datetime import datetime


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
        chapter_num = int(q["id"][7:9])
        question_no = int(q["id"][-3:])

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
            chapter_questions = [q for q in questions if q["id"][7:9] == f"{chapter_num:02d}"]
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
        chapter_questions = [q for q in questions if q["id"][7:9] == f"{chapter_num:02d}"]
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd book && python -m pytest test_extract_book002.py::test_extract_book002 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd book && git add extract_book002.py test_extract_book002.py
git commit -m "feat: add main extraction pipeline with image cropping"
```

---

### Task 8: Run Full Extraction

**Files:**
- None (execution only)

- [ ] **Step 1: Run the extraction script**

Run: `cd book && python extract_book002.py`

Expected output:
```
Starting extraction from: G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf
Output directory: G:\AI_Projects\Mathloop_04\book\output
Processing chapter 1...
Processing chapter 2...
Processing chapter 3...
Processing chapter 4...
Processing chapter 5...
Processing chapter 6...

Cropping question and answer images...
  Processed 10/XX questions
  Processed 20/XX questions
  ...

Extraction complete!
Total questions: XX
Output saved to: G:\AI_Projects\Mathloop_04\book\output

Result: {'success': True, 'total_questions': XX, 'output_dir': '...'}
```

- [ ] **Step 2: Verify output structure**

Run: `ls -la book/output/ && ls -la book/output/data/ && ls book/output/questions/ | head -5 && ls book/output/answers/ | head -5`

Expected:
- `book/output/data/questions.json` exists
- `book/output/questions/` contains PNG files
- `book/output/answers/` contains PNG files
- `book/output/extraction_log.txt` exists
- `book/output/audit.json` exists

- [ ] **Step 3: Verify JSON validity**

Run: `python -c "import json; data = json.load(open('book/output/data/questions.json', encoding='utf-8')); print(f'Total questions: {len(data)}'); print(f'Unique IDs: {len(set(q[\"id\"] for q in data))}'); print(f'Sample ID: {data[0][\"id\"]}')"`

Expected:
- Total questions matches expected count
- All IDs are unique
- Sample ID format is correct

- [ ] **Step 4: Verify image files**

Run: `python -c "from PIL import Image; import os; q_dir = 'book/output/questions'; a_dir = 'book/output/answers'; q_files = [f for f in os.listdir(q_dir) if f.endswith('.png')]; a_files = [f for f in os.listdir(a_dir) if f.endswith('.png')]; print(f'Question images: {len(q_files)}'); print(f'Answer images: {len(a_files)}'); img = Image.open(os.path.join(q_dir, q_files[0])); print(f'Sample image size: {img.size}')"`

Expected:
- Question and answer image counts match
- Sample image has reasonable dimensions

- [ ] **Step 5: Commit final output**

```bash
cd book && git add output/
git commit -m "feat: complete book002 extraction for chapters 1-6"
```

---

## Self-Review Checklist

After implementing all tasks:

- [ ] All tests pass: `cd book && python -m pytest test_extract_book002.py -v`
- [ ] JSON is valid and all IDs are unique
- [ ] All image files exist and are valid
- [ ] Question count per chapter matches expected range
- [ ] No existing data was modified (only book/output/ was created)
- [ ] Output format matches book001 exactly
- [ ] Extraction log and audit.json are generated
