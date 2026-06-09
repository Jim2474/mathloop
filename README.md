# MathLoop

**错题智能复习，告别遗忘曲线。**

MathLoop 是一款完全本地化的数学错题管理应用，基于 [FSRS](https://github.com/open-spaced-repetition/fsrs4anki) 间隔重复算法（与 Anki 同源），帮助你在考研数学复习中高效巩固薄弱环节。支持桌面端（Tauri）和 Web 端，数据全部存储在本地，无需登录，无需联网。

## 功能特性

- **多书库管理** — 内置多本数学习题集，切换书目时复习数据相互独立
- **错题录入** — 按页码 + 题号快速定位并标记错题
- **FSRS 智能复习** — Again / Hard / Good / Easy 四级评分，算法自动安排下次复习时间
- **每日复习会话** — 复习进度在页面切换间保持，不丢失状态
- **解题思路笔记** — 为每道题保存个人解题思路（tips），随时回顾
- **数据健康检查** — 检测孤立卡片、缺失图片等数据异常
- **备份与恢复** — 一键导出 / 导入复习数据，支持跨设备迁移
- **Apple 风格毛玻璃界面** — 简洁美观的仪表盘，直观展示学习统计

## 内置书目

| 书目 ID | 名称 | 题目数 | 章节数 |
|---------|------|--------|--------|
| book001 | 高等数学基础篇·严选题 | 256 | 9 |
| book002 | 武忠祥高等数学辅导讲义·严选题 | 287 | 6 |
| book003 | 控制考研777习题册 | 308 | 8 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand |
| 路由 | React Router DOM v6 |
| 桌面壳 | Tauri v2（Rust 后端） |
| 复习引擎 | ts-fsrs（FSRS 算法） |
| 桌面存储 | SQLite（平台桌面数据目录下的 `mathloop.db`） |
| Web 存储 | localStorage |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### Web 端开发

```bash
npm install
npm run dev          # 启动开发服务器（localhost）
npm run build        # 生产构建
npm run preview      # 预览生产构建
```

### 桌面端开发

额外要求：[Rust](https://rustup.rs/) + [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 Windows SDK）

```bash
npm run tauri:dev    # 启动桌面应用（开发模式）
npm run tauri:build  # 构建 Windows 安装包
```

## 复习流程

```
错题录入 → 选择页码/题号 → 匹配题目 → 设定复习时间
    ↓
复习到期 → 打开复习页面 → 翻开答案 → 评分（Again/Hard/Good/Easy）
    ↓
FSRS 自动计算下次复习时间 → 循环巩固
```

只有手动标记的错题才会进入复习队列。每天的复习轮次在页面切换间保持，仅在明确继续或新一天开始时生成新轮次。

## 项目结构

```
public/
  books.json                 # 书目清单（id -> 名称映射）
  books/
    book001/                 # 书目 1 资源
      data/questions.json    # 题目数据（数据源）
      questions/             # 题目图片
      answers/               # 答案图片
      pages/                 # 整页扫描
      question-fixes/        # 修正图片
    book002/                 # 书目 2 资源
    book003/                 # 书目 3 资源
src/
  app/App.tsx                # 应用启动：书目加载、题目加载、复习同步
  components/
    layout/                  # AppShell, Navbar（书目切换下拉）
    dashboard/               # StatCard 统计卡片
    question/                # QuestionImage, QuestionThumbnail
  pages/                     # 6 个页面
    Dashboard                # 仪表盘（学习统计）
    MistakeEntry             # 错题录入
    QuestionList             # 题目列表
    QuestionDetail           # 题目详情
    Review                   # 复习页面
    Backup                   # 备份管理
  services/
    fsrsService.ts           # FSRS 调度算法
    reviewQueue.ts           # 每日复习队列
    questionLoader.ts        # 题目加载（书目感知）
    desktopBridge.ts         # Tauri IPC 抽象层
    backupService.ts         # 备份创建/校验/下载
    mistakeLookup.ts         # 按页码/题号查找
    reviewPersistStorage.ts  # 书目隔离的存储适配器
  store/
    useBookStore.ts          # 书目列表、当前书目、切换逻辑
    useQuestionStore.ts      # 题目、筛选、解题思路
    useReviewStore.ts        # FSRS 卡片、日志、错题、会话
  types/                     # TypeScript 类型定义
  utils/                     # 日期、筛选、图片解析、统计工具
src-tauri/
  src/main.rs                # Rust 后端（~960 行）：命令、迁移、资源加载
```

## 数据模型

`questions.json` 是题目内容和图片路径的唯一数据源。应用不会将 FSRS 数据或备份状态写入该文件（桌面端通过 save tips 功能写入 `tips` 字段除外）。

题目图片路径使用相对于 `public/` 或书目作用域的路径：

```json
{
  "questionImage": "questions/book001_ch01_p006_q001.png",
  "answerImage": "answers/book001_ch01_p006_q001_answer.png"
}
```

渲染时通过 `useAssetUrl` 解析：
- **Web 端**：`/books/{bookId}/questions/...`
- **桌面端**：`data:image/png;base64,...`（通过 Tauri `load_asset_data_url` 加载）

## 桌面端数据目录

| 平台 | 数据根目录 |
|------|------------|
| Windows | `%APPDATA%\MathLoop` |
| macOS | `~/Library/Application Support/MathLoop` |
| Linux / 其他 Unix | `~/.mathloop` |

目录结构：

```
<MathLoop 数据根目录>\
├── mathloop.db                     # SQLite 数据库
├── books\
│   ├── book001\                    # 高等数学基础篇·严选题
│   │   ├── data\questions.json
│   │   ├── questions\              # 题目图片
│   │   ├── answers\                # 答案图片
│   │   ├── pages\                  # 整页扫描
│   │   └── question-fixes\         # 修正图片
│   └── book002\                    # 武忠祥高等数学辅导讲义·严选题
│   └── book003\                    # 控制考研777习题册
│       └── data\questions.json
└── backups\
    ├── pre-migration-*.json        # 迁移前自动备份
    ├── mathloop-auto-*.json        # 启动自动备份（保留 30 份）
    └── questions-before-tip-*.json # Tips 更新前备份
```

桌面端将个人数据存储在平台数据目录中，而非应用包内。首次启动时自动创建目录、初始化 SQLite、复制内置题目资源并生成自动备份。

## macOS 移植准备

本仓库包含 macOS 移植准备文件：

- `src-tauri/tauri.macos.conf.json`：macOS 平台配置，Tauri 在 macOS 上自动合并。
- `src-tauri/icons/icon.icns`：macOS app 图标。
- `docs/macos-port/HANDOFF.md`：给后续移植 agent 的接手说明。
- `docs/macos-port/CHECKLIST.md`：Mac 到手后的验证、打包、签名清单。

Windows 上可运行 `npm run verify:port-prep` 验证前端测试、生产构建和 Rust 测试。最终 `.app` / `.dmg` 构建、签名和公证仍需在 macOS 上完成。

## 多书目支持

- 通过导航栏下拉菜单切换当前书目
- 每本书目拥有独立的复习数据（卡片、日志、错题、指纹）
- 切换书目时：重新加载题目、重新读取复习数据、清空资源缓存
- Web 端从 `/books.json` 清单自动选择默认书目
- 桌面端首次启动自动注册内置书目
- 旧版数据通过两阶段迁移自动升级（v1: 默认目录 → v2: book001 重命名）

## 数据迁移

从 Web 端迁移到桌面端：在 Web 端 `/backup` 页面导出 JSON 备份，然后在桌面端导入即可。

## 相关仓库

- **主仓库**：<https://github.com/Jim2474/mathloop>
- **题目数据**：<https://github.com/Jim2474/math_review_data>

## 许可证

MIT
