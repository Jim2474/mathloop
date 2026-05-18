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
