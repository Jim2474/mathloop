# PDF Extraction Task Brief

## Task

Generate `questions.json` and cropped question/answer images from a math exercise book PDF.

## Input

- PDF: `G:\1-考研资料\MATH\27武忠祥《高等数学辅导讲义.严选题》.pdf`
- 219 pages, 9 chapters of questions + answer section
- PDF is NOT password-protected (PyMuPDF confirms `is_encrypted=False`)
- Output: put everything in `G:\AI_Projects\Mathloop_04\book\output\`

## PDF Structure

### TOC (from PDF bookmarks)

| Chapter | Title | Question Start Page (1-indexed) |
|---------|-------|-------------------------------|
| 1 | 函数 极限 连续 | 6 |
| 2 | 一元函数微分学 | 23 |
| 3 | 一元函数积分学 | 39 |
| 4 | 常微分方程 | 59 |
| 5 | 多元函数微分学 | 72 |
| 6 | 二重积分 | 89 |
| 7 | 无穷级数(仅数学一、三) | 104 |
| 8 | 向量代数与空间解析几何(仅数学一) | 121 |
| 9 | 多元函数积分学(仅数学一) | 132 |

### Answer Section

- Starts at page 147 (TOC entry: "严选题答案与解析")
- Chapter answers follow same chapter order

### Page Layout

- Each page has a header with book/chapter title
- Questions are numbered sequentially within each chapter (1, 2, 3, ...)
- Some questions span multiple pages
- Questions have sections: 一、选择题, 二、填空题, 三、解答题
- Answer area and note area are part of the question layout (include in crop)
- Page size: 595.28 x 841.89 points (A4)

## Target Format

### Output Directory Structure

```
book\output\
├── data\questions.json
├── questions\          ← question image crops
│   ├── book002_ch01_p006_q001.png
│   ├── book002_ch01_p006_q002.png
│   └── ...
├── answers\            ← answer image crops
│   ├── book002_ch01_p006_q001_answer.png
│   └── ...
└── pages\              ← full page images (optional)
```

### questions.json Format

Each entry must match this exact schema:

```json
{
  "id": "book002_ch01_p006_q001",
  "bookName": "武忠祥高等数学辅导讲义·严选题",
  "chapter": "第一章 函数 极限 连续",
  "section": "一、选择题",
  "questionNo": "1",
  "pageStart": 6,
  "pageEnd": 6,
  "pdfPageLabel": "6",
  "printedPageNumber": "1",
  "pageRangeText": "PDF第6页，书本印刷页码第1页",
  "questionText": "",
  "questionImage": "questions/book002_ch01_p006_q001.png",
  "questionImages": [],
  "answerImage": "answers/book002_ch01_p006_q001_answer.png",
  "answerImages": [],
  "knowledgeTags": [],
  "mistakeTags": [],
  "difficulty": 3,
  "valueStar": 3,
  "status": "new",
  "fsrs": {
    "state": "new",
    "difficulty": null,
    "stability": null,
    "retrievability": null,
    "lastReview": null,
    "nextReview": null,
    "reviewCount": 0,
    "lapseCount": 0
  },
  "review": {
    "mastery": 0,
    "lastResult": null,
    "history": []
  },
  "meta": {
    "source": "pdf",
    "uncertain": false,
    "note": ""
  },
  "answerMeta": {
    "source": "pdf_answer_section",
    "answerPageStart": 147,
    "answerPageEnd": 147,
    "printedPageNumber": "",
    "uncertain": false,
    "note": ""
  }
}
```

### ID Convention

`book002_ch{chapter:02d}_p{pdfPage:03d}_q{questionNo:03d}`

- book002 = this is the second book in the system
- chapter: 01-09
- pdfPage: the actual PDF page number (1-indexed)
- questionNo: sequential within the chapter (not per page)

### Key Fields to Fill Correctly

- `chapter`: use the TOC chapter names exactly (e.g. "第一章 函数 极限 连续")
- `section`: detect from content (选择题/填空题/解答题)
- `questionNo`: sequential number within the chapter
- `pageStart`/`pageEnd`: PDF page numbers where the question appears
- `printedPageNumber`: the printed page number on the physical page (may differ from PDF page)
- `answerPageStart`/`answerPageEnd`: PDF page where this question's answer appears

### Fields to Leave as Default

- `questionText`: empty string (OCR is unreliable for math)
- `questionImages`/`answerImages`: empty arrays
- `knowledgeTags`/`mistakeTags`: empty arrays
- `difficulty`: 3
- `valueStar`: 3
- `status`: "new"
- `fsrs`: all nulls/zeros
- `review`: zeros/nulls

## Approach

### Recommended Pipeline

1. **Analyze page structure**: Use PyMuPDF to identify question boundaries by detecting question numbers (regex patterns like `^\d+\.` or `^\d+．`)

2. **Render pages as images**: `page.get_pixmap(dpi=200)` for good quality crops

3. **Detect question regions**: Parse text blocks with coordinates to find where each question starts and ends on a page

4. **Crop question images**: Use PIL to crop from the rendered page image

5. **Match answers**: Parse answer section (pages 147+), match by question number per chapter

6. **Crop answer images**: Same approach as questions

7. **Generate JSON**: Assemble all data into the target format

### Important Notes

- OCR text quality is poor for math formulas — use visual/image approach, not text parsing
- Some questions span multiple pages — handle multi-page questions
- Question numbers are sequential within each chapter, resetting per chapter
- Answer section has same chapter structure as question section
- Use `fitz` (PyMuPDF) for PDF parsing and page rendering
- Use `PIL` (Pillow) for image cropping

## Existing Project Context

The existing `public/data/questions.json` has ~300+ questions from book001 "高等数学基础篇·严选题". The new book (book002) follows the same format. After generation, the output will be placed into the multi-book directory structure at `%APPDATA%\MathLoop\books\{bookId}\`.

## Verification

After generation:
1. Count questions per chapter — should roughly match the number of question numbers visible in the PDF
2. Verify a sample of images — each should show exactly one question with its options
3. Verify answer images match their questions
4. Check JSON is valid and all IDs are unique
