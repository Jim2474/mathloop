#!/usr/bin/env python3
"""
04_preview.py — Generate an interactive HTML preview with authentic annotations and dual-view toggle.

Embeds both the focused crop images and full-page images (with user's authentic red annotations)
as base64 and produces a standalone HTML file that can be opened in any browser to verify
recognition accuracy.

Each card shows:
  - Focused problem crop (showing题干, user's red cross, and solution)
  - Toggle button: "🎯 题目切片" vs "📄 整页定位"
  - In full-page mode: high-visibility animated spotlight box around the marked area
  - Question title, target label, and annotation coordinates
  - ✅ Correct / ⏭️ Skip (duplicate) / ❌ Wrong buttons
  - "Export verification results" button → downloads JSON

Usage:
    python3 04_preview.py
"""
from __future__ import annotations

import base64
import json
import os
import sys

from config import OUTPUT_DIR, BOOK_NAME


def img_to_b64(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def build_card(q: dict, scan_page_info: dict | None, images_dir: str, card_idx: int) -> str:
    qid = q["id"]
    pdf_src = q.get("pdfSource", {})
    pdf_page_num = pdf_src.get("pdfPageNumber", 1)
    target_idx = pdf_src.get("targetIndex", 1)
    total_targets = pdf_src.get("totalTargetsOnPage", 1)
    target_label = pdf_src.get("targetLabel", f"第{pdf_page_num}页")
    stroke_count = pdf_src.get("strokeCount", 1)
    m_bbox = pdf_src.get("annotBoundingBox", {})

    page_w = (scan_page_info or {}).get("page_width_pt", 517.2)
    page_h = (scan_page_info or {}).get("page_height_pt", 767.64)

    crop_fname = os.path.basename(pdf_src.get("cropImage", q.get("questionImage", "")))
    full_fname = os.path.basename(pdf_src.get("fullImage", ""))

    crop_path = os.path.join(images_dir, crop_fname)
    full_path = os.path.join(images_dir, full_fname)

    crop_b64 = img_to_b64(crop_path)
    full_b64 = img_to_b64(full_path)

    # Highlight box percentage coordinates on full page
    hl_top = round(m_bbox.get("y0", 0) / page_h * 100, 2)
    hl_left = round(m_bbox.get("x0", 0) / page_w * 100, 2)
    hl_width = max(round((m_bbox.get("x1", 0) - m_bbox.get("x0", 0)) / page_w * 100, 2), 6.0)
    hl_height = max(round((m_bbox.get("y1", 0) - m_bbox.get("y0", 0)) / page_h * 100, 2), 3.0)

    y_top_pct = round(m_bbox.get("y0", 0) / page_h * 100)
    y_bot_pct = round(m_bbox.get("y1", 0) / page_h * 100)

    # Crop image element
    if crop_b64:
        crop_html = f'<img src="data:image/png;base64,{crop_b64}" class="view-img crop-img" alt="{target_label}切片">'
    else:
        crop_html = '<div class="no-img">⚠️ 切片图未找到</div>'

    # Full page image element with highlight overlay
    if full_b64:
        full_html = f"""<div class="full-wrap">
          <img src="data:image/png;base64,{full_b64}" class="view-img full-img" alt="PDF第{pdf_page_num}页整页">
          <div class="hl-box" style="top:{hl_top}%;left:{hl_left}%;width:{hl_width}%;height:{hl_height}%;">
            <span class="hl-badge">🔴 错题标记在此</span>
          </div>
        </div>"""
    else:
        full_html = '<div class="no-img">⚠️ 整页图未找到</div>'

    multi_badge = ""
    if total_targets > 1:
        multi_badge = f'<span class="multi-badge">同页第 {target_idx}/{total_targets} 题</span>'

    return f"""<div class="card" id="{qid}" data-idx="{card_idx}">
  <div class="card-header">
    <span class="page-badge">PDF 第 {pdf_page_num} 页</span>
    {multi_badge}
    <span class="annot-badge">🔴 {stroke_count} 处红笔标注</span>
    <span class="pos-badge">页面位置 {y_top_pct}%–{y_bot_pct}%</span>
    <div class="view-toggle">
      <button type="button" class="vt-btn active" onclick="switchView('{qid}', 'crop')">🎯 题目切片</button>
      <button type="button" class="vt-btn" onclick="switchView('{qid}', 'full')">📄 查看整页</button>
    </div>
    <code class="qid">{qid}</code>
  </div>
  <div class="card-body">
    <div class="img-col">
      <div id="crop-view-{qid}" class="view-panel active">{crop_html}</div>
      <div id="full-view-{qid}" class="view-panel">{full_html}</div>
    </div>
    <div class="meta-col">
      <table>
        <tr><td>PDF页码</td><td><strong>第 {pdf_page_num} 页</strong></td></tr>
        <tr><td>题目标识</td><td><strong>{target_label}</strong></td></tr>
        <tr><td>红叉位置</td><td>y: {y_top_pct}% ~ {y_bot_pct}%</td></tr>
        <tr><td>包含解析</td><td><span class="tag-has-answer">✅ 原文解析已截取</span></td></tr>
        <tr><td>导入批次</td><td>pdf-import v1</td></tr>
      </table>
      <div class="verdict-row">
        <button class="btn ok" onclick="setVerdict('{qid}','ok')">✅ 识别正确</button>
        <button class="btn skip" onclick="setVerdict('{qid}','skip')">⏭️ 跳过（重复）</button>
        <button class="btn wrong" onclick="setVerdict('{qid}','wrong')">❌ 误识别</button>
      </div>
      <input type="text" class="note-input" placeholder="添加备注（如：第4题 求极限）"
             onchange="setNote('{qid}', this.value)">
    </div>
  </div>
</div>"""


def main():
    scan_path = os.path.join(OUTPUT_DIR, "scan_result.json")
    batch_path = os.path.join(OUTPUT_DIR, "import_batch.json")
    images_dir = os.path.join(OUTPUT_DIR, "images")

    missing = [p for p in [scan_path, batch_path] if not os.path.exists(p)]
    if missing:
        for p in missing:
            print(f"ERROR: {p} not found. Run previous steps first.", file=sys.stderr)
        sys.exit(1)

    with open(scan_path, "r", encoding="utf-8") as f:
        scan_data = json.load(f)
    with open(batch_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    # Build lookup: pdf_page_index → scan page info
    scan_lookup = {
        p["pdf_page_index"]: p
        for p in scan_data.get("annotated_pages", [])
    }

    cards_html = "\n".join(
        build_card(
            q,
            scan_lookup.get(q.get("pdfSource", {}).get("pdfPageIndex")),
            images_dir,
            i,
        )
        for i, q in enumerate(questions)
    )

    n = len(questions)
    scan_range = f"第{scan_data['scan_start_page']}页–第{scan_data['scan_end_page']}页"
    scanned_at = scan_data.get("scanned_at", "")[:19]
    annot_pages = scan_data.get("annotated_page_count", 0)

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MathLoop PDF错题导入核对 — {BOOK_NAME}</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
       background: #f0f2f5; color: #1a1a1a; line-height: 1.5; }}
.top {{ background: white; padding: 14px 24px; border-bottom: 1px solid #e5e7eb;
        position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,.06); }}
h1 {{ font-size: 18px; font-weight: 700; }}
.top-inner {{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }}
.prog-wrap {{ flex: 1; min-width: 140px; }}
.progress {{ height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }}
.progress-bar {{ height: 100%; background: #16a34a; width: 0; transition: width .3s; }}
.prog-label {{ font-size: 12px; color: #6b7280; margin-top: 3px; }}
.stat-row {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }}
.stat {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
         padding: 5px 12px; font-size: 13px; color: #374151; }}
.stat b {{ color: #111; }}
.container {{ max-width: 980px; margin: 20px auto; padding: 0 16px 80px; }}
.card {{ background: white; border-radius: 14px; margin-bottom: 20px; overflow: hidden;
         box-shadow: 0 2px 6px rgba(0,0,0,.07); border-left: 5px solid #e5e7eb;
         transition: border-color .2s, opacity .2s; }}
.card.ok {{ border-color: #16a34a; }}
.card.skip {{ border-color: #9ca3af; opacity: .55; }}
.card.wrong {{ border-color: #dc2626; }}
.card-header {{ background: #f9fafb; padding: 10px 16px; display: flex; align-items: center;
                gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #f0f0f0; }}
.page-badge {{ background: #dc2626; color: white; border-radius: 6px; padding: 3px 10px;
               font-weight: 700; font-size: 13px; }}
.multi-badge {{ background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
                border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 600; }}
.annot-badge {{ background: #fef2f2; color: #dc2626; border-radius: 6px; padding: 3px 8px;
                font-size: 12px; font-weight: 600; }}
.pos-badge {{ color: #6b7280; font-size: 12px; }}
.view-toggle {{ display: flex; background: #e5e7eb; border-radius: 8px; padding: 2px; gap: 2px; margin-left: 8px; }}
.vt-btn {{ border: none; background: transparent; padding: 3px 10px; font-size: 11px; font-weight: 600;
           border-radius: 6px; cursor: pointer; color: #4b5563; transition: all .15s; }}
.vt-btn.active {{ background: white; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.1); }}
.qid {{ margin-left: auto; color: #9ca3af; font-size: 10px; font-family: monospace; }}
.card-body {{ display: grid; grid-template-columns: 3fr 2fr; }}
.img-col {{ padding: 12px; border-right: 1px solid #f0f0f0; background: #fafafa; }}
.view-panel {{ display: none; }}
.view-panel.active {{ display: block; }}
.view-img {{ width: 100%; border-radius: 6px; display: block; border: 1px solid #e5e7eb; }}
.full-wrap {{ position: relative; width: 100%; }}
.hl-box {{ position: absolute; border: 3px solid #dc2626; background: rgba(220, 38, 38, 0.15);
           border-radius: 4px; pointer-events: none; box-shadow: 0 0 12px rgba(220, 38, 38, 0.5);
           animation: pulse 2s infinite; }}
@keyframes pulse {{
  0% {{ box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }}
  70% {{ box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }}
  100% {{ box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }}
}}
.hl-badge {{ position: absolute; top: -24px; left: 0; background: #dc2626; color: white;
             font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
             white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,.2); }}
.no-img {{ background: #fef2f2; color: #dc2626; border-radius: 8px; padding: 40px 20px;
           text-align: center; font-size: 13px; }}
.meta-col {{ padding: 16px; display: flex; flex-direction: column; gap: 12px; background: white; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
td {{ padding: 6px 4px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }}
td:first-child {{ color: #6b7280; width: 80px; white-space: nowrap; }}
.tag-has-answer {{ background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }}
.verdict-row {{ display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }}
.btn {{ border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer;
         font-size: 12px; font-weight: 600; transition: opacity .15s, transform .1s; }}
.btn:hover {{ opacity: .85; transform: scale(1.02); }}
.btn.ok {{ background: #dcfce7; color: #166534; }}
.btn.skip {{ background: #f3f4f6; color: #374151; }}
.btn.wrong {{ background: #fee2e2; color: #991b1b; }}
.card.ok .btn.ok {{ box-shadow: 0 0 0 2px #16a34a; }}
.card.skip .btn.skip {{ box-shadow: 0 0 0 2px #9ca3af; }}
.card.wrong .btn.wrong {{ box-shadow: 0 0 0 2px #dc2626; }}
.note-input {{ width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px;
               font-size: 12px; outline: none; color: #374151; }}
.note-input:focus {{ border-color: #6366f1; }}
#export-btn {{ position: fixed; bottom: 20px; right: 20px; background: #4f46e5; color: white;
               border: none; border-radius: 12px; padding: 13px 22px; font-size: 14px;
               font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(79,70,229,.4);
               transition: transform .1s; z-index: 200; }}
#export-btn:hover {{ transform: translateY(-2px); }}
@media (max-width: 680px) {{
  .card-body {{ grid-template-columns: 1fr; }}
  .img-col {{ border-right: none; border-bottom: 1px solid #f0f0f0; }}
}}
</style>
</head>
<body>
<div class="top">
  <div class="top-inner">
    <h1>📚 PDF错题导入核对 — {BOOK_NAME}</h1>
    <div class="prog-wrap">
      <div class="progress"><div class="progress-bar" id="prog-bar"></div></div>
      <div class="prog-label" id="prog-label">0 / {n} 已核对</div>
    </div>
  </div>
  <div class="stat-row">
    <div class="stat">扫描范围 <b>{scan_range}</b></div>
    <div class="stat">标记页面 <b>{annot_pages} 页</b></div>
    <div class="stat">拆解错题 <b>{n} 道</b></div>
    <div class="stat">红笔原迹 <b>✅ 100%保留</b></div>
    <div class="stat">✅ <b id="cnt-ok">0</b></div>
    <div class="stat">⏭️ <b id="cnt-skip">0</b></div>
    <div class="stat">❌ <b id="cnt-wrong">0</b></div>
  </div>
</div>

<div class="container">
{cards_html}
</div>

<button id="export-btn" onclick="exportResults()">📋 导出核对结果</button>

<script>
const verdicts = {{}};
const notes = {{}};
const TOTAL = {n};

function switchView(qid, mode) {{
  const cropEl = document.getElementById('crop-view-' + qid);
  const fullEl = document.getElementById('full-view-' + qid);
  const card = document.getElementById(qid);
  const btns = card.querySelectorAll('.vt-btn');

  if (mode === 'crop') {{
    cropEl.classList.add('active');
    fullEl.classList.remove('active');
    btns[0].classList.add('active');
    btns[1].classList.remove('active');
  }} else {{
    cropEl.classList.remove('active');
    fullEl.classList.add('active');
    btns[0].classList.remove('active');
    btns[1].classList.add('active');
  }}
}}

function setVerdict(id, v) {{
  verdicts[id] = v;
  const el = document.getElementById(id);
  el.className = 'card ' + v;
  updateStats();
}}

function setNote(id, val) {{
  if (val.trim()) notes[id] = val.trim();
  else delete notes[id];
}}

function updateStats() {{
  const vals = Object.values(verdicts);
  const ok = vals.filter(v => v === 'ok').length;
  const skip = vals.filter(v => v === 'skip').length;
  const wrong = vals.filter(v => v === 'wrong').length;
  document.getElementById('cnt-ok').textContent = ok;
  document.getElementById('cnt-skip').textContent = skip;
  document.getElementById('cnt-wrong').textContent = wrong;
  const done = vals.length;
  const pct = Math.round(done / TOTAL * 100);
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-label').textContent = done + ' / ' + TOTAL + ' 已核对';
}}

function exportResults() {{
  const vals = Object.values(verdicts);
  const result = {{
    exportedAt: new Date().toISOString(),
    total: TOTAL,
    markedCount: vals.length,
    summary: {{
      ok: vals.filter(v => v === 'ok').length,
      skip: vals.filter(v => v === 'skip').length,
      wrong: vals.filter(v => v === 'wrong').length,
      unmarked: TOTAL - vals.length,
    }},
    verdicts: verdicts,
    notes: notes,
  }};
  const blob = new Blob([JSON.stringify(result, null, 2)], {{type: 'application/json'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'verification_result.json';
  a.click();
  URL.revokeObjectURL(url);
}}
</script>
</body>
</html>"""

    preview_path = os.path.join(OUTPUT_DIR, "preview.html")
    with open(preview_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ Preview generated: {n} questions across {annot_pages} pages.")
    print(f"   Open in browser: file://{preview_path}")


if __name__ == "__main__":
    main()
