import pytest
import sys
import os
import re

# Add book directory to path
sys.path.insert(0, os.path.dirname(__file__))

from extract_book002 import load_pdf, get_chapter_config, parse_text_blocks, TextBlock, detect_questions, QuestionBoundary, detect_answers, AnswerBoundary, crop_question_image, crop_answer_image, generate_question_entry, generate_questions_json, extract_book002
from PIL import Image


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


def test_detect_answers_chapter1():
    """Test answer detection for chapter 1."""
    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    doc = load_pdf(pdf_path)

    # Detect answers in chapter 1
    answers = detect_answers(doc, chapter_num=1)

    # Should detect most answers (answer 39 is missing from PDF)
    questions = detect_questions(doc, chapter_num=1)
    assert len(answers) >= len(questions) - 1  # Allow 1 gap for missing answer 39

    # First answer should be on page 147
    assert answers[0].page_start == 147
    assert answers[0].question_no == 1

    # Answers should be in sequential order
    for i in range(1, len(answers)):
        assert answers[i].question_no > answers[i - 1].question_no

    doc.close()


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
    img.close()

    # Cleanup
    os.remove(output_path)
    doc.close()


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
    # Section may be empty if PDF doesn't contain extractable section headers
    assert isinstance(entry["section"], str)
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


def test_extract_book002():
    """Test complete extraction pipeline."""
    import json
    import shutil

    pdf_path = r"G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf"
    output_dir = "test_output"

    # Cleanup from previous runs if exists
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    # Run extraction
    result = extract_book002(pdf_path, output_dir)

    # Verify result
    assert result["success"] == True
    assert result["total_questions"] >= 200
    assert result["total_questions"] <= 300

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
    shutil.rmtree(output_dir)
