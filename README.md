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
- 🌳 **文件树分组**：Obsidian 风格文件夹树，展开/收起，未分类平铺
- 🔀 **在新会话中继续**：对快照执行 DSH 原生 fork，一键分支续写；原会话失效时自动转录兜底
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
| 槽位 | —— | `sidebar.footer.action` / `shell.overlay` / `kidai-hub.tabs` / `settings.section` |

- **停靠**：`settings.window.dock: "right"`；右端钉死左侧拖宽（最小 280）；`margin` 挤出工作区；收起/关闭自动释放
- **会话保存**：`remote.session.follow` + 反向 `page`（slim 事件），保存 `sessionId / lastSeq / transcript / agentPreset / cwd`
- **继续**：`ctx.sessions.fork({sessionId, atSeq})`——先按保存点切，失败降级到最后完成轮次，再失败转录兜底
- **安全**：65 MB body 上限、id 白名单正则、损坏 JSON 容错、atomic tmp+rename
- **测试**：`scripts/smoke-*.mjs`（host 路由/契约/槽位行为）；`scripts/verify-*.mjs`（真实组合/捕获校验）

---

## 🔍 说明

- 依赖 DSH 前端服务 `sessions`/`conversation`/`remote.session`（不可用时给出提示）
- 本地开发需 `node scripts/sync-install.mjs` 同步到 profile 再重启

---

## 📄 License

MIT
