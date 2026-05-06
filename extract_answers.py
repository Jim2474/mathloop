#!/usr/bin/env python3
"""
答案提取脚本（简化版）
将每章的整个答案页面作为答案图片
"""

import json
import os
import shutil

QUESTIONS_FILE = "questions.json"
ANSWERS_DIR = "answers"
PAGES_DIR = "pages"

# 答案页配置：{章节号: PDF页码}
ANSWER_PAGES = {
    1: 18,
    2: 26,
    3: 35,
    4: [40, 41],  # 第四章答案跨页
    5: 51,
    6: 57,
    7: 67,
    8: 79,
    9: 87,
}


def main():
    os.makedirs(ANSWERS_DIR, exist_ok=True)

    # 读取questions.json
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    print(f"读取 {len(questions)} 道题目")

    # 统计
    matched_count = 0
    uncertain_count = 0
    total_images = 0

    # 按章节分组
    chapter_groups = {}
    for q in questions:
        chapter = q['chapter']
        # 提取章节号
        chapter_num = None
        for ch_name, ch_info in [
            ('第一章', 1), ('第二章', 2), ('第三章', 3), ('第四章', 4),
            ('第五章', 5), ('第六章', 6), ('第七章', 7), ('第八章', 8), ('第九章', 9)
        ]:
            if ch_name in chapter:
                chapter_num = ch_info
                break

        if chapter_num is not None:
            if chapter_num not in chapter_groups:
                chapter_groups[chapter_num] = []
            chapter_groups[chapter_num].append(q)

    # 处理每章
    for chapter_num, chapter_questions in chapter_groups.items():
        answer_pages = ANSWER_PAGES.get(chapter_num)
        if answer_pages is None:
            print(f"警告: 第{chapter_num}章没有答案页配置")
            continue

        # 确定答案页列表
        if isinstance(answer_pages, list):
            pages = answer_pages
        else:
            pages = [answer_pages]

        # 为每道题创建答案图片
        for q in chapter_questions:
            q_id = q['id']

            if len(pages) == 1:
                # 单页答案
                answer_page = pages[0]
                source_path = f"{PAGES_DIR}/page_{answer_page:03d}.png"
                answer_path = f"{ANSWERS_DIR}/{q_id}_answer.png"

                if os.path.exists(source_path):
                    shutil.copy2(source_path, answer_path)
                    q['answerImage'] = answer_path
                    q['answerImages'] = []
                    q['answerMeta'] = {
                        "source": "pdf_answer_section",
                        "answerPageStart": answer_page,
                        "answerPageEnd": answer_page,
                        "printedPageNumber": "",
                        "uncertain": False,
                        "note": ""
                    }
                    matched_count += 1
                    total_images += 1
                else:
                    q['answerImage'] = ""
                    q['answerImages'] = []
                    q['answerMeta'] = {
                        "source": "pdf_answer_section",
                        "answerPageStart": None,
                        "answerPageEnd": None,
                        "printedPageNumber": "",
                        "uncertain": True,
                        "note": "答案页面图片不存在"
                    }
                    uncertain_count += 1
            else:
                # 多页答案
                answer_images = []
                for i, page in enumerate(pages, 1):
                    source_path = f"{PAGES_DIR}/page_{page:03d}.png"
                    answer_path = f"{ANSWERS_DIR}/{q_id}_answer_{i}.png"

                    if os.path.exists(source_path):
                        shutil.copy2(source_path, answer_path)
                        answer_images.append(answer_path)
                        total_images += 1

                if answer_images:
                    q['answerImage'] = answer_images[0]
                    q['answerImages'] = answer_images
                    q['answerMeta'] = {
                        "source": "pdf_answer_section",
                        "answerPageStart": pages[0],
                        "answerPageEnd": pages[-1],
                        "printedPageNumber": "",
                        "uncertain": False,
                        "note": f"答案跨{len(pages)}页"
                    }
                    matched_count += 1
                else:
                    q['answerImage'] = ""
                    q['answerImages'] = []
                    q['answerMeta'] = {
                        "source": "pdf_answer_section",
                        "answerPageStart": None,
                        "answerPageEnd": None,
                        "printedPageNumber": "",
                        "uncertain": True,
                        "note": "答案页面图片不存在"
                    }
                    uncertain_count += 1

    # 保存questions.json
    with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"\n=== 答案提取完成 ===")
    print(f"成功匹配答案: {matched_count}")
    print(f"未找到答案: {uncertain_count}")
    print(f"生成答案图片: {total_images}")

    # 验证
    print(f"\n=== 验证 ===")
    print(f"总题数: {len(questions)}")

    # 检查answerImage是否存在
    missing_answers = []
    for q in questions:
        if q['answerImage'] and not os.path.exists(q['answerImage']):
            missing_answers.append(q['id'])
    print(f"缺失答案图片: {len(missing_answers)}")

    # 统计有答案的题目
    with_answer = sum(1 for q in questions if q['answerImage'])
    without_answer = sum(1 for q in questions if not q['answerImage'])
    print(f"有答案的题目: {with_answer}")
    print(f"无答案的题目: {without_answer}")

    # 按章节统计
    from collections import Counter
    chapter_stats = Counter()
    for q in questions:
        if q['answerImage']:
            chapter_num = None
            for ch_name, ch_info in [
                ('第一章', 1), ('第二章', 2), ('第三章', 3), ('第四章', 4),
                ('第五章', 5), ('第六章', 6), ('第七章', 7), ('第八章', 8), ('第九章', 9)
            ]:
                if ch_name in q['chapter']:
                    chapter_num = ch_info
                    break
            if chapter_num:
                chapter_stats[chapter_num] += 1

    print(f"\n各章答案统计:")
    for ch, count in sorted(chapter_stats.items()):
        print(f"  第{ch}章: {count} 道")


if __name__ == "__main__":
    main()
