"""
Recover tips from desktop app backup files and merge into Web questions.json.

Scans all questions-before-tip-*.json backups, collects the latest non-empty
tips for each questionId, then writes them into the Web questions.json.
"""
import json
import os
import re
from pathlib import Path

BACKUP_DIR = Path(r"C:\Users\1\AppData\Roaming\MathLoop\backups")
TARGET_FILE = Path(r"g:\AI_Projects\Mathloop_04\public\books\book001\data\questions.json")

def extract_timestamp(filename: str) -> str:
    """Extract sortable timestamp from filename like questions-before-tip-2026-05-22-21-15-35.json"""
    match = re.search(r"(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})", filename)
    return match.group(1) if match else ""

def main():
    # 1. Find all tip backup files, sorted by timestamp (oldest first)
    backup_files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith("questions-before-tip-") and f.endswith(".json")],
        key=extract_timestamp,
    )
    print(f"Found {len(backup_files)} tip backup files")

    # 2. Scan all backups, keep the latest non-empty tips per questionId
    tips_map: dict[str, tuple[str, str]] = {}  # questionId -> (tips, source_file)

    for filename in backup_files:
        filepath = BACKUP_DIR / filename
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                questions = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  SKIP {filename}: {e}")
            continue

        count = 0
        for q in questions:
            qid = q.get("id", "")
            tips = q.get("tips", "").strip()
            if tips:
                tips_map[qid] = (tips, filename)
                count += 1

        if count > 0:
            print(f"  {filename}: {count} tips found")

    print(f"\nTotal unique tips recovered: {len(tips_map)}")

    if not tips_map:
        print("No tips to recover. Exiting.")
        return

    # 3. Print all recovered tips
    print("\n--- Recovered Tips ---")
    for qid, (tips, source) in sorted(tips_map.items()):
        preview = tips[:80].replace("\n", " ")
        print(f"  {qid}: {preview}  [from {source}]")

    # 4. Read target questions.json
    with open(TARGET_FILE, "r", encoding="utf-8") as f:
        target_questions = json.load(f)

    # 5. Merge tips
    updated = 0
    not_found = []
    for qid, (tips, _) in tips_map.items():
        matched = [q for q in target_questions if q.get("id") == qid]
        if not matched:
            not_found.append(qid)
            continue
        for q in matched:
            existing = q.get("tips", "").strip()
            if existing != tips:
                q["tips"] = tips
                updated += 1

    print(f"\nUpdated {updated} questions with recovered tips")
    if not_found:
        print(f"WARNING: {len(not_found)} questionIds not found in target: {not_found}")

    # 6. Write back
    # Backup current file first
    backup_path = TARGET_FILE.with_suffix(".json.pre-tips-recovery.bak")
    with open(TARGET_FILE, "r", encoding="utf-8") as f:
        original = f.read()
    with open(backup_path, "w", encoding="utf-8") as f:
        f.write(original)
    print(f"Backed up original to: {backup_path}")

    with open(TARGET_FILE, "w", encoding="utf-8") as f:
        json.dump(target_questions, f, ensure_ascii=False, indent=2)
    print(f"Written updated questions.json to: {TARGET_FILE}")

    # 7. Verify
    with open(TARGET_FILE, "r", encoding="utf-8") as f:
        verify = json.load(f)
    verify_count = sum(1 for q in verify if q.get("tips", "").strip())
    print(f"\nVerification: {verify_count} questions now have tips (was 0)")

if __name__ == "__main__":
    main()
