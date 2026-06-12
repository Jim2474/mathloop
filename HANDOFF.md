# MathLoop 待修复问题交接文档

> 编写时间：2026-06-11  
> 当前分支：`codex/macos-port-prep`  
> 项目根目录：`g:\AI_Projects\Mathloop_04`  
> Web 端运行：`npm run preview`（localhost:4173）  
> 桌面端数据目录：`C:\Users\1\AppData\Roaming\MathLoop\`

---

## 整体状态

**业务逻辑层面没有大问题**。复习队列生成、FSRS 评分、错题管理、多书本切换等核心流程均正常。已修复唯一的逻辑 Bug（备份重复下载）。

**剩余全部是数据层面的问题**，可以慢慢修：

| 待办 | 类型 | 说明 |
|------|------|------|
| Book1 tips 恢复 | 数据恢复 | 从 66 个备份合并 29 条笔记写回 questions.json |
| Web 端 tips 保存 | 功能补全 | 移除 isTauriRuntime() 拦截 + localStorage 存储 |
| Book2 答案缺失 58 题 | 数据提取 | 修 extract_book002.py 后重跑 |
| Book3 答案可疑 13 题 | 数据核对 | 先人工核对，有问题再重跑 |
| addBook 按钮 | UI 适配 | 隐藏 Web 端不可用的按钮 |

---

## 已修复 ✅

### 备份重复下载

**文件**：`src/pages/ReviewPage.tsx`  
**Commit**：`1bd76c1` — "fix: prevent auto-backup from re-triggering on page remount"

**改动摘要**：
- 自动备份的 `useEffect` 之前使用 `useRef` 记录已备份的 roundId，页面重新挂载时 ref 重置为 null，导致重复触发
- 依赖数组包含 12 个对象引用（cards, reviewLogs 等），每次 store 变化都会重新触发
- 修复：用 localStorage（`mathloop-backed-up-rounds`）替代 useRef，依赖数组精简为 3 个原始值
- 新增 `hasBackedUpRound()` / `markRoundBackedUp()` 辅助函数（文件末尾，第 598-625 行）

---

## 桌面 App 打包方案

### 结论：不需要 Electron，项目本身就是 Tauri 应用

这个项目从一开始就是用 **Tauri 2.x** 构建的桌面应用，所有基础设施都已就绪：

| 组件 | 状态 |
|------|------|
| Tauri CLI + 配置 | ✅ `src-tauri/tauri.conf.json` |
| Rust 后端（1099 行） | ✅ `src-tauri/src/main.rs` |
| SQLite 持久化 + 迁移 v1→v3 | ✅ |
| Tips 文件读写 | ✅ `update_question_tips` 命令 |
| 自动备份 + 备份清理 | ✅ `create_startup_backup` + `prune_backups` |
| 多书本注册/切换 | ✅ book-registry + books/ 目录 |
| 已有可执行文件 | ✅ `MathLoop.exe`（589 MB） |

### 打包步骤

```bash
# 1. 确保 Rust 工具链
rustup update stable

# 2. 一键构建（会先 vite build 再 cargo build --release）
npm run tauri:build

# 3. 产物位置
#    Windows MSI:  src-tauri/target/release/bundle/msi/
#    Windows NSIS: src-tauri/target/release/bundle/nsis/
```

### 注意事项

1. **Web 端改动不影响桌面端**：代码中通过 `isTauriRuntime()` 区分环境。桌面端走 Tauri invoke 路径（SQLite + 文件系统），Web 端走 localStorage 路径。两套代码互不干扰。

2. **打包体积大**：当前 exe 是 589 MB，因为内嵌了所有书本的图片资源。如果后续添加更多书本，体积会继续增长。可考虑将图片作为外部资源不嵌入。

3. **数据不互通**：桌面端数据在 `%APPDATA%\MathLoop\`（SQLite），Web 端在浏览器 localStorage。两个版本的复习进度互不同步。如果切换到桌面端使用，需要先在 Web 端导出备份 JSON，然后在桌面端导入。

4. **AI 调试桌面端确实困难**：Tauri 构建需要完整的 Rust 编译环境，构建时间长，Rust 报错信息对 AI 不太友好。如果日常使用 Web 端没问题，建议继续用 Web 端，桌面端作为数据归档/tips 写入的补充工具。

---

## 待修复任务

### 任务 1：恢复 Book1 的 29 条做题笔记（Tips）

**优先级**：P0（数据恢复）  
**预估耗时**：30 分钟

**背景**：
- 桌面端通过 Tauri 命令 `update_question_tips`（`src-tauri/src/main.rs:202-260`）将 tips 直接写入 `questions.json`
- 每次保存前自动备份到 `%APPDATA%\MathLoop\backups\questions-before-tip-*.json`
- 目前有 **66 个 tip 备份文件**，最完整的一份（`2026-05-22-21-15-35.json`）包含 **29 条 tips**

**数据位置**：
```
C:\Users\1\AppData\Roaming\MathLoop\backups\questions-before-tip-*.json
```

**操作步骤**：
1. 写一个 Python 脚本扫描全部 66 个 `questions-before-tip-*.json`
2. 对每个 `questionId`，找到**最新的非空** `tips` 值（按文件名中的时间戳排序）
3. 读取 `public/books/book001/data/questions.json`
4. 将合并后的 tips 写入对应题目的 `tips` 字段
5. 保存文件

**注意**：
- 备份文件编码为 UTF-8，Windows 终端可能显示乱码，但文件内容正确
- `questions.json` 中没有 `tips` 字段的题目，添加后需要确保 JSON 格式正确
- 脚本只需运行一次

---

### 任务 2：让 Web 端能保存做题笔记（Tips）

**优先级**：P1  
**预估耗时**：1 小时

**当前问题**：
- `src/pages/ReviewPage.tsx:188-191` 中 `handleSaveTips()` 检测到非 Tauri 环境后直接返回，不做保存
- UI 上 textarea 可以输入，但"保存思路"按钮无效果

**修复方案**：
1. 在 `useQuestionStore.ts` 中新增 `localTips: Record<string, string>` 状态（persisted）
2. 修改 `handleSaveTips()`：Web 端保存到 `localTips`（localStorage），Tauri 端保留原逻辑
3. 修改 tips 读取：合并 `question.tips`（来自 questions.json）和 `localTips[questionId]`（来自 localStorage），以 localStorage 为优先
4. `QuestionDetailPage.tsx:107-109` 也需要读取 localTips 来显示

**涉及文件**：
- `src/pages/ReviewPage.tsx` — handleSaveTips() 修改
- `src/store/useQuestionStore.ts` — 新增 localTips 状态
- `src/pages/QuestionDetailPage.tsx` — tips 展示逻辑

**备选方案**：如果不想用 localStorage，可以建一个 Express/Fastify 后端 API 直接写 `questions.json` 文件，但这增加了架构复杂度。

---

### 任务 3：修复 Book2 答案图片（58 题缺失）

**优先级**：P1  
**预估耗时**：2-3 小时

**当前状态**：
- Book2 共 287 题，其中 **58 题**没有答案图片（`answerImage` 为空或 null）
- 这 58 题的 `answerMeta.uncertain = true`
- 根源是 `book/extract_book002.py` 中的 `CHAPTER_CONFIG` 答案页码范围重叠

**数据文件**：
```
g:\AI_Projects\Mathloop_04\public\books\book002\data\questions.json
g:\AI_Projects\Mathloop_04\book\extract_book002.py
```

**修复步骤**：
1. 打开 `book/extract_book002.py`，检查 `CHAPTER_CONFIG` 中各章节的 `answer_start` / `answer_end`
2. 调整页码范围使其不重叠
3. 移除"找不到答案时静默回退到题目图片"的逻辑（约在第 536-543 行和 601-607 行）
4. 重新运行提取脚本：
   ```bash
   cd book
   python extract_book002.py
   ```
5. 检查输出到 `public\books\book002\` 的新 questions.json 和答案图片
6. 对比前后 answerImage 为空的数量

**需要**：原始 PDF 文件、PyMuPDF (fitz) 库

---

### 任务 4：排查 Book3 答案图片（13 题可疑）

**优先级**：P1  
**预估耗时**：1 小时

**当前状态**：
- Book3 共 308 题，其中 **13 题** 的 `answerMeta.answerPageStart == pageStart`
- 这意味着答案图片可能是题目图片的副本（答案检测回退到了题目页）
- 另有 3 题完全没有答案图片

**数据文件**：
```
g:\AI_Projects\Mathloop_04\public\books\book003\data\questions.json
g:\AI_Projects\Mathloop_04\book\extract_book003.py
```

**排查步骤**：
1. 用脚本列出这 13 题的 questionId 和对应的 pageStart / answerPageStart
2. 在 Web 端逐题核对答案图片是否正确
3. 检查 `extract_book003.py` 是否有与 `extract_book002.py` 相同的页码重叠 / 静默回退问题
4. 如有问题，按任务 3 的方式修复

**快速定位脚本**：
```python
import json
with open(r'g:\AI_Projects\Mathloop_04\public\books\book003\data\questions.json', encoding='utf-8') as f:
    qs = json.load(f)
for q in qs:
    am = q.get('answerMeta', {})
    if am.get('answerPageStart') and am['answerPageStart'] == q.get('pageStart'):
        print(f"{q['id']}: pageStart={q['pageStart']}, answerPageStart={am['answerPageStart']}")
```

---

### 任务 5：Web 端 addBook 按钮适配（低优先级）

**优先级**：P2  
**预估耗时**：15 分钟

**问题**：Navbar 中"添加新书"按钮在 Web 端不可用但仍然显示，点击后报错。

**文件**：`src/components/layout/Navbar.tsx`  
**修复**：在 `!isTauriRuntime()` 时隐藏"添加新书"按钮，或显示提示信息。

---

## 项目架构速查

### 数据存储
| 环境 | 复习数据 | Tips | 位置 |
|------|---------|------|------|
| 桌面端 (Tauri) | SQLite `review_store` 表 | `questions.json` 文件 | `%APPDATA%\MathLoop\` |
| Web 端 | localStorage | **无法保存**（待修复） | 浏览器 |

### 关键文件
| 文件 | 职责 |
|------|------|
| `src/pages/ReviewPage.tsx` | 复习主界面、评分、自动备份 |
| `src/store/useReviewStore.ts` | 复习状态管理（Zustand + persist） |
| `src/services/reviewPersistStorage.ts` | localStorage/Tauri 持久化切换 |
| `src/services/desktopBridge.ts` | Tauri 命令桥接层 |
| `src/store/useQuestionStore.ts` | 题库状态 + tips 保存 |
| `src/store/useBookStore.ts` | 多书本切换 |
| `src/services/backupService.ts` | JSON 备份导出/导入 |
| `src-tauri/src/main.rs` | Rust 后端（SQLite、文件操作） |
| `book/extract_book002.py` | Book2 PDF 提取脚本 |
| `book/extract_book003.py` | Book3 PDF 提取脚本 |

### 运行命令
```bash
npm run dev          # 开发模式（HMR）
npm run preview      # 生产预览（localhost:4173）
npm run build        # 构建前端
npm run tauri:build  # 构建桌面端 app
npx tsc --noEmit     # 类型检查
```
