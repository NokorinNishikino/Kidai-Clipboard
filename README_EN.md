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
- 🧰 **Adjustable layout**: action buttons can sit in a bottom row or a **vertical column on the panel's left edge**; the resize handle can switch between the bottom-right corner and a **left-edge column** (keeps both clear of other plugins' overlays)
- 🎈 **Draggable collapsed pill**: the docked pill can be dragged up/down (position remembered); drag it away from the edge and release to expand it as a floating window
- 🌳 **Folder tree**: Obsidian-style collapsible groups; ungrouped entries stay flat
- 🖱️ **Drag to organise**: drop an entry on a folder row to move it in, on another entry to insert before/after it (and adopt that entry's folder), or on empty space to take it out
- ✏️ **Folder editor**: rename a folder and pick its palette colour (including "none") in a modal
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

- **Dock**: `settings.window.dock: "right"`; right edge pinned, drag the left edge to resize (min 280); released automatically on collapse/close; when docked the panel is flat and seamless (no shadow, no own top border — its top edge sits flush under the conversation divider)
- **Workspace inset**: injected as a stylesheet rule `#kidai-clipboard-dock-inset` → `[data-conversation-scroll]{margin-right:Npx!important}` (**never inline styles** — DSH's re-render wipes inline properties React doesn't know, which used to leave content hidden under the panel after switching sessions); collapsed state insets the 42px pill; dragging follows the pointer and eases into the dock position on release via `.kidc_snapBack`
- **Drag performance**: while dragging/resizing there are **no store writes and no requests** — size goes straight to the DOM (throttled by `requestAnimationFrame`), the workspace linkage is throttled to ~90 ms, and the panel content is hidden behind a live-size placeholder screen; everything is committed once on release
- **Resize handle position**: `settings.ui.resizeHandle` = `corner` (default, bottom-right) or `edge` (a full-height column on the window's left border; the left edge follows the pointer while the right edge stays put) — use `edge` when other plugins cover the bottom-right corner
- **Action buttons position**: `settings.ui.actionBar` = `bottom` (default, a bottom row: new input / save snapshot / grab draft) or `left` (a vertical column on the panel's left edge)
- **Collapsed pill**: `settings.window.pillTop` remembers its vertical position (absent = conversation top); a ≥3px displacement counts as a drag, otherwise as a click (click is decided on `pointerup`, so no stale state can swallow the next click); dragging >24px away from the right edge means "leave the dock" → `dock: null` and the window expands floating at that spot
- **Settings frame**: mirrors `kidai-snapshot-guard` — status chips (stats + version) → horizontal tabs (General / Session capture / Data / About) → card content; `SettingsPanel({ layout })` renders a left brand rail (168px) in `hub` mode and a horizontal brand head in `classic` (settings fallback) mode
- **Drag to organise**: native HTML5 drag & drop (`draggable` + `dragstart/dragover/drop`, the entry id travels via `dataTransfer`). Onto a folder row → set `folderId`; onto another entry → insert before/after depending on which half of the card the pointer is in, adopting that entry's `folderId`, then **re-number `order` (0..n-1) for every entry in that container**; onto empty space → `folderId = null`. Sort order: pinned → `order` → most recently updated. Every drop handler calls `stopPropagation`, otherwise the parent (folder row / list root) steals the highlight
- **Folder editor**: `prefs.folderEditor` holds the target id; the modal edits the name and picks a colour from `PALETTE` (null = none); `Enter` saves, `Esc` closes
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
