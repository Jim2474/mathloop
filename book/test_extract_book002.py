import pytest
import sys
import os
import re

# Add book directory to path
sys.path.insert(0, os.path.dirname(__file__))

from extract_book002 import load_pdf, get_chapter_config, parse_text_blocks, TextBlock, detect_questions, QuestionBoundary


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


def test_detect_questions_chapter1():
    """Test question detection for chapter 1."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)
    config = get_chapter_config()

    # Detect questions in chapter 1
    questions = detect_questions(doc, chapter_num=1)

    # Chapter 1 should have around 40-50 questions
    assert len(questions) >= 40
    assert len(questions) <= 55

    # First question should be on page 6
    assert questions[0].page_start == 6
    assert questions[0].question_no == 1

    # Check that questions are sequential
    for i, q in enumerate(questions):
        assert q.question_no == i + 1

    doc.close()
