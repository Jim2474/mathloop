# MathLoop PDF Import 设计文档

> 状态：**全量全自动处理完成，新建课本 book005 发布完毕，网页版测试中**
> 调查与执行日期：2026-09-28
> 执行者：Antigravity AI
> 原始 PDF 只读未改动，原有 176 道错题数据 (book4) 完好无损隔离

### 已完成
- [x] **修复"保存思路"失败**（2026-09-23）
  - `src-tauri/src/main.rs`：`update_question_tips` 检测到无 `questions.json` 时改写 SQLite（key: `tips::{bookId}::{questionId}`）；新增 `load_question_tips_map` 命令
  - `src/services/desktopBridge.ts`：新增 `loadDesktopQuestionTipsMap()`
  - `src/store/useQuestionStore.ts`：`loadQuestions` 后自动从 SQLite 合并 tips 到 `localTips`；`saveQuestionTips` 立即更新 `localTips`
- [x] **红笔手写真迹还原与多题聚类算法**（2026-09-28）
  - 渲染启用 `annots=True`，100% 还原用户红笔打叉原迹
  - 垂直聚类算法解决同页多题问题，从 126 页中精准拆出 231 处独立错题目标
  - 智能题目切片（包含题号、题干、红叉与配套解析）+ 整页呼吸高亮双视图
- [x] **新建独立课本 `book005` 并全量全自动入库**（2026-09-28）
  - 课本名称：《武忠祥高数辅导讲义·强化错题》（ID: `book005`）
  - 严格隔离 `book4`（用户已有 176 道截图题及复习记录分毫不差保留）
  - 精准映射原书目录（第 10~13 页目录）：231 道错题全部分配至第一至九章及具体小节，附带教材印刷页码（`印刷页 = PDF页 - 13`）
  - 自动发布至 Web 端 `public/books/book005/` 并注册到 `public/books.json`
  - 自动注册至桌面端 SQLite `book-registry` 并写入 `~/Library/Application Support/MathLoop/books/book005/`
  - 自动激活错题复习状态，进入“复习”页可直接开练
- [x] **网页版测试服务启动**（2026-09-28）
  - 本地 Vite 服务运行于 `http://localhost:5173/`

### 待完成（待用户网页版体验确认后）
- [ ] 运行 `npm run tauri:build:mac:unsigned` 打包原生 Mac App 客户端


---

## 一、背景与现状

### 1.1 现有数据位置

| 数据 | 路径 |
|---|---|
| 主数据库 | `~/Library/Application Support/MathLoop/mathloop.db` |
| 错题/FSRS状态 | SQLite `review_store`，键 `review::book4::openclaw-review-state` |
| 截图图片 | Tauri 应用内 IndexedDB `mathloop-custom-images`，键=questionId |
| 截图元数据 | localStorage `mathloop-custom-questions::book4` + IndexedDB 备份 |
| 题目列表（标准书） | `~/Library/Application Support/MathLoop/books/{bookId}/data/questions.json` |
| 书本注册表 | SQLite `review_store`，键 `book-registry` |

### 1.2 现有 book4 状态（重要，不能破坏）

- **活跃错题数**：176 道（全部是截图题，ID 格式：`custom-book4-{timestamp}`）
- **录入日期**：2026-08-24（43道）+ 2026-09-21（133道）
- **sourcePage 字段**：全部为 `"截图"`，无书本页码信息
- **有 FSRS 复习记录**：2 条 reviewLogs（已开始复习）
- **有 note/tips**：目前全部为空

> ⚠️ `book4` **不在 SQLite book-registry** 里，它是通过 localStorage + IndexedDB 管理的"自定义书"。需在实现时一并修复注册问题（见下文 §5.3）。

### 1.3 目标 PDF

```
路径：/Users/jim./_courses/考研资料/27武忠祥高数辅导讲义-强化.pdf
大小：~600 MB
总页数：315页
类型：纯图片扫描版（每页1张嵌入图片，无可提取文字）
创建时间：2026-04-23（macOS Quartz PDF Context）
最后修改：2026-09-08（说明近期仍在标注）
```

**标注情况（PyMuPDF 全量扫描结果）：**

| 指标 | 数值 |
|---|---|
| 有红色 Ink 注释的页数 | **126 页** |
| 总笔画数 | 576 |
| 注释类型 | `Ink`（subtype=15），标准 PDF 注释，非嵌入图片 |
| 红色阈值 | stroke RGB: R>0.7, G<0.4, B<0.4（实测值约 0.96/0.13/0.13）|
| 注释作者 | `title: 'Jim'` |
| 注释日期 | 2026-08-02 起 |

**标注页码完整列表：**
```
[19, 41, 42, 44, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55, 56, 59, 60, 61, 63,
 64, 65, 66, 67, 74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 86, 87, 91, 92, 93,
 94, 95, 97, 98, 100, 101, 102, 103, 105, 106, 107, 108, 109, 110, 111, 112,
 113, 120, 121, 122, 123, 124, 125, 126, 127, 132, 133, 134, 135, 136, 137,
 138, 139, 140, 142, 143, 144, 145, 146, 147, 148, 151, 152, 153, 155, 156,
 158, 159, 160, 170, 172, 173, 174, 175, 176, 177, 178, 179, 186, 187, 188,
 191, 192, 193, 194, 195, 196, 197, 198, 200, 201, 202, 204, 205, 206, 207,
 208, 209, 216, 217, 220, 221, 222, 223, 224, 225, 226, 227]
```

**页面几何信息：**
- 页面尺寸：518.16 × 768.48 pt（标准 A4 竖版）
- 每页图片分辨率：1382 × 2049 px（ICCBased 颜色空间）
- 红色注释 rect 坐标系：PDF pt 单位（左上角原点）

---

## 二、核心挑战

1. **PDF 无文字**：无法通过 OCR 以外的方式提取题号、章节、页码文字
2. **现有错题是截图题**：无结构化章节/页码信息，只有图片
3. **PDF 题目与现有截图可能重叠**：需要去重机制
4. **答案/解析在 PDF 的其他页面**：需要定位答案位置
5. **book4 不在 registry**：影响稳定性，需同步修复

---

## 三、数据结构设计

### 3.1 新题目的 Question 字段扩展

在现有 Question 类型上新增以下字段（均为可选，不破坏旧数据）：

```typescript
// 在 src/types/question.ts 中新增（可选字段）
type Question = {
  // ... 现有字段不变 ...

  // PDF 来源信息（仅 PDF 导入题有值）
  pdfSource?: {
    pdfPath: string;          // PDF 绝对路径（只读引用）
    pdfPageIndex: number;     // PDF 内部页码（0-indexed）
    pdfPageLabel: string;     // 显示用页码（如 "第41页"）
    annotBoundingBox: {       // 红色标注的包围盒（PDF pt 坐标）
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
    annotCount: number;       // 该页红色注释数量
    importedAt: string;       // ISO 时间戳
    importVersion: number;    // 导入批次版本号（用于重新导入识别）
  };

  // 答案位置（PDF 页面引用，暂时用 questionImage 同格式存图）
  // answerImage / answerImages 字段已有，复用
};
```

### 3.2 Question ID 命名规则（PDF 导入题）

```
pdfimport-book4-p{pdfPageIndex:03d}-v{importVersion}
```
示例：`pdfimport-book4-p040-v1`（PDF 第41页，0-indexed=40，第1批次导入）

**设计理由**：
- 与现有 `custom-book4-{timestamp}` 格式明显区分
- 包含页码，便于去重检测
- 包含版本号，允许重新导入时识别旧批次

### 3.3 图片存储路径

由于 book4 是自定义书，图片需存入 IndexedDB（与现有截图题一致）：

```
IndexedDB "mathloop-custom-images":
  pdfimport-book4-p040-v1              → base64 PNG（题目图，全页截图）
  pdfimport-book4-p040-v1-answer       → base64 PNG（答案图，如有）
  pdfimport-book4-p040-v1-region       → base64 PNG（标注区域裁切图，可选）
```

**题目图生成策略**：
- 优先：渲染整页（`annots=False`，不含红色标注），高分辨率（150dpi）
- 可选：在题目图上叠加半透明红色标注位置框（方便用户确认）

### 3.4 mistakeRecord 新字段

```typescript
// 在 ReviewMistakeRecord 类型中新增（可选）
type ReviewMistakeRecord = {
  // ... 现有字段不变 ...
  sourcePage: string;        // 现有：改为填写 "PDF第41页"
  sourceQuestionNo: string;  // 现有：改为填写题号（如能识别）或 "待确认"
  pdfPageIndex?: number;     // 新增：PDF 页码索引
};
```

---

## 四、PDF 解析方案（Python 脚本，离线运行）

### 4.1 工具链

- **已安装**：`pymupdf==1.26.5`（`import fitz`）、`pypdf`
- **Python 版本**：3.9（系统 Python）
- **运行方式**：独立 Python 脚本，不需要 App 运行

### 4.2 脚本执行流程

```
scripts/pdf_import/
├── 01_scan.py          # 扫描 PDF，输出标注页数据
├── 02_render.py        # 渲染页面图片
├── 03_build.py         # 构建 questions.json 增量数据
├── 04_dedup.py         # 与现有数据去重
├── run.sh              # 一键执行全流程
└── output/             # 中间产物（临时，不入库）
    ├── scan_result.json
    ├── pages/           # 渲染的 PNG 文件
    └── import_batch.json  # 最终待导入数据
```

### 4.3 步骤一：扫描 PDF（`01_scan.py`）

```python
# 输入：PDF 路径
# 输出：scan_result.json
# 内容：每个标注页的详细信息

{
  "pdfPath": "/Users/jim./_courses/.../27武忠祥高数辅导讲义-强化.pdf",
  "scannedAt": "2026-09-23T...",
  "totalPages": 315,
  "annotatedPages": [
    {
      "pdfPageIndex": 40,          // 0-indexed
      "pageLabel": "第41页",
      "pageRect": [0, 0, 518.16, 768.48],
      "redAnnotCount": 4,
      "annotBoundingBox": {        // 所有红色注释的联合包围盒
        "x0": 71.1, "y0": 102.4, "x1": 147.9, "y1": 525.4
      },
      "annotDetails": [            // 每个注释单独记录
        {
          "rect": [82.84, 104.45, 105.68, 156.81],
          "creationDate": "2026-08-07T17:43:50"
        }
      ],
      "proposedId": "pdfimport-book4-p040-v1"
    }
  ]
}
```

### 4.4 步骤二：渲染页面（`02_render.py`）

- 分辨率：150 dpi（`fitz.Matrix(150/72, 150/72)`）
- `annots=False`（渲染原始内容，不含红色笔迹）
- 输出：`output/pages/p040.png`（约 1080×1600px）
- **不保存**裁切图（整页更保险，用户可在 App 内看完整题目）
- 可选：`annots=True` 版本，用于人工验证

### 4.5 步骤三：构建导入数据（`03_build.py`）

生成 `import_batch.json`（Question[] 格式），每条记录：

```json
{
  "id": "pdfimport-book4-p040-v1",
  "bookName": "武忠祥高数强化讲义",
  "chapter": "待填写",
  "section": "待填写",
  "questionNo": "PDF第41页",
  "pageStart": 41,
  "pageEnd": 41,
  "pdfPageLabel": "第41页",
  "printedPageNumber": "待填写",
  "pageRangeText": "强化讲义PDF第41页",
  "questionText": "",
  "tips": "",
  "questionImage": "pdfimport-book4-p040-v1",
  "questionImages": ["pdfimport-book4-p040-v1"],
  "answerImage": null,
  "answerImages": null,
  "knowledgeTags": [],
  "mistakeTags": [],
  "difficulty": 0,
  "valueStar": 0,
  "status": "active",
  "fsrs": { "state": "new", "difficulty": null, ... },
  "review": { "mastery": 0, "lastResult": null, "history": [] },
  "meta": { "source": "pdf-import", "uncertain": false, "note": "" },
  "pdfSource": {
    "pdfPath": "/Users/jim./_courses/.../27武忠祥高数辅导讲义-强化.pdf",
    "pdfPageIndex": 40,
    "pdfPageLabel": "第41页",
    "annotBoundingBox": { "x0": 71.1, "y0": 102.4, "x1": 147.9, "y1": 525.4 },
    "annotCount": 4,
    "importedAt": "2026-09-23T...",
    "importVersion": 1
  }
}
```

**关于答案/解析**：
- 本 PDF 是题目+解析一体的讲义（同页或相邻页有详解）
- 初次导入时 `answerImage = null`（不强行识别）
- 后续可在 App 内手动关联答案页，或再做一轮 OCR/答案页检测
- **绝不让 AI 编造答案内容**

---

## 五、旧数据迁移方案

### 5.1 现有 176 道截图题的保护原则

> **不删除、不修改**现有任何 mistakeRecord、card、reviewLog。

现有截图题没有任何结构化信息（chapter/section/pageNo 全为空或"截图"）。导入后，新的 PDF 题目**并列存在**，不替换旧题。

### 5.2 数据写入位置

book4 是自定义书，题目数据存在 IndexedDB（不是 `questions.json` 文件）。

写入步骤：

1. **从 IndexedDB 读取现有题目列表**：调用 `loadCustomBookQuestions('book4')` → `Question[]`
2. **追加新题目**（去重后）
3. **写回 IndexedDB**：调用 `dbBooksPut('questions::book4', JSON.stringify(merged))`
4. **图片写入 IndexedDB**：每个题目的 PNG 以 base64 存入 `mathloop-custom-images`

> ⚠️ IndexedDB 在 Tauri WKWebView 里，不能从 Python 脚本直接写入。需要通过 App 内的导入接口（见 §6）。

### 5.3 修复 book4 注册问题（同步执行）

当前问题：`book4` 只在 localStorage/IndexedDB，不在 SQLite `book-registry`。  
影响：如果 localStorage 被清除，书本列表丢失（176 道 FSRS 数据仍在 SQLite，但找不到对应书本）。

**修复方案**：在 App 启动时（`loadBooks`）检测 SQLite 里没有但 localStorage 里有的书本，自动补写到 SQLite。  
或：实现导入功能时，在 Rust 后端 `add_book` 时同时接受 "custom" 类型，不要求 `questions.json`。

---

## 六、App 内导入接口设计

Python 脚本负责扫描和渲染，最终产物是 `import_batch.json`（Question[]）+ 图片文件目录。App 需要一个导入入口来把这些数据写入 IndexedDB。

### 6.1 新增 Tauri 命令（Rust）

```rust
// src-tauri/src/main.rs 新增

#[tauri::command]
fn import_pdf_questions(book_id: String, batch_json: String) -> Result<ImportResult, String>
```

该命令只需做：
1. 验证 `book_id` 格式
2. 把 `batch_json` 写入磁盘缓存（`~/Library/Application Support/MathLoop/books/{bookId}/import_cache/batch.json`）
3. 前端读取并写入 IndexedDB

> 图片（PNG）文件通过现有 `load_asset_data_url` 从磁盘读取 → 前端转为 base64 → 存入 IndexedDB

### 6.2 App 内导入 UI

在 Navbar 或设置页面新增"从 PDF 导入"按钮：

1. 用户选择 `import_batch.json` 文件（或指向固定路径）
2. App 展示预览：N 道新题，显示缩略图
3. 用户点击"确认导入"
4. App 执行去重 → 写 IndexedDB → 刷新题目列表

---

## 七、去重方案

### 7.1 去重维度

| 维度 | 说明 |
|---|---|
| `pdfPageIndex` | 相同 PDF 页码 → 认为是同一道题 |
| 图片哈希（可选） | 对渲染图做 MD5，防止同页重复导入 |
| ID 前缀 `pdfimport-book4-p{pageIndex}` | 最简单的唯一键 |

### 7.2 去重算法（`04_dedup.py`）

```
1. 读取现有题目列表 existing_questions（从 App 导出或 IndexedDB 导出）
2. 从 existing_questions 中提取已有的 pdfPageIndex 集合 → existing_pages
3. 从 import_batch.json 中过滤掉 pdfSource.pdfPageIndex in existing_pages 的题目
4. 剩余题目为 new_questions（真正待导入）
5. 输出去重报告：跳过N道（已存在），导入M道（新增）
```

### 7.3 现有截图题 vs 新 PDF 题的重叠

现有176道截图题**无法自动匹配**到 PDF 页面（因为截图元数据里没有 PDF 页码）。

**人工辅助方案**：
- 在 App 内为每道截图题显示"关联 PDF 页码"按钮
- 用户填入页码后，系统把对应 PDF 题目合并进来（复用现有 FSRS 记录）
- 或：直接接受两者共存，用户在复习时自行识别

**初版不做自动合并**，避免误操作。

---

## 八、验证准确性

### 8.1 人工验证流程

1. **导入前验证**：`01_scan.py` 输出的标注页预览图（`annots=True` 渲染版），逐页核对红色标注是否对应错题位置
2. **导入后验证**：App 内显示新导入的题目列表，每道题展示：
   - PDF 页码
   - 题目图（全页）
   - 红色标注的包围盒高亮框（半透明覆盖层）

### 8.2 自动验证指标

```python
# 验证脚本输出以下指标
{
  "totalAnnotatedPages": 126,
  "successfullyRendered": 126,
  "failedRendering": 0,
  "deduplicatedCount": 0,      // 重复跳过数
  "importedCount": 126,        // 实际导入数
  "warnings": [
    // 例如：某页注释在页面边缘，可能是误触
    "page 19: all annotations in bottom 15% of page"
  ]
}
```

### 8.3 质量门控规则

- 注释包围盒面积 < 全页面积 1% → 警告（可能是误触笔迹）
- 单页注释数量 > 20 → 警告（可能是密集画线而非题目标记）
- 注释创建时间异常（未来时间、1970年等）→ 跳过

---

## 九、"保存解题思路"失败修复（先决条件）

> 必须先修复这个 bug，再做 PDF 导入，否则导入的新题也无法保存思路。

**Bug 位置**：`src-tauri/src/main.rs`，`update_question_tips` 函数（第206-263行）

**现象**：对 `custom-book4-xxx` 或 `pdfimport-book4-xxx` 等截图题调用时，因 `books/book4/data/questions.json` 不存在而报错。

**修复方案**：在 `update_question_tips` 中，检测到 `questions.json` 不存在时，改为把 tips 写入 SQLite `review_store`，键为：

```
tips::{bookId}::{questionId}
```

前端 `getEffectiveTips` 优先读 SQLite tips，回退到 `questions.json` 中的 tips 字段。

**需要修改的文件**：
- `src-tauri/src/main.rs`：`update_question_tips` 函数
- `src/services/desktopBridge.ts`：`updateDesktopQuestionTips`（可能需要新的读取命令）
- `src/store/useQuestionStore.ts`：`saveQuestionTips` / `getEffectiveTips`（Tauri 分支）

---

## 十、实现顺序建议

```
阶段1（先决条件，不涉及 PDF）
  [1] 修复 book4 注册问题（写入 SQLite book-registry）
  [2] 修复"保存思路"失败（tips 写入 SQLite，支持无 questions.json 的书）

阶段2（离线 Python 脚本）
  [3] 实现 scripts/pdf_import/01_scan.py（扫描红色注释，输出 scan_result.json）
  [4] 实现 scripts/pdf_import/02_render.py（渲染全页 PNG）
  [5] 实现 scripts/pdf_import/03_build.py（构建 import_batch.json）
  [6] 实现 scripts/pdf_import/04_dedup.py（与现有数据去重）
  [7] 人工验证输出结果

阶段3（App 内导入入口）
  [8] Rust：新增 import_pdf_batch Tauri 命令（写 JSON 到磁盘缓存）
  [9] 前端：ImportPage 或 Navbar 按钮，读缓存 → 展示预览 → 确认写 IndexedDB
  [10] 前端：questionLoader 合并 pdfimport 题目
  [11] 前端：ReviewPage 展示 pdfSource 信息（PDF页码、注释位置）

阶段4（体验优化，可延后）
  [12] 答案页关联（手动指定答案 PDF 页码）
  [13] 截图题与 PDF 题手动合并（保留 FSRS 记录）
  [14] 章节/知识点批量标注
```

---

## 十一、关键约束清单

| 约束 | 细节 |
|---|---|
| ❌ 原 PDF 只读 | 禁止 `doc.save()`、`fs.rename()`、移动文件 |
| ❌ 不删现有错题 | `mistakeRecords` 中 active=true 的 176 道题必须保留 |
| ❌ 不修改 FSRS 数据 | `cards`、`reviewLogs` 只追加，不修改已有记录 |
| ❌ 不编造答案 | answerImage 只来自 PDF 渲染，无来源时留 null |
| ✅ PDF 路径只保存引用 | `pdfSource.pdfPath` 只存路径字符串，不复制 PDF |
| ✅ 可重复运行 | 脚本幂等，重复运行不产生重复数据（靠 pdfPageIndex 去重）|
| ✅ 现有 tips/localTips 安全 | 导入新题不影响旧题的 tips 状态 |

---

## 附录 A：关键代码路径速查

| 功能 | 文件 | 关键位置 |
|---|---|---|
| 题目加载 | `src/services/questionLoader.ts` | `loadOpenClawQuestions()` |
| 截图题存储 | `src/services/customQuestionService.ts` | `createCustomQuestion()`, `buildCustomQuestion()` |
| 自定义书题目存储 | `src/services/webBookService.ts` | `addCustomBook()`, `loadCustomBookQuestions()` |
| 复习状态持久化 | `src/store/useReviewStore.ts` | `markMistakeQuestion()` |
| SQLite 读写 | `src-tauri/src/main.rs` | `review_store_get/set()` |
| tips 保存（有 bug） | `src-tauri/src/main.rs` | `update_question_tips()`（L206-263）|
| tips 调用前端 | `src/store/useQuestionStore.ts` | `saveQuestionTips()`（L55-72）|

## 附录 B：PyMuPDF 关键代码片段

```python
import fitz

pdf_path = "/Users/jim./_courses/考研资料/27武忠祥高数辅导讲义-强化.pdf"
doc = fitz.open(pdf_path)

# 遍历所有页，找红色 Ink 注释
for i in range(len(doc)):
    page = doc[i]
    red_annots = []
    annot = page.first_annot
    while annot:
        try:
            c = annot.colors.get('stroke', [])
            if len(c) >= 3 and c[0] > 0.7 and c[1] < 0.4 and c[2] < 0.4:
                red_annots.append({'rect': list(annot.rect), 'info': annot.info})
        except:
            pass
        try:
            annot = annot.next
        except:
            break
    
    if red_annots:
        # 渲染该页（150dpi，不含注释）
        mat = fitz.Matrix(150/72, 150/72)
        pix = page.get_pixmap(matrix=mat, annots=False)
        pix.save(f"output/pages/p{i:03d}.png")

doc.close()  # 不调用 save()，保证只读
```

## 附录 C：SQLite 数据现状速查

```sql
-- 查看所有书本和数据量
SELECT key, length(value), updated_at FROM review_store ORDER BY updated_at DESC;

-- 查看 book4 的错题数量
SELECT json_extract(value, '$.state.mistakeRecords') FROM review_store 
WHERE key = 'review::book4::openclaw-review-state';

-- 当前 book-registry 内容（book4 不在其中）
SELECT value FROM review_store WHERE key = 'book-registry';
```

当前 book-registry：`default`、`book001`（高等数学基础篇）、`book002`（武忠祥辅导讲义）、`book003`（控制考研777）。**`book4` 未注册。**
