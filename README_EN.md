<div align="center">

# 📋 Kidai-ClipBoard (KCB)

**A global advanced clipboard for DeepSeek Harness** — save inputs and whole sessions, branch & continue in a brand-new session with one click.
[**简体中文**](README.md) · **English**

</div>

---

## ✨ Why?

Conversations, commands and snippets are scattered across sessions. KCB brings "grab the draft, snapshot the session, fork-continue from a snapshot, paste back into the composer" into a single **floating window** — no more scrolling chat history, no more copying long texts.

- 🪟 **Dockable floating window**: drag, resize both ways, snap to the right edge (workspace yields automatically, never overlapped), collapse to a side pill
- 📝 **Save input**: one-click grab of the current composer draft
- 🧩 **Save session**: full history snapshot (title / fork point / transcript), renameable
- ✂️ **Cut-off branch**: pick "keep up to turn N" while saving and every later turn is dropped (session at 12345 → save 123 only)
- 📜 **Scrollable turn picker**: the newest turns appear at once and older history keeps loading as you scroll up
- 🔘 **Per-reply entry**: a "save session branch" button in every assistant reply's action row, defaulting to that reply's turn
- 🌳 **Folder tree**: Obsidian-style collapsible groups; ungrouped entries stay flat
- 🔀 **Continue in a new session**: runs DSH's native fork on a snapshot at the chosen turn (resume from 123 and keep going 12367); transcript fallback if the source session is gone
- 🏷️ **Manage**: folders, colored tags, per-entry colors, pinning, search, multi-select batch delete

> **Ready to use** — after restarting DSH, open it from the "Auto Clipboard" launcher at the bottom of the sidebar.

---

## 🚀 Quick start

### Install

```bash
# Local dev install (or install through its own marketplace)
dsh plugin --profile desktop add file:D:\path\to\kidai-clipboard
# or GitHub:
dsh plugin --profile desktop add git+https://github.com/NokorinNishikino/Kidai-Clipboard.git
```

**Restart DSH** to activate.

### Uninstall

```bash
dsh plugin --profile desktop remove kidai-clipboard
```

Or remove the dependency and bundle declaration from `profiles/desktop/package.json`, then delete `node_modules/kidai-clipboard`.

---

## 🎛️ At a glance

- **Project / package**: `kidai-clipboard`; brand **Kidai-ClipBoard**, short **KCB**
- **Shape**: a DSH dual-face Bundle (Host persistence + Client UI), works on Desktop and the Web UI
- **Data**: `$DSH_HOME/kidai-clipboard/store.json` (schema 1, atomic writes)
- **Bounds**: entries ≤ 5000, session records ≤ 8000, transcript ≤ 1 MB

---

## 📚 Technical details

| Part | File | Role |
|---|---|---|
| Host half | `lib/index.js` | `webServer` routes `GET/PUT /kidai-clipboard/state` + `/ping`; JSON validation & atomic persistence |
| Client half | `lib/client.js` | floating-window UI, capture/paste/fork logic, folder tree, tag management (ModuleLoader format) |
| Composition | `cordis.patch.yml` | single loader row mounts the host; `dsh.client` declaration feeds the browser module manifest |
| Slots | — | `sidebar.footer.action` / `shell.overlay` / `conversation.chat.assistant-actions` / `kidai-hub.tabs` / `settings.section` |

- **Dock**: `settings.window.dock: "right"`; right edge pinned, drag the left edge to resize (min 280); workspace is *squeezed* via margin so nothing is covered; released automatically on collapse/close; when docked the panel is flat and seamless (no shadow, no own top border — its top edge sits flush under the conversation divider)
- **Drag performance**: while dragging/resizing there are **no store writes and no requests** — size goes straight to the DOM (throttled by `requestAnimationFrame`), the workspace linkage is throttled to ~90 ms, and the panel content is hidden behind a live-size placeholder screen; everything is committed once on release
- **Session capture**: `remote.session.follow` + reverse `page` (slim events), storing `sessionId / lastSeq / transcript / agentPreset / cwd`
- **Cut-off**: completed turns come from `turn/end` events; choosing turn N sets `atSeq` to that event's seq and records `turnCount` / `totalTurns`, trimming `records` and the transcript to match
- **History paging**: the picker loads the newest `follow` page first, then walks back with `session.page({throughSeq})` (scroll-to-top does the same; browsing is capped at 20000 events, independent of the max-records setting) and tops up before saving
- **Continue**: `ctx.sessions.fork({sessionId, atSeq})` — cuts at the chosen turn first, falls back to the last completed turn, then to a transcript paste
- **Safety**: 65 MB body cap, id whitelist regex, corrupt-JSON tolerance, atomic tmp+rename
- **Tests**: `scripts/smoke-*.mjs` (host routes / contract / slot behaviour); `scripts/verify-*.mjs` (real composition / capture checks)

---

## 🔍 Notes

- Depends on the DSH frontend services `sessions`/`conversation`/`remote.session` (shows a hint when unavailable)
- For local development, run `node scripts/sync-install.mjs` to sync into the profile, then restart

---

## 📄 License

MIT
