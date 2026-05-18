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
