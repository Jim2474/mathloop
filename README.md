# MathLoop

Smart review for math mistakes. MathLoop is a fully local React app for managing an OpenClaw-exported math question bank, marking only selected questions as mistakes, and reviewing them with FSRS scheduling.

## Current Status

- App name: MathLoop
- Brand logo: `public/logo.svg`, mirrored into the browser favicon and Tauri Windows icons
- Runtime: Vite + React + TypeScript, with a Tauri desktop shell scaffold
- Review engine: `ts-fsrs`
- Data source: `public/data/questions.json`
- Static assets: `public/questions/` and `public/answers/`
- Web review state: browser `localStorage`, key `openclaw-review-state`
- Desktop review state: SQLite at `%APPDATA%\MathLoop\mathloop.db`
- Backend: none
- Login/cloud sync: none

## Feature Overview

- Dashboard with Apple-style glass UI and study metrics.
- Question library loaded from the current `questions.json`.
- Question detail pages that always show the latest static question data.
- Mistake intake by page number and question number.
- FSRS review flow for manually marked mistakes.
- Persistent daily review sessions that do not refresh when navigating away from `/review`.
- Question-library views for all questions, today's review set, and all reviewed questions.
- Per-question `tips` notes for recording solution ideas in the desktop external question bank.
- Answer image display through `answerImage` and `answerImages`.
- Incremental question-bank sync that preserves local cards and review logs.
- Backup/export/import for local review state.
- Data health checks for orphan cards, missing images, uncertain fields, empty chapters, and empty question numbers.
- Manual cleanup for orphan local review data with confirmation.

## Data Snapshot

The current checked-in question bank contains:

| Item | Count |
| --- | ---: |
| Questions | 256 |
| Question images | 256 |
| Answer images | 256 |
| Chapters | 9 |
| `meta.uncertain` | 0 |
| `answerMeta.uncertain` | 0 |

Chapter coverage:

| Chapter | Count |
| --- | ---: |
| 第一章 函数 极限 连续 | 39 |
| 第二章 导数与微分 | 24 |
| 第三章 微分中值定理及导数应用 | 28 |
| 第四章 不定积分 | 17 |
| 第五章 定积分与反常积分 | 32 |
| 第六章 定积分的应用 | 18 |
| 第七章 微分方程 | 34 |
| 第八章 多元函数微分学 | 40 |
| 第九章 二重积分 | 24 |

## Project Structure

```text
public/
  logo.svg                   # primary MathLoop brand mark
  apple-touch-icon.png       # browser/mobile icon generated from the brand mark
  data/questions.json        # OpenClaw question-bank source of truth
  questions/                 # question images referenced by questionImage/questionImages
  answers/                   # answer images referenced by answerImage/answerImages
  pages/                     # full-page scan images used by "查看整页"
  question-fixes/            # verified single-question image fixes
src/
  app/                       # app bootstrap and question loading
  components/                # layout, dashboard, common, question image components
  pages/                     # dashboard, mistakes, questions, review, backup pages
  services/                  # FSRS, backup, sync, queue, lookup helpers
  store/                     # Zustand question and review stores
  types/                     # real OpenClaw Question shape and review state types
  utils/                     # date, image path, stats, filters
src-tauri/
  icons/                     # Windows app icons generated from the MathLoop brand mark
  src/main.rs                # Windows desktop shell, SQLite storage, external data bootstrap
```

## Data Model Rules

`questions.json` is the source of truth for question content and image paths. The app does not write FSRS data, mistake records, or backup state back into `questions.json`.

Question image paths are stored as public-relative paths, for example:

```json
{
  "questionImage": "questions/book001_ch01_p006_q001.png",
  "answerImage": "answers/book001_ch01_p006_q001_answer.png",
  "answerImages": [],
  "answerMeta": {
    "source": "pdf_answer_section",
    "uncertain": false
  }
}
```

At render time, these paths are resolved as static public assets such as `/questions/...` and `/answers/...`.

## Incremental Sync

When the app loads `public/data/questions.json`, it synchronizes the local review store:

- New `question.id` values get initialized as FSRS cards.
- Existing cards and `reviewLogs` are preserved.
- Updated question fields are displayed from the latest `questions.json`.
- Local cards whose `questionId` no longer exists are marked as orphan data.
- Orphan data is not removed automatically.

The Backup page includes:

- Last sync result.
- Current pending sync differences.
- Manual "重新同步题库" action.
- Manual "清理孤儿复习记录" action with confirmation.

## Review Workflow

1. Open `错题录入`.
2. Enter page number and question number.
3. Pick the matched question.
4. Choose a review time.
5. Open `复习` when the mistake is due.
6. Reveal the answer and rate it with Again, Hard, Good, or Easy.

Only manually marked mistakes enter the review queue.

The review page stores the current day's generated queue in the local review store. Navigating away from `/review` and returning keeps the same round; a new round is generated only when the user chooses to continue to the next round or when a new day begins.

The question library can show the full bank, the current daily review set, or all reviewed questions.

## 解题思路

Each question can optionally contain a plain-text `tips` field. The UI calls this field `解题思路` because it is meant for solution ideas, mistake notes, and the first hint the user wants to see during review.

In the desktop app, the review page can save 解题思路 back to the external user data file:

```text
%APPDATA%\MathLoop\data\questions.json
```

Before writing the field, MathLoop creates a safety copy in:

```text
%APPDATA%\MathLoop\backups\questions-before-tip-YYYY-MM-DD-HH-mm-ss.json
```

Browser development mode shows 解题思路 but does not write to `public/data/questions.json`. The question detail page displays existing 解题思路 as read-only context.

## Backup And Health Checks

The Backup page can:

- Export local review state as JSON.
- Import a backup with overwrite confirmation.
- Reset local review state with double confirmation.
- Edit review settings:
  - `maxDailyReviews`
  - `maxNewPerDay`
  - `desiredRetention`
- Inspect data health:
  - question total
  - local card count
  - pending new questions
  - changed fingerprints
  - orphan card count
  - orphan review-log count
  - missing question images
  - missing answer images
  - uncertain question count
  - uncertain answer metadata count
  - empty chapter count
  - empty question-number count

## Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run the Tauri desktop app in development:

```bash
npm run tauri:dev
```

Build the Windows desktop app:

```bash
npm run tauri:build
```

Tauri builds require Rust, Cargo, and Microsoft C++ Build Tools with Windows SDK. Current web development still works with `npm run dev`.

## Desktop Data Safety

The desktop app uses an external user data directory instead of storing personal data inside the app bundle:

```text
%APPDATA%\MathLoop\
  mathloop.db
  data\questions.json
  questions\
  answers\
  pages\
  question-fixes\
  backups\
```

On desktop startup, MathLoop creates this directory, initializes SQLite, copies missing bundled question assets without overwriting existing files, and writes an automatic backup when existing review state is found. Automatic startup backups are written to `backups\mathloop-auto-YYYY-MM-DD-HH-mm-ss.json`; MathLoop keeps the latest 30 auto backups and does not prune manual `.db` or restore-safety backups.

The checked-in app bundle and generated installers are not the source of truth for personal study data. Do not delete `%APPDATA%\MathLoop\mathloop.db` or `%APPDATA%\MathLoop\backups\` when cleaning old installers.

To migrate current web data, export a JSON backup from `/backup`, then import it in the desktop app.

## Design Direction

The UI uses a restrained Apple-inspired glass style:

- light atmospheric background
- translucent floating navigation
- soft glass cards
- subtle white borders
- restrained blue accent
- large but quiet typography
- compact capsule buttons

The MathLoop logo is a blue gradient loop with an equals sign, used consistently for the web brand mark, favicon, Apple touch icon, and Tauri Windows icons.

The design target is calm, local, focused, and trustworthy rather than decorative.

## GitHub

Primary repository:

- <https://github.com/Jim2474/mathloop>

There is also a separate data remote configured locally:

- <https://github.com/Jim2474/math_review_data>

For this app, push code and static app assets to `origin` / `Jim2474/mathloop` unless intentionally publishing a data-only package.
