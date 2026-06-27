# MathLoop Windows → macOS 迁移指南

> **适用场景**：将 MathLoop 项目从 Windows 开发环境迁移到 Mac 上使用 Claude Code 继续开发  
> **当前分支**：`codex/macos-port-prep`（macOS 适配工作已大部分完成）  
> **生成日期**：2026-06-27

---

## 目录

1. [项目概览](#1-项目概览)
2. [迁移前评估：你已完成的工作](#2-迁移前评估你已完成的工作)
3. [Mac 环境搭建](#3-mac-环境搭建)
4. [代码迁移：需要处理的差异](#4-代码迁移需要处理的差异)
5. [数据迁移](#5-数据迁移)
6. [构建与验证](#6-构建与验证)
7. [Claude Code 在 Mac 上的使用](#7-claude-code-在-mac-上的使用)
8. [已知问题与待办事项](#8-已知问题与待办事项)
9. [快速参考卡片](#9-快速参考卡片)

---

## 1. 项目概览

MathLoop 是一个基于 **Tauri 2** 的桌面数学刷题应用，采用 React + TypeScript 前端 + Rust 后端的架构。

| 层 | 技术 | 跨平台状态 |
|---|---|---|
| 前端框架 | React 19 + TypeScript 5.9 | ✅ 完全跨平台 |
| 构建工具 | Vite 7.2 | ✅ 完全跨平台 |
| 样式 | Tailwind CSS 3.4 | ✅ 完全跨平台 |
| 状态管理 | Zustand 5.0 | ✅ 完全跨平台 |
| 桌面壳 | Tauri v2.11 (Rust) | ✅ 已适配 macOS |
| 数据库 | SQLite (rusqlite bundled) | ✅ 自动编译 |
| 间隔重复 | ts-fsrs 5.3 | ✅ 完全跨平台 |

**关键结论**：项目的核心技术栈全部跨平台，无需更换任何框架或依赖。Tauri 2 原生支持 macOS，已有专门的 macOS 配置文件。

---

## 2. 迁移前评估：你已完成的工作

`codex/macos-port-prep` 分支已经完成了大部分 macOS 适配工作：

### ✅ 已完成

| 工作项 | 状态 | 说明 |
|---|---|---|
| Rust 数据目录解析 | ✅ | `main.rs` 中 `resolve_mathloop_data_dir()` 已支持 windows/macos/linux |
| macOS Tauri 配置覆盖 | ✅ | `tauri.macos.conf.json` 已存在（app/dmg 打包、hardened runtime） |
| macOS 图标 | ✅ | `src-tauri/icons/icon.icns` 已生成 |
| 前端路径分隔符适配 | ✅ | `desktopBridge.ts` 自动检测 `\` vs `/` |
| 跨平台测试 | ✅ | Rust 和 Vitest 都有 Windows/macOS 路径测试 |
| macOS 构建脚本 | ✅ | `tauri:build:mac` 和 `tauri:build:mac:unsigned` 已在 package.json |
| .gitignore 跨平台 | ✅ | 已包含 `.DS_Store`、`Thumbs.db`、`MathLoop.exe`、`*.lnk` |
| Python 脚本路径适配 | ✅ | `scripts/scan_answer_pages.py` 已改用 `Path(__file__).resolve().parents[1]` |

### ⚠️ 需要处理

| 工作项 | 优先级 | 说明 |
|---|---|---|
| 提交 macOS 适配文件到 Git | 🔴 高 | `tauri.macos.conf.json`、`icon.icns`、`desktopBridge.test.ts` 等目前是 untracked 状态（详见下方） |
| 更新 HANDOFF.md 文档路径 | 🟡 中 | 仍引用 `%APPDATA%` 和 `MathLoop.exe` |
| 确认 Tauri 配置合并行为 | 🟢 低 | 需在 Mac 上实际验证 |

> **关于 `MathLoop.exe` 和 `.lnk`**：这两个文件已被 `.gitignore` 排除，不在 Git 追踪中，仅存在于 Windows 本地工作目录。`git clone` 到 Mac 时不会包含它们，无需任何操作。

### 🔴 迁移前 Windows 端必做：提交未追踪的 macOS 文件

以下文件已创建但**尚未提交到 Git**，必须在迁移前提交，否则 Mac 端 clone 后缺少关键文件：

```bash
# 在 Windows 上执行
git add src-tauri/tauri.macos.conf.json
git add src-tauri/icons/icon.icns
git add src/services/desktopBridge.test.ts

# 如果 book003 目录也需要迁移（检查是否有 untracked 的 book 资源）
git add public/books/book003/

git commit -m "feat: add macOS-specific config, icon, tests, and book003 resources"
git push origin codex/macos-port-prep
```

---

## 3. Mac 环境搭建

### 3.1 必装工具

```bash
# 1. Homebrew（如果尚未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js（推荐通过 nvm 管理）
brew install nvm
nvm install 24        # 或项目兼容的 Node 版本
nvm use 24

# 3. Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup update stable

# 4. Xcode Command Line Tools（编译 Rust native 代码需要）
xcode-select --install

# 5. Claude Code（如果你要在 Mac 上使用）
npm install -g @anthropic-ai/claude-code
```

### 3.2 可选工具

```bash
# Python（用于 PDF 提取脚本）
brew install python@3.12
python3 -m venv .venv312
source .venv312/bin/activate
pip install PyMuPDF pytesseract Pillow

# Git（macOS 自带，但建议更新）
brew install git
```

### 3.3 验证环境

```bash
node --version        # 应 >= 20
npm --version         # 应 >= 10
rustc --version       # 应 >= 1.75
cargo --version
xcode-select -p       # 应指向 Xcode.app 或 CLT
```

---

## 4. 代码迁移：需要处理的差异

### 4.1 不需要修改的部分（已跨平台）

以下代码已正确实现跨平台，**无需任何改动**：

**Rust 后端** (`src-tauri/src/main.rs`):
- `resolve_mathloop_data_dir()` — 通过 `env::consts::OS` 匹配平台
  - Windows: `%APPDATA%\MathLoop`
  - macOS: `~/Library/Application Support/MathLoop`
  - Linux: `~/.mathloop`
- 所有文件操作使用 `PathBuf::join()` — 自动适配分隔符
- `normalize_relative_asset_path()` — 反斜杠自动转正斜杠

**TypeScript 前端**:
- `isTauriRuntime()` — 检测 `window.__TAURI_INTERNALS__`，不依赖平台
- `buildDesktopAssetPath()` — 从 dataDir 字符串自动检测分隔符
- 所有 Zustand store 和业务逻辑 — 完全平台无关

**Tauri 配置**:
- `tauri.conf.json` (基础配置) + `tauri.macos.conf.json` (macOS 覆盖) — Tauri 自动合并

### 4.2 需要修改的文件

> **注意**：`MathLoop.exe` 和 `.lnk` 文件不在 Git 追踪中（`.gitignore` 已排除），克隆到 Mac 时不会出现，无需处理。
> `scripts/scan_answer_pages.py` 的硬编码路径已修复（使用 `Path(__file__).resolve().parents[1]`），无需再改。

#### 🟡 `HANDOFF.md`（文档路径）

文件中的 Windows 特定路径需要添加 macOS 等价说明：

| Windows 路径 | macOS 等价 |
|---|---|
| `g:\AI_Projects\Mathloop_04` | `~/path/to/Mathloop_04`（你的实际克隆位置） |
| `C:\Users\1\AppData\Roaming\MathLoop\` | `~/Library/Application Support/MathLoop/` |
| `MathLoop.exe` | `MathLoop.app`（在 `src-tauri/target/release/bundle/macos/` 下） |
| `npm run tauri:build` | `npm run tauri:build:mac:unsigned`（先不签名测试） |

#### 🟢 `book/output*/audit.json`（数据产物，低优先级）

这些文件包含生成时的 Windows 绝对路径（如 `G:\AI_Projects\...`），但它们是数据提取脚本的审计日志，不影响运行时。如果不需要保留可删除，或在 Mac 上重新运行提取脚本时会自动生成新路径的版本。

### 4.3 路径对照速查

| 用途 | Windows | macOS |
|---|---|---|
| 项目根目录 | `G:\AI_Projects\Mathloop_04` | `~/path/to/Mathloop_04` |
| 用户数据目录 | `%APPDATA%\MathLoop\` | `~/Library/Application Support/MathLoop/` |
| SQLite 数据库 | `%APPDATA%\MathLoop\mathloop.db` | `~/Library/Application Support/MathLoop/mathloop.db` |
| 备份目录 | `%APPDATA%\MathLoop\backups\` | `~/Library/Application Support/MathLoop/backups/` |
| Tips 备份 | `%APPDATA%\MathLoop\backups\questions-before-tip-*.json` | `~/Library/Application Support/MathLoop/backups/questions-before-tip-*.json` |
| 构建产物 (app) | `src-tauri/target/release/bundle/nsis/` | `src-tauri/target/release/bundle/macos/` |
| 构建产物 (安装器) | `src-tauri/target/release/bundle/msi/` | `src-tauri/target/release/bundle/dmg/` |
| Python venv | `.venv312/Scripts/activate` | `.venv312/bin/activate` |

---

## 5. 数据迁移

### 5.1 复习进度迁移（Windows → macOS）

桌面端和 Web 端数据不互通，但可以通过备份 JSON 跨平台迁移：

**在 Windows 上**：
1. 打开 MathLoop 桌面端
2. 进入「备份」页面
3. 点击「导出备份」，保存 JSON 文件

**在 macOS 上**：
1. 首次启动 MathLoop 时，系统会初始化 `~/Library/Application Support/MathLoop/`
2. 进入「备份」页面
3. 点击「导入备份」，选择之前导出的 JSON 文件

### 5.2 Tips（做题笔记）迁移

如果你在 Windows 桌面端保存了 tips，它们位于：
```
C:\Users\1\AppData\Roaming\MathLoop\backups\questions-before-tip-*.json
```

**迁移方法**：
1. 将整个 `backups/` 目录复制到 Mac
2. 放到 macOS 数据目录：`~/Library/Application Support/MathLoop/backups/`
3. 或者直接用最新版的 `questions.json`（如果 tips 已合并进去）

### 5.3 整个数据目录迁移（快捷方式）

直接复制整个数据目录：

```powershell
# Windows 上执行（PowerShell）
# 将整个数据目录打包
Compress-Archive -Path "$env:APPDATA\MathLoop\*" -DestinationPath "MathLoop-data-backup.zip"
```

```bash
# Mac 上执行
# 创建目标目录
mkdir -p "$HOME/Library/Application Support/MathLoop"
# 解压
unzip MathLoop-data-backup.zip -d "$HOME/Library/Application Support/MathLoop/"
```

### 5.4 PDF 源文件

PDF 文件（`习题和答案/` 目录）是平台无关的，直接复制即可。这些文件用于 Python 提取脚本，不影响运行时。

---

## 6. 构建与验证

### 6.1 首次构建（推荐顺序）

```bash
# Step 1: 克隆/同步代码
git clone <your-repo-url> Mathloop_04
cd Mathloop_04
git checkout codex/macos-port-prep

# Step 2: 安装依赖
npm install

# Step 3: 运行全量验证（类型检查 + 前端测试 + Rust 测试）
npm run verify:port-prep
# ⏱ 首次运行需要编译所有 Rust crate（tauri、rusqlite 等），预计 5-15 分钟
# 预期：所有测试通过，Vite 构建成功

# Step 4: 桌面端开发模式
npm run tauri:dev
# ⏱ 首次也需要 Rust 编译，之后增量编译很快
# 预期：窗口打开，能看到题目列表，能做题评分

# Step 5: 无签名构建
npm run tauri:build:mac:unsigned
# 预期：在 src-tauri/target/release/bundle/ 下生成 .app 和 .dmg
```

> **⏱ Rust 编译耗时提醒**：首次在 Mac 上编译 Rust（`verify:port-prep` 或 `tauri:dev`），需要从零编译所有依赖 crate，预计 5-15 分钟（取决于机器性能）。之后只增量编译改动文件，通常几秒完成。

### 6.2 验证清单

运行 `npm run tauri:dev` 后，逐项检查：

- [ ] App 窗口正常打开（1440x960）
- [ ] 侧边栏显示 3 本书（book001, book002, book003）
- [ ] 打开 book001 的任意题目，图片正常显示
- [ ] 打开 book002 的任意题目，图片正常显示
- [ ] 打开 book003 的任意题目，图片正常显示
- [ ] 评分一道题，关闭 App，重新打开，复习状态保留
- [ ] 导出备份 JSON，重新导入，数据无丢失
- [ ] 编辑一道题的 tips，保存后 `questions.json` 更新
- [ ] 确认数据库位置：`~/Library/Application Support/MathLoop/mathloop.db`

> **macOS Gatekeeper 提醒**：无签名的 `.app` 首次打开会被 Gatekeeper 拦截。
> 解决方法：右键点击 `.app` → 选择「打开」→ 确认，或在终端执行：
> ```bash
> xattr -cr /path/to/MathLoop.app
> ```

### 6.3 签名构建（发布用）

```bash
# 前提：拥有 Apple Developer 账号和 Developer ID Application 证书
# 证书通过 Keychain Access 管理，不要硬编码到配置文件中

npm run tauri:build:mac
# 生成签名的 .app 和 .dmg

# 公证（Notarization）
xcrun notarytool submit src-tauri/target/release/bundle/dmg/MathLoop.dmg \
  --apple-id <your-apple-id> \
  --team-id <your-team-id> \
  --password <app-specific-password> \
  --wait

# 装订（Staple）
xcrun stapler staple src-tauri/target/release/bundle/dmg/MathLoop.dmg
```

---

## 7. Claude Code 在 Mac 上的使用

### 7.1 Claude Code 本身

Claude Code 在 Mac 上的使用与 Windows 完全一致：

```bash
# 启动
claude

# 或在项目目录中
cd ~/path/to/Mathloop_04
claude
```

Claude Code 会自动读取项目中的：
- `CLAUDE.md` — 项目级指令
- `.claude/` — 项目级配置
- `~/.claude/` — 全局配置（agents、rules、settings）

### 7.2 平台差异注意事项

| 项目 | Windows | macOS |
|---|---|---|
| Shell | bash (Git Bash) / PowerShell | zsh (默认) / bash |
| 路径分隔符 | `\` | `/` |
| 包管理 | npm | npm（或 pnpm） |
| 终端 | Windows Terminal / VS Code | Terminal.app / iTerm2 / VS Code |
| Claude Code 安装 | `npm i -g @anthropic-ai/claude-code` | 同左 |

### 7.3 MCP 工具迁移

如果你在 Windows 上配置了 MCP 工具，需要检查：

- **Playwright MCP** — 跨平台，`npx @anthropic-ai/mcp-playwright` 直接可用
- **Chrome DevTools MCP** — 跨平台，Chrome 路径自动检测
- **Context7 MCP** — 跨平台，API 调用无平台依赖
- **Vision Recognize MCP** — 检查图片临时路径是否适配（通常自动适配）

### 7.4 OMC（oh-my-claudecode）迁移

OMC 配置位于 `~/.claude/` 下，是平台无关的。但注意：

- `~/.claude/settings.json` 中如果有 Windows 特定路径需修改
- `~/.claude/rules/` 中的规则文件是 Markdown，完全跨平台
- `~/.claude/agents/` 中的代理配置是 Markdown，完全跨平台

### 7.5 Git 配置

```bash
# 设置 Git 用户信息（如果 Mac 上是新环境）
git config --global user.name "Jim2474"
git config --global user.email <your-email>

# SSH key（如果用 SSH 拉代码）
ssh-keygen -t ed25519 -C "your-email@example.com"
# 将公钥添加到 GitHub
```

---

## 8. 已知问题与待办事项

### 🔴 迁移前必须处理

| # | 问题 | 操作 |
|---|---|---|
| 1 | macOS 适配文件未提交到 Git | `git add` + `git commit` 未追踪的 `tauri.macos.conf.json`、`icon.icns`、`desktopBridge.test.ts` 等（见第 2 节） |

### 🟡 迁移后应尽快处理

| # | 问题 | 操作 |
|---|---|---|
| 2 | `HANDOFF.md` 仅含 Windows 路径 | 添加 macOS 等价路径 |
| 3 | Book2 有 58 题答案缺失 | 修复提取脚本后重跑（见 HANDOFF.md 任务 3） |
| 4 | Book3 有 13 题答案可疑 | 人工核对（见 HANDOFF.md 任务 4） |
| 5 | Web 端 tips 无法保存 | 已有修复方案（见 HANDOFF.md 任务 2） |

### 🟢 可选优化

| # | 问题 | 操作 |
|---|---|---|
| 6 | `main.rs` 已达 1099 行 | 考虑拆分模块 |
| 7 | 无 CI/CD | 可添加 GitHub Actions 做 macOS 构建 |
| 8 | 构建产物体积大 | 图片资源可考虑外置不嵌入 |

---

## 9. 快速参考卡片

### 一图看懂迁移

```
┌─────────────────────────────────────────────────────────────────┐
│                      Windows (当前环境)                          │
│  G:\AI_Projects\Mathloop_04\                                    │
│  ├── src/           (React 前端) ──────── 无需修改，直接复制 ──→ │
│  ├── src-tauri/     (Rust 后端)  ──────── 无需修改，直接复制 ──→ │
│  ├── public/books/  (题库数据)   ──────── 无需修改，直接复制 ──→ │
│  ├── package.json   (依赖声明)   ──────── 无需修改，直接复制 ──→ │
│  ├── MathLoop.exe   (构建产物)   ──────── 仅在本地，不在 Git 中  │
│  └── scripts/       (Python 脚本) ─────── ✅ 已修复硬编码路径  ──→ │
│                                                                   │
│  %APPDATA%\MathLoop\                                             │
│  ├── mathloop.db    (SQLite)     ──────── ✅ 复制到 macOS 数据目录│
│  └── backups/       (备份JSON)   ──────── ✅ 复制到 macOS 数据目录│
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                      macOS (目标环境)                            │
│  ~/path/to/Mathloop_04/                                        │
│  ├── src/           ✅ 直接可用                                  │
│  ├── src-tauri/     ✅ Tauri 自动使用 tauri.macos.conf.json      │
│  ├── public/books/  ✅ 直接可用                                  │
│  ├── package.json   ✅ npm install 后直接可用                     │
│  └── scripts/       ✅ 已修复，直接可用                          │
│                                                                   │
│  ~/Library/Application Support/MathLoop/                         │
│  ├── mathloop.db    ✅ 从 Windows 复制，或从备份导入              │
│  └── backups/       ✅ 从 Windows 复制                            │
└─────────────────────────────────────────────────────────────────┘
```

### 最小迁移步骤

```bash
# 0. 前提：已在 Windows 端提交所有 macOS 适配文件（见第 2 节）

# 1. 在 Mac 上克隆项目
git clone <your-repo-url> && cd Mathloop_04
git checkout codex/macos-port-prep

# 2. 安装依赖
npm install

# 3. 验证（⏱ 首次 Rust 编译约 5-15 分钟）
npm run verify:port-prep

# 4. 启动开发模式
npm run tauri:dev

# 5. 如需迁移数据，从 Windows 导出备份 JSON 后在 macOS 端导入
```

### 关键命令速查

| 用途 | 命令 |
|---|---|
| Web 开发模式 | `npm run dev` |
| 桌面开发模式 | `npm run tauri:dev` |
| 类型检查 | `npx tsc --noEmit` |
| 前端测试 | `npm test` |
| Rust 测试 | `npm run test:rust` |
| 全量验证 | `npm run verify:port-prep` |
| Web 构建 | `npm run build` |
| macOS 构建 (无签名) | `npm run tauri:build:mac:unsigned` |
| macOS 构建 (签名) | `npm run tauri:build:mac` |
| 查看 Tauri 信息 | `npx tauri info` |

---

## 附录：项目目录结构速查

```
Mathloop_04/
├── src/                          # React 前端源码
│   ├── app/App.tsx               # 根组件 + 路由
│   ├── pages/                    # 页面组件（6 个）
│   ├── components/               # 通用组件
│   ├── services/                 # 业务服务层
│   │   ├── desktopBridge.ts      # Tauri IPC 桥接（⚠️ 关键文件）
│   │   ├── reviewPersistStorage.ts # 双模存储适配器
│   │   ├── fsrsService.ts        # FSRS 间隔重复算法
│   │   └── backupService.ts      # 备份导入导出
│   ├── store/                    # Zustand 状态管理
│   ├── hooks/                    # React Hooks
│   ├── types/                    # TypeScript 类型
│   └── utils/                    # 工具函数
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/main.rs               # 全部 IPC 命令（1099 行）
│   ├── tauri.conf.json           # Windows 配置（基础）
│   ├── tauri.macos.conf.json     # macOS 配置覆盖
│   ├── Cargo.toml                # Rust 依赖
│   └── icons/                    # 应用图标（ico + icns + png）
├── public/books/                 # 题库资源（3 本书，含图片）
├── scripts/                      # Python 工具脚本
├── book/                         # PDF 提取工作区
├── docs/                         # 文档
│   ├── macos-port/               # macOS 迁移相关文档
│   ├── CODEMAPS/                 # 架构文档
│   └── DESIGN.md                 # 设计文档
├── package.json                  # Node.js 依赖和脚本
├── vite.config.ts                # Vite 构建配置
└── tailwind.config.ts            # Tailwind CSS 配置
```

---

> **下一步**：先在 Windows 端完成 [第 2 节](#2-迁移前评估你已完成的工作) 中"迁移前必做"的 `git commit`，然后在 Mac 上按 [第 3 节](#3-mac-环境搭建) 搭建环境，最后执行 [第 6.1 节](#61-首次构建推荐顺序) 的构建步骤。如果遇到问题，参考 `docs/macos-port/CHECKLIST.md` 逐项排查。
