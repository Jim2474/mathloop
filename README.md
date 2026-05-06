# 考研数学练习册题目数据

## 书本信息

- 书名: 高等数学基础篇·严选题
- 作者: 武忠祥
- 出版社: 中国农业出版社
- 总页数: 114 页（扫描 PDF）
- 页码偏移: PDF页码 = 印刷页码 + 5

## 数据统计

- 总题数: 222
- 精确裁切: 222 道（全部精确裁切）
- Uncertain: 0 道
- 覆盖章节: 第一章到第九章
- 答案匹配: 222 道（100%）
- 答案图片: 233 张

## 章节覆盖

| 章 | 名称 | 印刷页码 | 题数 | 状态 |
|-----|------|----------|------|------|
| 1 | 第一章 函数 极限 连续 | 1-13 | 13 | 精确裁切 |
| 2 | 第二章 导数与微分 | 14-21 | 20 | 精确裁切 |
| 3 | 第三章 微分中值定理及导数应用 | 22-30 | 25 | 精确裁切 |
| 4 | 第四章 不定积分 | 31-35 | 11 | 精确裁切 |
| 5 | 第五章 定积分与反常积分 | 37-46 | 29 | 精确裁切 |
| 6 | 第六章 定积分的应用 | 47-52 | 16 | 精确裁切 |
| 7 | 第七章 微分方程 | 53-62 | 36 | 精确裁切 |
| 8 | 第八章 多元函数微分学 | 63-74 | 44 | 精确裁切 |
| 9 | 第九章 二重积分 | 75-82 | 28 | 精确裁切 |

## 目录结构

```
math-review-data/
├─ questions.json           # 题目数据（JSON 数组，222 条记录）
├─ questions/               # 精确裁切的题目图片
├─ answers/                 # 答案图片（233 张）
├─ pages/                   # 全页渲染图（2x 分辨率 1190x1682）
├─ README.md                # 本文件
├─ PROJECT.md               # 工程规范文档
├─ crop_ch7_9.py            # 第七到九章裁切脚本
├─ extract_answers.py       # 答案提取脚本
└─ verify_data.py           # 数据验收脚本
```

## ID 格式

```
book001_ch{章节号}_p{PDF页码}_q{题号}
示例: book001_ch01_p006_q001
```

- 章节号两位数: ch01, ch02, ...
- PDF 页码三位数: p006, p012, ...
- 题号三位数: q001, q002, ...
- 只用英文、数字、下划线
- 不能重复

## 答案提取说明

答案已从PDF答案区域提取并匹配到对应题目。

### 答案页对应关系

| 章 | 答案PDF页码 | 答案图片数 |
|-----|------------|-----------|
| 1 | 18 | 13 |
| 2 | 26 | 20 |
| 3 | 35 | 25 |
| 4 | 40-41 | 22 |
| 5 | 51 | 29 |
| 6 | 57 | 16 |
| 7 | 67 | 36 |
| 8 | 79 | 44 |
| 9 | 87 | 28 |

### 答案图片命名规则

- 单页答案: `answers/{题目id}_answer.png`
- 多页答案: `answers/{题目id}_answer_1.png`, `answers/{题目id}_answer_2.png`

### 答案JSON字段

每道题新增以下字段：
```json
{
  "answerImage": "answers/book001_ch01_p006_q001_answer.png",
  "answerImages": [],
  "answerMeta": {
    "source": "pdf_answer_section",
    "answerPageStart": 18,
    "answerPageEnd": 18,
    "printedPageNumber": "",
    "uncertain": false,
    "note": ""
  }
}
```

## 验收标准

### 题目数据验收
- [x] questions.json 是标准 JSON 数组
- [x] 总题数 >= 127（当前 222）
- [x] 所有题目均为精确裁切
- [x] 无重复 ID
- [x] 所有 questionImage 路径存在
- [x] 所有必需字段完整
- [x] FSRS 结构完整
- [x] Review 结构完整
- [x] Meta 结构完整
- [x] ID 格式正确

### 答案数据验收
- [x] 所有题目均有答案图片
- [x] 所有 answerImage 路径存在
- [x] answerMeta 字段完整
- [x] 无 uncertain 答案
- [x] 第四章答案跨页正确处理
- [x] 原有字段未被修改

## 裁切坐标说明

所有裁切坐标均为 2x 分辨率像素（页面尺寸 1190×1682）。

裁切方法：
```python
import pymupdf

pdf = pymupdf.open(PDF_PATH)
page = pdf[pdf_page - 1]  # 0-indexed
mat = pymupdf.Matrix(2, 2)
clip = pymupdf.Rect(0, top_px / 2, 1190 / 2, bottom_px / 2)
pix = page.get_pixmap(matrix=mat, clip=clip)
pix.save(output_path)
```

## 更新日志

- 2026-05-06: 完成第一到九章全部精确裁切，共 222 道题
- 2026-05-06: 移除第十到十二章数据（超出范围）
- 2026-05-06: 所有题目均为精确裁切，无 uncertain 标记
- 2026-05-06: 完成答案提取，222 道题全部匹配答案，生成 233 张答案图片
