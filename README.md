<div align="center">

# 📋 Kidai-ClipBoard · 纪代剪贴板

**DSH 全局高级剪贴板** —— 保存输入与整段会话，在新会话中一键分支继续。
**简体中文** · [**English**](README_EN.md)

</div>

---

## ✨ 为什么用？

DeepSeek Harness 的对话、命令、片段散落在各个会话里。KCB 把「抓取草稿、保存会话、从快照分支续写、粘贴回输入框」收进一个**悬浮窗口**——不再翻聊天历史，不再复制粘贴长文本。

- 🪟 **可停靠悬浮窗**：拖动、双向缩放、贴右缘停靠（工作区自动避让，不遮挡内容）、收起为竖条
- 📝 **保存输入**：一键抓取当前输入框草稿
- 🧩 **保存会话**：完整历史快照（标题/分支点/转录），可编辑重命名
- ✂️ **中途截断分支**：保存时可选「存到第几轮为止」，丢弃其后的对话（会话走到 12345 → 只存 123）
- 📜 **滚动选择历史轮次**：分支点列表先显示最近几轮，向上滚动持续加载更早的历史
- 🔘 **回复行入口**：每条助手回复下方操作行里的「保存会话分支」，默认定位到该回复所在轮次
- 🧰 **布局可调**：操作按钮可排成底部一行或**面板左侧竖栏**；缩放把手可在右下角或**左侧竖列**之间切换（避开其它插件浮层遮挡）
- 🌳 **文件树分组**：Obsidian 风格文件夹树，展开/收起，未分类平铺
- 🔀 **在新会话中继续**：对快照执行 DSH 原生 fork，在选定轮次一键分支续写（从 123 接着写 12367）；原会话失效时自动转录兜底
- 🏷️ **管理**：文件夹、彩色标签、颜色标记、置顶、搜索、多选批量删除

> **装上即用** —— 重启 DSH 后，侧边栏底部「自动剪贴板」打开窗口。

---

## 🚀 快速开始

### 安装

```bash
# 本地开发安装（或经该插件自身市场安装）
dsh plugin --profile desktop add file:D:\path\to\kidai-clipboard
# 或 GitHub：
dsh plugin --profile desktop add git+https://github.com/NokorinNishikino/Kidai-Clipboard.git
```

**重启 DSH** 生效。

### 卸载

```bash
dsh plugin --profile desktop remove kidai-clipboard
```

或从 `profiles/desktop/package.json` 移除依赖与 bundle 声明，删除 `node_modules/kidai-clipboard`。

---

## 🎛️ 产品简介

- **项目/包名**：`kidai-clipboard`；品牌名 **Kidai-ClipBoard（纪代剪贴板）**，简称 **KCB**
- **形态**：DSH 双端 Bundle（Host 持久化 + Client UI），桌面与 Web 通用
- **数据**：`$DSH_HOME/kidai-clipboard/store.json`（schema 1，原子写）
- **约束**：条目 ≤ 5000、会话记录 ≤ 8000、转录 ≤ 1 MB

---

## 📚 技术细节

| 部分 | 文件 | 职责 |
|---|---|---|
| Host 半 | `lib/index.js` | `webServer` 注册 `GET/PUT /kidai-clipboard/state` 与 `/ping`；JSON 校验 + 原子落盘 |
| Client 半 | `lib/client.js` | 悬浮窗 UI、捕获/粘贴/fork 逻辑、文件夹树、标签管理（ModuleLoader 格式） |
| 组装 | `cordis.patch.yml` | 单 loader row 挂载 host；`dsh.client` 声明驱动 browser 模块 |
| 槽位 | —— | `sidebar.footer.action` / `shell.overlay` / `conversation.chat.assistant-actions` / `kidai-hub.tabs` / `settings.section` |

- **停靠**：`settings.window.dock: "right"`；右端钉死左侧拖宽（最小 280）；`margin` 挤出工作区；收起/关闭自动释放；停靠时扁平无缝（无投影、去掉自身顶边框、顶边紧贴会话区分界线）
- **拖动性能**：拖动/缩放期间**零 store 写入、零请求**，尺寸直接写 DOM（`requestAnimationFrame` 节流），左侧工作区联动按 ~90 ms 节流；面板内容在拖动时隐藏并显示实时尺寸占位屏，松手才落库一次
- **缩放把手位置**：`settings.ui.resizeHandle` = `corner`（默认，右下角）/ `edge`（窗口左侧整条竖列；左边界跟随指针、右边界固定）—— 右下角被其它插件遮挡时用 `edge`
- **操作按钮位置**：`settings.ui.actionBar` = `bottom`（默认，底部一行：新建输入 / 保存快照 / 抓取输入）/ `left`（面板左侧竖栏排列）
- **会话保存**：`remote.session.follow` + 反向 `page`（slim 事件），保存 `sessionId / lastSeq / transcript / agentPreset / cwd`
- **中途截断**：以 `turn/end` 事件列出已完成轮次；选定第 N 轮时 `atSeq` = 该 `turn/end` 的 seq，`turnCount` / `totalTurns` 记录截断信息，`records` 与转录同步裁剪
- **历史分页**：选择器先取 `follow` 最新一页，再用 `session.page({throughSeq})` 逐页回溯（滚动到顶部同样触发；浏览上限 20000 事件，独立于「最大会话记录数」），保存前自动补齐
- **继续**：`ctx.sessions.fork({sessionId, atSeq})`——先按选定轮次边界切，失败降级到最后完成轮次，再失败转录兜底
- **安全**：65 MB body 上限、id 白名单正则、损坏 JSON 容错、atomic tmp+rename
- **测试**：`scripts/smoke-*.mjs`（host 路由/契约/槽位行为）；`scripts/verify-*.mjs`（真实组合/捕获校验）

---

## 🔍 说明

- 依赖 DSH 前端服务 `sessions`/`conversation`/`remote.session`（不可用时给出提示）
- 本地开发需 `node scripts/sync-install.mjs` 同步到 profile 再重启

---

## 📄 License

MIT
