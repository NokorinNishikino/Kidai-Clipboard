# 更新日志 / Changelog

本文件记录 Kidai-ClipBoard (KCB) 的重要变更。
All notable changes to this project are documented here. 格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2025-xx-xx / Latest

### 修复 / Fixed
- **「编辑」功能点击后窗口消失**：修复 `TagChips` 组件读取 `useApp()` 顶层 `data`（不存在）导致的 `TypeError: Cannot read properties of undefined (reading 'tags')`，改为从 `appView?.app?.data` 安全读取并回退空值，此前该崩溃会让整个剪贴板窗口消失，需进入管理页重置窗口才可恢复。
- **崩溃不再「消失」**：`OverlayBoundary` 错误兜底由 `render() → null`（窗口无影无踪）改为渲染可恢复的错误卡片（错误信息 + 「重试 / Retry」按钮），即使再触发未预期异常，窗口也会保留并可尝试恢复。
- **编辑/会话弹窗初始化**：`EditorModal` / `SessionModal` 挂载时附加稳定 `key`，避免编辑窗口在不同条目间切换时内容错乱、吞掉输入。
- **编辑功能事件穿透**：条目编辑按钮 `stopPropagation`，与条目点击选择互不干扰。
- **选择模式标题**：标题栏按钮文案区分「选择 / 退出选择」（selectMode / exitSelect），打开/关闭状态不再混淆。

### 增强 / Enhanced
- **右侧停靠 (Dock) 细节**：停靠时面板贴右边缘、直角边框、顶部与工作区分隔线对齐；拖拽缩放仅改变宽度且固定右边缘，不再拖动右侧边或顶端，松开后尺寸正确提交；收起/关闭时正确清理工作区缩进（`clearDockInset`），左侧聊天区完整还原。
- **收起键**：窗口标题栏仅保留一个收起键（右箭头图标），移除了旧版重复键（旧键会以错误参数重写窗口设置，导致宽高/停靠信息丢失）。
- **布局稳定**：修正 hook 执行顺序（所有 `useState/useEffect/useLayoutEffect` 先于任何提前 `return null`），避免停靠状态下窗口偶发跳动。
- **文件夹树（Obsidian 风格）**：会话按文件夹树组织，支持展开/收起、面包屑导航与文件夹管理。
- **UI 整理**：搜索栏等宽标签页不再换行（`flex:none; nowrap`），标签移动到设置页管理，图标与间距统一。

### 由 1.0.0 以来的全部内容
以下功能在 1.0.0 初次发布时已包含，自 1.0.0 之后逐步打磨：

- 跨会话剪贴板：复制任意内容 → 剪贴板面板，随时回填到当前会话输入框。
- 可停靠窗口：右缘固定停靠（挤压左侧工作区）、左缘拖拽重新缩放（最小宽度 280）、收起为胶囊、隐藏时释放工作区。
- 会话预设：将包含标签/提示词/脚本/附件的会话保存为「预设」，分支为新会话继续迭代。
- 标签体系：任意条目打标签（中文/英文），标签页筛选；预设标签「会话预设」。
- 高亮/来源追踪、多标签页、快捷键.

## [1.0.0] - 2025-05-xx / Initial

首次发布：跨会话剪贴板 + 会话预设 + 可停靠面板 + 标签体系。

---

- README: [简体中文](./README.md) / [English](./README_EN.md)
