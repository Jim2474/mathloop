# Book002 PDF Extraction Design

## Overview

Extract questions and answers from chapters 1-6 of "武忠祥高等数学辅导讲义·严选题" (book002) using automated text-position based detection.

## Requirements

- **Scope**: Chapters 1-6 only (pages 6-103 for questions, answer section for ch1-6)
- **Output**: Standalone in `book/output/` directory
- **Data safety**: Do not modify existing `public/data/questions.json` or any existing images
- **Format**: Exact same JSON schema as book001 for full compatibility

## Architecture

Single Python script (`extract_book002.py`) that:

1. Reads the PDF using PyMuPDF
2. Analyzes page structure by parsing text blocks with coordinates
3. Detects question boundaries using regex patterns for question numbers
4. Renders pages as images at 200 DPI
5. Crops question images from rendered pages
6. Detects and crops answer images from the answer section
7. Generates questions.json with all required fields

## Data Flow

```
PDF Input (219 pages)
    │
    ├─ Question Section (pages 6-103, chapters 1-6)
    │   ├─ Parse text blocks → detect question numbers
    │   ├─ Determine question boundaries (start/end y-coordinates)
    │   ├─ Render pages at 200 DPI
    │   └─ Crop question images → book/output/questions/
    │
    ├─ Answer Section (pages 147+, chapters 1-6 answers)
    │   ├─ Parse text blocks → detect answer numbers (1.【解】)
    │   ├─ Determine answer boundaries
    │   ├─ Render answer pages at 200 DPI
    │   └─ Crop answer images → book/output/answers/
    │
    └─ Generate questions.json
        ├─ Match questions with answers by number
        ├─ Fill all required fields
        └─ Save to book/output/data/questions.json
```

## Question Detection Logic

For each chapter:

1. Iterate through pages in the chapter's page range
2. Parse text blocks with coordinates (x, y positions)
3. Detect question numbers using regex: `^\d+\s*[.．]`
4. Filter by position: Only consider text with x < 100 (left margin) and y > 80 (below header)
5. Determine boundaries:
   - Question starts at the detected number's y-position
   - Question ends at the next question's y-position OR page bottom
   - For multi-page questions: extend to the next page until the next question is found

**Section detection** (选择题/填空题/解答题):
- Look for patterns like `一、选择题`, `二、填空题`, `三、解答题`
- Assign section to all questions until the next section header

**Edge cases**:
- Questions spanning multiple pages
- Questions with sub-questions (a, b, c)
- Questions with images or diagrams

## Answer Detection Logic

For the answer section (pages 147+):

1. **Identify answer pages** for chapters 1-6 using TOC entries:
   - Chapter 1 answers: start at page 147
   - Chapter 2 answers: start at page 158
   - Chapter 3 answers: start at page 168
   - Chapter 4 answers: start at page 178
   - Chapter 5 answers: start at page 184
   - Chapter 6 answers: start at page 193

2. **Parse answer blocks** using regex: `^\d+\s*[.．]\s*【解】`
3. **Determine answer boundaries**:
   - Answer starts at detected number's y-position
   - Answer ends at next answer's y-position OR page bottom
   - Handle multi-page answers (extend until next answer found)

4. **Match answers to questions** by question number (1-to-1 mapping within each chapter)

## Image Cropping

**Rendering settings**:
- DPI: 200 (good quality, ~1190×1682 pixels for A4)
- Format: PNG (lossless)
- Color: RGB

**Question cropping**:
- Crop from rendered page image using y-coordinates from detection
- Add small padding (10px) above and below for visual clarity
- Handle multi-page questions: crop from each page, then vertically concatenate

**Answer cropping**:
- Same approach as questions
- Crop the entire answer region including solution steps
- Handle multi-page answers similarly

**Output naming**:
- Questions: `book002_ch01_p006_q001.png`
- Answers: `book002_ch01_p006_q001_answer.png`

## JSON Schema

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

## Error Handling

- Log all detection results to `book/output/extraction_log.txt`
- Flag uncertain detections (e.g., ambiguous question numbers)
- Generate summary statistics (questions per chapter, success rate)
- Create `book/output/audit.json` with diagnostics for manual review

## Verification

- Count questions per chapter (should match expected range)
- Verify all image files exist and are valid
- Check JSON is valid and all IDs are unique
- Print summary report

## Output Structure

```
book/output/
├── data/questions.json
├── questions/
│   ├── book002_ch01_p006_q001.png
│   └── ...
├── answers/
│   ├── book002_ch01_p006_q001_answer.png
│   └── ...
├── extraction_log.txt
└── audit.json
```
