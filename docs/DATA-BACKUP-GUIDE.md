# MathLoop 数据备份说明

## 备份时间
2026-08-02

## 备份方式
Web 端数据（复习进度）存储在**浏览器 localStorage** 中，无法从代码仓库直接备份。

## 手动备份步骤（重要！）

请在真实浏览器中打开应用，执行以下步骤为三本书各导出一份 JSON 备份：

1. 打开 http://localhost:5175（或生产地址）
2. 切换到 **book001（高等数学基础篇）** → 进入 `/backup` 页面 → 点击「导出 JSON 备份」
3. 切换到 **book002（武忠祥强化）** → 进入 `/backup` 页面 → 点击「导出 JSON 备份」  
4. 切换到 **book003（控制考研777）** → 进入 `/backup` 页面 → 点击「导出 JSON 备份」

将三份文件保存到本地安全位置（不要放在 repo 里，文件较大）。

## localStorage Key 说明

| Key | 内容 |
|-----|------|
| `openclaw-review-state::book001` | book001 复习数据（cards、错题记录、reviewLogs） |
| `openclaw-review-state::book002` | book002 复习数据 |
| `openclaw-review-state::book003` | book003 复习数据 |
| `mathloop-active-book` | 当前激活书本 ID |
| `mathloop-question-ui-v2` | UI 筛选状态 + localTips |

## 应急恢复

如需恢复数据，在 `/backup` 页面使用「选择备份并导入」功能，选择对应书本的备份 JSON 文件即可。
