// Kidai Clipboard 纪代剪贴板 — client half.
//
// DSH client bundle format (as in kidai-hub):
//   window.__ModuleLoader__.load({ id, factory })
// The factory's `require` resolves against the browser module table, and the
// module exports { apply, inject }. `inject` lists the Cordis services that
// apply(ctx) receives.
//
// Feature map:
//   • A floating window pinned inside the DSH window (draggable, expandable,
//     collapsible to a small pill; position persisted server-side).
//   • Save user input: captures the composer draft of the current session
//     (conversation.input facade) into the clipboard store.
//   • Save session state: pulls the session history (follow + page), slims it
//     to essential events, renders a transcript, and stores it with the
//     session identity + lastSeq for later continuation.
//   • Continue: forks the original session at the saved seq into a NEW session
//     (the "branch in a new session" primitive) and opens it.
//   • Paste: inserts the transcript / input text into the composer draft
//     (inputActions.setDraft), or copies it via writeClipboard.
//   • Management: folders, color tags, per-entry colors, pinning, search,
//     multi-select batch delete.
//
// Storage: the browser writes the whole state to the host half through
// PUT /kidai-clipboard/state (persisted under $DSH_HOME/kidai-clipboard/).
// A localStorage mirror keeps UI prefs and a boot fallback.

window.__ModuleLoader__.load({
	id: "kidai-clipboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _client_runtime = require("@deepseek-ai/dsh-client-store");

		const jx = react_jsx_runtime.jsx;
		const jxs = react_jsx_runtime.jsxs;
		const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useContext, useSyncExternalStore } = react;

		//#region KidaiClipboard.module.css
		const css = ".kidc_*{--kidc-radius:12px}.kidc_root{position:fixed;z-index:26;user-select:none;-webkit-user-select:none;font-family:inherit}.kidc_panelWrap{position:relative;display:flex;flex-direction:column;height:100%;min-height:0}.kidc_resizeHandle{position:absolute;right:-1px;bottom:-1px;width:18px;height:18px;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);cursor:nwse-resize;border-radius:4px 0 0 0;opacity:0;transition:opacity .12s}.kidc_resizeHandleDock{position:absolute;left:0;right:auto;bottom:auto;top:0;width:8px;height:100%;border-radius:0;opacity:.35;cursor:ew-resize;align-items:center;display:flex;flex-direction:column;justify-content:center;z-index:6}.kidc_panelWrap:hover .kidc_resizeHandleDock{opacity:.6}.kidc_resizeHandleDock:hover{opacity:1!important;background:var(--dsw-alias-interactive-bg-hover)}.kidc_resizeHandleDock:after{content:'';width:2px;height:28px;border-radius:2px;background:var(--dsw-alias-label-tertiary);opacity:.75}.kidc_resizeHandleDock:hover:after{background:var(--dsw-alias-label-primary);opacity:1}.kidc_panelWrap:hover .kidc_resizeHandle{opacity:.8}.kidc_resizeHandle:hover{opacity:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.kidc_panel{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;max-height:calc(100vh - 32px);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--kidc-radius);box-shadow:0 10px 30px rgba(0,0,0,.28);overflow:hidden}.kidc_header{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:grab;border-bottom:1px solid var(--dsw-alias-border-l2)}.kidc_header:active{cursor:grabbing}.kidc_brand{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:12px;color:#fff;background:linear-gradient(135deg,#5b8def,#8a5cf6);flex:none}.kidc_title{min-width:0;flex:1;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kidc_count{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;flex:none}.kidc_iconBtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex:none;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.kidc_iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.kidc_iconBtn[data-active=\"true\"]{color:var(--dsw-alias-state-business-primary)}.kidc_iconBtn:disabled{opacity:.45;cursor:default}.kidc_body{min-height:0;display:flex;flex-direction:column;overflow:hidden;flex:1}.kidc_searchRow{display:flex;align-items:center;gap:6px;margin:8px 10px 4px}.kidc_searchRow .kidc_search{margin:0;flex:1;min-width:0}.kidc_searchRow .kidc_tabs{min-width:max-content;border-bottom:0;padding:0;gap:4px}.kidc_searchRow .kidc_tab{height:30px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));border:1px solid var(--dsw-alias-border-l1,transparent);padding:0 10px;flex:none;white-space:nowrap;min-width:max-content}.kidc_searchRow .kidc_tab[data-active=\"true\"]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}.kidc_filterRowCompact{padding:2px 10px 6px;gap:4px}.kidc_search{display:flex;align-items:center;gap:6px;margin:8px 10px 4px;position:relative}.kidc_search svg{position:absolute;left:8px;color:var(--dsw-alias-label-tertiary);pointer-events:none}.kidc_searchInput{width:100%;height:30px;padding:0 30px 0 30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}.kidc_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.kidc_searchInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}.kidc_searchClear{position:absolute;right:4px;top:50%;transform:translateY(-50%)}.kidc_tabs{display:flex;gap:2px;padding:2px 10px 6px;border-bottom:1px solid var(--dsw-alias-border-l2)}.kidc_tab{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.kidc_tab:hover{color:var(--dsw-alias-label-primary)}.kidc_tab[data-active=\"true\"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}.kidc_filters{display:flex;align-items:center;gap:6px;padding:6px 10px 2px;flex-wrap:wrap}.kidc_chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}.kidc_chip:hover{border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-label-primary)}.kidc_chip[data-active=\"true\"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}.kidc_dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}.kidc_toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2)}.kidc_iconOnly{width:28px;padding:0;justify-content:center}.kidc_toolgap{flex:1}.kidc_toolText{color:var(--dsw-alias-label-tertiary);font-size:11px;padding:0 4px}.kidc_filterRow{display:flex;gap:6px;align-items:center;padding:4px 10px 0;flex-wrap:wrap}.kidc_tagPicker{display:flex;gap:4px;flex-wrap:wrap;max-height:74px;overflow:auto}.kidc_list{min-height:0;overflow:auto;padding:4px 6px 8px;display:flex;flex-direction:column;gap:4px}.kidc_treeList{gap:2px}.kidc_treeGroup{display:flex;flex-direction:column;gap:2px}.kidc_treeHead{display:flex;align-items:center;gap:6px;height:26px;padding:0 6px 0 2px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-align:left;flex:none}.kidc_treeHead:hover{background:var(--dsw-alias-interactive-bg-hover)}.kidc_treeChevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:10px;transition:transform .12s;display:inline-flex}.kidc_treeChevronOpen{transform:rotate(90deg)}.kidc_treeName{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}.kidc_treeItems{display:flex;flex-direction:column;gap:4px;padding-left:14px;border-left:1px solid var(--dsw-alias-border-l1)}.kidc_card{position:relative;display:flex;flex-direction:column;gap:2px;padding:8px 8px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:border-color .12s}.kidc_card:hover{border-color:var(--dsw-alias-border-l4)}.kidc_card[data-selected=\"true\"]{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}.kidc_cardRow{display:flex;align-items:center;gap:6px;min-width:0}.kidc_cardTitle{min-width:0;flex:1;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kidc_badge{font-size:10px;line-height:14px;border-radius:5px;padding:0 5px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);flex:none}.kidc_snippet{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}.kidc_previewLine{-webkit-line-clamp:1;font-size:11px}.kidc_fullText{color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto;padding:6px 8px;margin:4px 0 2px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;user-select:text;-webkit-user-select:text}.kidc_chevron{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex;transition:transform .12s}.kidc_chevron[data-open=true]{transform:rotate(90deg)}.kidc_cardMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}.kidc_metaText{color:var(--dsw-alias-label-caption);font-size:10px;flex:none}.kidc_actions{display:none;position:absolute;top:5px;right:5px;gap:2px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:2px}.kidc_card:hover .kidc_actions{display:flex}.kidc_actions .kidc_iconBtn{width:22px;height:22px;border-radius:5px}.kidc_actions .kidc_iconBtn svg{width:13px;height:13px}.kidc_checkbox{width:16px;height:16px;flex:none;border-radius:5px;border:1px solid var(--dsw-alias-border-l2);display:grid;place-items:center;color:#fff;background:transparent;cursor:pointer;padding:0}.kidc_checkbox[data-checked=\"true\"]{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}.kidc_empty{padding:28px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;white-space:pre-line}.kidc_footer{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l2);align-items:center}.kidc_bodyRow{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.kidc_bodyRowSide{flex-direction:row}.kidc_sideActions{display:flex;flex-direction:column;gap:6px;padding:8px 6px;flex:none;align-items:center;border-right:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}.kidc_sideActions .kidc_ghost,.kidc_sideActions .kidc_primary{width:34px;height:34px;padding:0;justify-content:center}.kidc_primary{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;font-size:12px;cursor:pointer}.kidc_primaryAlt{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent);color:var(--dsw-alias-state-business-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}.kidc_primaryAlt:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 30%,transparent)}.kidc_folderBtn{width:32px;height:30px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2)}.kidc_folderSelect{max-width:130px;height:24px;font-size:11px}.kidc_primary:disabled{opacity:.5;cursor:default}.kidc_ghost{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.kidc_ghost:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}.kidc_ghost[data-active=\"true\"]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}.kidc_danger{background:color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 12%,transparent);color:var(--dsw-alias-state-danger-primary,#d95c5c);border-color:color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 45%,transparent)}.kidc_renameInput{flex:1;min-width:0;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}.kidc_renameInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}.kidc_dockPill{position:fixed;right:0;display:inline-flex;flex-direction:column;align-items:center;gap:6px;width:36px;padding:10px 4px;border:1px solid var(--dsw-alias-border-l2);border-right:0;border-radius:8px 0 0 8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer;z-index:26;user-select:none;transition:background .12s ease,width .12s ease,padding .12s ease}.kidc_dockPill:hover{width:42px;padding:12px 6px;background:var(--dsw-alias-interactive-bg-hover)}.kidc_dockPill:active{opacity:.85}.kidc_dockPill:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.kidc_dockPillArrow{font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary)}.kidc_dockPill:hover .kidc_dockPillArrow{color:var(--dsw-alias-label-primary)}.kidc_dockPill{cursor:grab}.kidc_dockPill:active{cursor:grabbing}.kidc_dockPill{cursor:grab!important}.kidc_dockedRight .kidc_panel{border-radius:0!important;border-right:0;border-top:0!important;box-shadow:none!important;border-left:1px solid var(--dsw-alias-border-l2)}.kidc_resizing{contain:layout paint;pointer-events:none;will-change:width;transform:translateZ(0)}.kidc_resizing *{transition:none!important}.kidc_resizingW .kidc_panel>*{min-width:var(--kidc-lock-w,0px);visibility:hidden}.kidc_resizeGhost{display:none;position:absolute;left:0;right:0;top:0;bottom:0;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none;text-align:center}.kidc_resizingW .kidc_resizeGhost{display:flex}.kidc_resizeGhostValue{font-size:20px;font-weight:600;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.kidc_resizeGhostHint{color:var(--dsw-alias-label-tertiary);font-size:11px}.kidc_dragShield{position:fixed;top:0;left:0;right:0;bottom:0;z-index:27;background:transparent}.kidc_snapBack{transition:left .2s cubic-bezier(.22,.61,.36,1),right .2s cubic-bezier(.22,.61,.36,1),top .2s cubic-bezier(.22,.61,.36,1),width .2s cubic-bezier(.22,.61,.36,1),height .2s cubic-bezier(.22,.61,.36,1)}.kidc_rootCollapsed{left:auto!important;top:auto!important;width:0!important;height:0!important;overflow:visible}.kidc_crashFallback{position:fixed;right:12px;top:80px;z-index:27;display:flex;flex-direction:column;gap:8px;max-width:320px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 45%,transparent);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 30px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}.kidc_crashText{color:var(--dsw-alias-label-secondary);line-height:1.5;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.kidc_crashBtn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-state-danger-primary,#d95c5c);border-radius:7px;background:transparent;color:var(--dsw-alias-state-danger-primary,#d95c5c);font:inherit;font-size:12px;cursor:pointer;align-self:flex-start}.kidc_dockPillText{writing-mode:vertical-rl;letter-spacing:.12em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:220px}.kidc_dockPill:hover{border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-state-business-primary)}.kidc_headerCollapse{color:var(--dsw-alias-label-secondary)}.kidc_header .kidc_title{cursor:pointer}.kidc_header .kidc_title:hover{color:var(--dsw-alias-state-business-primary)}.kidc_pill{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 18px rgba(0,0,0,.2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}.kidc_pill:hover{border-color:var(--dsw-alias-label-tertiary)}.kidc_modal{position:fixed;inset:0;z-index:40;background:color-mix(in srgb,#000 45%,transparent);display:flex;align-items:center;justify-content:center;padding:24px}.kidc_modalCard{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;width:100%;max-width:480px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,.35)}.kidc_modalWide{max-width:680px}.kidc_modalHead{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.kidc_modalBody{padding:12px 14px;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:10px}.kidc_modalFoot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l2)}.kidc_field{display:flex;flex-direction:column;gap:4px}.kidc_label{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.kidc_input{width:100%;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;box-sizing:border-box}.kidc_textarea{width:100%;min-height:120px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;outline:none;resize:vertical;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.kidc_textarea:focus-visible,.kidc_input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}.kidc_palette{display:flex;gap:6px;flex-wrap:wrap}.kidc_swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex:none;padding:0}.kidc_swatch[data-active=\"true\"]{border-color:var(--dsw-alias-label-primary)}.kidc_swatch[data-none=\"true\"]{background:conic-gradient(#d95c5c 0 25%,#e8a33d 0 50%,#5b8def 0 75%,#2e9e63 0);opacity:.5}.kidc_transcript{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;margin:0;overflow:auto;max-height:46vh;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-word}.kidc_notice{position:absolute;left:12px;right:12px;bottom:10px;z-index:5;background:var(--dsw-alias-state-info-bg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-layer-1)));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px;animation:kidc_fadein .18s ease}.kidc_notice[data-error=\"true\"]{background:color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 14%,var(--dsw-alias-bg-layer-1))}@keyframes kidc_fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.kidc_launcher{box-sizing:border-box;height:42px;border-radius:12px;padding:0 10px 0 8px;gap:8px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);justify-content:flex-start}.kidc_launcher[data-wide=\"false\"]{justify-content:center}.kidc_rowList{display:flex;flex-direction:column;gap:4px}.kidc_rowItem{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}.kidc_rowName{min-width:0;flex:1;color:var(--dsw-alias-label-primary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kidc_rowMeta{color:var(--dsw-alias-label-tertiary);font-size:10px;flex:none}.kidc_spacer{flex:1}.kidc_settings{display:flex;flex-direction:column;gap:0;padding:4px 0;min-width:0}.kidc_settingsRoot{display:flex;flex-direction:column;gap:12px;max-width:100%;color:var(--dsw-alias-label-primary)}.kidc_layoutRow{display:flex;gap:16px;align-items:stretch;min-height:0}.kidc_classicCol{display:flex;flex-direction:column;gap:12px;min-width:0}.kidc_brandRail{flex:0 0 168px;border-right:1px solid var(--dsw-alias-border-l2);padding:18px 14px;position:sticky;top:0;align-self:flex-start;display:flex;flex-direction:column;gap:8px;min-height:220px;overflow:hidden}.kidc_brandHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.kidc_brandLogo{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--dsw-alias-state-business-primary),#7c6fe0);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;letter-spacing:-.01em;color:#fff;flex:none}.kidc_brandHead .kidc_brandLogo{width:30px;height:30px;border-radius:8px;font-size:13px}.kidc_brandTitle{font-size:14px;font-weight:600;line-height:1.35}.kidc_brandSub{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;word-break:break-word}.kidc_mainCol{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}.kidc_statChips{display:flex;flex-wrap:wrap;gap:6px}.kidc_statChip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 9px;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}.kidc_tabBar{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:6px;flex-wrap:wrap;align-items:center}.kidc_tabBtn{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;border-radius:8px;padding:5px 14px;cursor:pointer;transition:background .12s,color .12s,border-color .12s}.kidc_tabBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.kidc_tabBtn[data-active='true']{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);font-weight:600}.kidc_setCard{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:2px 12px}.kidc_setSection{padding:2px 0}.kidc_setHead{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:14px 2px 6px;display:flex;align-items:center;gap:6px}.kidc_setRow{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}.kidc_setRow:last-child{border-bottom:0}.kidc_setText{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;padding-right:16px}.kidc_setTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}.kidc_setDesc{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.kidc_toggle{position:relative;width:36px;height:20px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .15s}.kidc_toggle:after{content:\"\";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .15s,background .15s}.kidc_toggle[data-active=\"true\"]{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}.kidc_toggle[data-active=\"true\"]:after{transform:translateX(16px);background:#fff}.kidc_select{height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;flex:none;max-width:180px}.kidc_setBtn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;flex:none}.kidc_setBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}.kidc_setBtn[data-active=\"true\"]{color:var(--dsw-alias-state-danger-primary,#d95c5c);border-color:color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-danger-primary,#d95c5c) 10%,transparent)}.kidc_setHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;padding:8px 2px}.kidc_turnList{display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto;padding:2px}.kidc_turnItem{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit}.kidc_turnItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.kidc_turnItem[data-active=\"true\"]{border-color:#5b8def;background:color-mix(in srgb,#5b8def 12%,transparent)}.kidc_turnNo{flex:none;min-width:54px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.kidc_turnLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.kidc_turnTag{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}.kidc_branchTag{color:#5b8def}.kidc_branchWarn{color:#e8a33d}.kidc_turnStatus{color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center;padding:6px 2px}.kidc_inlineAction{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.kidc_inlineAction:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.kidc_treeHeadRow{display:flex;align-items:center;gap:4px;border-radius:8px}.kidc_treeHeadRow .kidc_treeHead{flex:1;min-width:0}.kidc_treeEdit{opacity:0;flex:none;transition:opacity .12s}.kidc_treeHeadRow:hover .kidc_treeEdit{opacity:1}.kidc_dropActive{outline:2px dashed var(--dsw-alias-state-business-primary);outline-offset:-2px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}.kidc_card[draggable='true']{cursor:grab}.kidc_card[draggable='true']:active{cursor:grabbing}.kidc_card.kidc_dropBefore{box-shadow:inset 0 3px 0 0 var(--dsw-alias-state-business-primary)}.kidc_card.kidc_dropAfter{box-shadow:inset 0 -3px 0 0 var(--dsw-alias-state-business-primary)}";
		const tagId = "kidai-clipboard/KidaiClipboard.module.css";
		if (typeof document !== "undefined") {
			const existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
			if (existing === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "kidai-clipboard";
				tag.dataset.pluginCss = tagId;
				tag.textContent = css;
				document.head.appendChild(tag);
			} else if (existing.textContent !== css) {
				existing.textContent = css;
			}
		}
		//#endregion

		//#region locale
		const NS = "kidai-clipboard";
		/** 插件版本（与 package.json 同步维护，用于设置页「关于」显示）。 */
		const PLUGIN_VERSION = "1.2.4";
		const zh = {
			launcher: "自动剪贴板",
			resizeHint: "拖动调整大小",
			resizeGhostHint: "松开以恢复内容",
			title: "Kidai 剪贴板",
			total: "{n} 条",
			all: "全部",
			inputs: "输入",
			sessions: "会话",
			searchPlaceholder: "搜索标题、内容、转录…",
			saveInput: "保存输入",
			saveInputHint: "抓取当前输入框的草稿",
			saveSession: "保存会话",
			saveSessionHint: "把整个会话状态存为快照",
			collapse: "收起",
			expand: "展开",
			close: "关闭",
			newInput: "新建输入",
			newFolder: "新建文件夹",
			manageTags: "管理标签",
			selectMode: "多选",
			selectAll: "全选",
			clearSelection: "清空选择",
			exitSelect: "退出多选",
			deleteSelected: "删除所选 ({n})",
			deleteSelectedConfirm: "再点一次确认删除 ({n})",
			edit: "编辑",
			paste: "发送到输入框",
			copy: "复制",
			save: "保存",
			continue_: "在新会话中继续",
			pasteTranscript: "粘贴转录到输入框",
			copyTranscript: "复制转录文本",
			openSession: "查看会话快照",
			rename: "重命名",
			renameSession: "重命名会话",
			renamePlaceholder: "输入新的名称…",
			renamed: "已重命名。",
			delete: "删除",
			pin: "置顶",
			unpin: "取消置顶",
			emptyAll: "还没有保存内容。\n点「保存输入」抓取当前草稿，或点「保存会话」存下整段对话。",
			emptyFilter: "没有匹配的内容。",
			noCurrentSession: "当前没有会话，先开始一个会话吧。",
			emptyDraft: "输入框是空的，没什么可保存的。",
			savedInput: "已保存输入。",
			capturing: "正在抓取会话历史…",
			captured: "会话已保存（{n} 条消息）。",
			capturedEmpty: "当前会话还没有对话内容，快照为空。发几条消息后再试。",
			captureTitle: "保存会话分支",
			captureHint: "选择保存到第几轮为止：其后的对话不会进入快照，下次从该处分支继续。",
			captureTurn: "第 {n} 轮",
			captureLastTurn: "最后一轮 · 全部内容",
			captureUntitled: "（无用户消息）",
			captureWillDrop: "将丢弃第 {n} 轮之后的 {k} 轮",
			captureNothing: "当前只有一个已完成轮次，原样保存。",
			capturedAtTurn: "已保存到第 {n} 轮（{k} 条消息）。",
			capturedTrimmed: "已保存。记录数超过「最大会话记录数」设置，已裁掉较早的 {n} 条（分支点与转录不受影响）。",
			captureLoadCapped: "已到浏览上限（{n} 轮）· 可继续选择已加载的更早轮次",
			saveBranchHint: "保存会话分支（可只存到第几轮）",
			captureLoadingMore: "正在加载更早的历史…",
			captureScrollUp: "↑ 向上滚动加载更早的历史",
			captureOldest: "已到会话开头 · 共 {n} 轮",
			captureSaving: "保存中…",
			branchPoint: "分支点：第 {n} / {m} 轮",
			branchPointAll: "分支点：全部 {m} 轮",
			branchDropped: "快照截断于第 {n} 轮，其后的 {k} 轮不会带入新会话。",
			captureFailed: "保存会话失败：{err}",
			continued: "已在新会话中继续。",
			continueFailed: "继续失败：{err}",
			pasted: "已粘贴到输入框。",
			pasteNoSession: "没有当前会话，无法粘贴。",
			copied: "已复制到剪贴板。",
			copyFailed: "复制失败：{err}",
			deleted: "已删除 {n} 条。",
			deletedOne: "已删除。",
			confirmDeleteTitle: "确认删除",
			confirmDeleteMsg: "将删除 {n} 条内容，不可恢复。",
			confirm: "确认",
			cancel: "取消",
			folderName: "文件夹名称",
			tagName: "标签名称",
			folder: "文件夹",
			folders: "文件夹管理",
			tags: "标签管理",
			noFolder: "未分类",
			allFolders: "全部文件夹",
			relNow: "刚刚",
			relMinutes: "分钟",
			relHours: "小时",
			relDays: "天",
			relMonths: "个月",
			relYears: "年",
			relAgo: "{n} {unit}前",
			color: "颜色",
			labelTitle: "标题",
			content: "内容",
			transcript: "会话转录",
			inputBadge: "输入",
			sessionBadge: "会话",
			msgCount: "{n} 条消息",
			folderDeleteWarn: "删除文件夹不会删除其中的内容，仅移出文件夹。",
			tagDeleteWarn: "删除标签会从所有内容上移除。",
			serverOffline: "无法连接剪贴板存储，数据仅保存在本页。",
			busy: "处理中…",
			savedToFolder: "已移动到「{name}」。",
			editFolder: "编辑文件夹",
			movedToLoose: "已移出文件夹。",
			reordered: "已调整顺序。",
			pillDragHint: "拖动上下移动；向左拖出则松手展开为悬浮窗",
			dragHint: "拖动可移动到文件夹，拖到空白处移出文件夹",
			edgeHint: "拖动标题栏可移动窗口",
			settingsTitle: "剪贴板设置",
			settingsGeneral: "常规",
			settingsWindow: "悬浮窗",
			settingsShortcut: "快捷键 Ctrl/⌘+Shift+K",
			settingsShortcutDesc: "显示 / 隐藏悬浮窗",
			settingsResizeHandle: "缩放把手位置",
			settingsActionBar: "操作按钮位置",
			settingsActionBarDesc: "默认排在面板底部一行；也可改成面板左侧的竖栏（底部被其它插件浮层遮挡时更保险）",
			actionBarBottom: "底部一行（默认）",
			actionBarLeft: "左侧竖栏",
			settingsResizeHandleDesc: "右下角把手可能被其它插件的悬浮层遮住；可改成窗口左侧的整条竖列（左边缘拖动，右边界固定）",
			resizeHandleCorner: "右下角（默认）",
			resizeHandleEdge: "左侧竖列",
			settingsResetPosition: "重置窗口位置",
			settingsResetPositionDone: "窗口位置已重置。",
			settingsRestartWidget: "重启剪贴板窗口",
			settingsRestartWidgetDesc: "停止当前剪贴板窗口并重新唤出（脱离卡死）",
			restarted: "剪贴板窗口已重启。",
			settingsCapture: "会话保存",
			settingsMaxRecords: "会话最大记录数",
			settingsMaxRecordsDesc: "单个快照保存的事件上限（只影响快照体积，浏览历史不受此限制）",
			settingsIncludeTools: "转录包含工具调用",
			settingsIncludeToolsDesc: "在转录文本中加入工具名称与调用摘要（影响后续保存）",
			settingsIncludeHeaders: "转录包含请求/标题行",
			settingsIncludeHeadersDesc: "在转录中加入模型、代理预设与标题信息（影响后续保存）",
			settingsManageTagsDesc: "创建、重命名和删除标签，并给标签配色",
			settingsData: "数据",
			settingsDataStats: "输入 {inputs} 条 / 会话 {sessions} 条 / 文件夹 {folders} 个 / 标签 {tags} 个",
			settingsStoragePath: "存储：$DSH_HOME/kidai-clipboard/store.json",
			settingsClear: "清空全部剪贴板内容",
			settingsClearDesc: "删除所有条目、文件夹与标签，不可恢复",
			settingsClearConfirm: "确认清空？",
			settingsCleared: "已清空。",
			settingsAbout: "关于",
			settingsVersion: "Kidai Clipboard v{version}",
			settingsBrandSub: "{inputs} 输入 · {sessions} 会话 · {folders} 文件夹 · {tags} 标签",
			settingsAboutDesc: "跨会话剪贴板 + 会话预设。数据存放在 $DSH_HOME/kidai-clipboard/store.json，不会上传任何内容。",
		};
		const en = {
			launcher: "Clipboard",
			resizeHint: "Drag to resize",
			resizeGhostHint: "Release to restore",
			title: "Kidai Clipboard",
			total: "{n} items",
			all: "All",
			inputs: "Inputs",
			sessions: "Sessions",
			searchPlaceholder: "Search title, content, transcript…",
			saveInput: "Save input",
			saveInputHint: "Capture the composer draft",
			saveSession: "Save session",
			saveSessionHint: "Snapshot the whole session state",
			collapse: "Collapse",
			expand: "Expand",
			close: "Close",
			newInput: "New input",
			newFolder: "New folder",
			manageTags: "Manage tags",
			selectMode: "Select",
			selectAll: "Select all",
			clearSelection: "Clear",
			exitSelect: "Exit select",
			deleteSelected: "Delete ({n})",
			deleteSelectedConfirm: "Click again to delete ({n})",
			edit: "Edit",
			paste: "Send to composer",
			copy: "Copy",
			save: "Save",
			continue_: "Continue in a new session",
			pasteTranscript: "Paste transcript to composer",
			copyTranscript: "Copy transcript",
			openSession: "View session snapshot",
			rename: "Rename",
			renameSession: "Rename session",
			renamePlaceholder: "Enter a new name…",
			renamed: "Renamed.",
			delete: "Delete",
			pin: "Pin",
			unpin: "Unpin",
			emptyAll: "Nothing saved yet.\nUse “Save input” to grab the composer draft, or “Save session” to snapshot the conversation.",
			emptyFilter: "No matching items.",
			noCurrentSession: "No current session yet — start one first.",
			emptyDraft: "The composer draft is empty.",
			savedInput: "Input saved.",
			capturing: "Fetching session history…",
			captured: "Session saved ({n} messages).",
			capturedEmpty: "The current session has no conversation yet — the snapshot is empty. Send a few messages and try again.",
			captureTitle: "Save session branch",
			captureHint: "Choose the last turn to keep: later turns stay out of the snapshot, and the next branch resumes from here.",
			captureTurn: "Turn {n}",
			captureLastTurn: "last turn · keeps everything",
			captureUntitled: "(no user message)",
			captureWillDrop: "Turns after {n} ({k}) will be dropped",
			captureNothing: "Only one completed turn — saving as is.",
			capturedAtTurn: "Saved through turn {n} ({k} messages).",
			capturedTrimmed: "Saved. Older {n} records were trimmed by the max-records setting (branch point and transcript are unaffected).",
			captureLoadCapped: "Browsing limit reached ({n} turns) · older loaded turns are still selectable",
			saveBranchHint: "Save a session branch (keep up to a chosen turn)",
			captureLoadingMore: "Loading earlier history…",
			captureScrollUp: "↑ Scroll up to load earlier history",
			captureOldest: "Start of session · {n} turns",
			captureSaving: "Saving…",
			branchPoint: "Branch point: turn {n} of {m}",
			branchPointAll: "Branch point: all {m} turns",
			branchDropped: "Snapshot stops at turn {n}; the following {k} turns are not carried into the new session.",
			captureFailed: "Session capture failed: {err}",
			continued: "Continued in a new session.",
			continueFailed: "Continue failed: {err}",
			pasted: "Pasted into the composer.",
			pasteNoSession: "No current session to paste into.",
			copied: "Copied to clipboard.",
			copyFailed: "Copy failed: {err}",
			deleted: "Deleted {n} items.",
			deletedOne: "Deleted.",
			confirmDeleteTitle: "Confirm deletion",
			confirmDeleteMsg: "Delete {n} items? This cannot be undone.",
			confirm: "Confirm",
			cancel: "Cancel",
			folderName: "Folder name",
			tagName: "Tag name",
			folder: "Folder",
			folders: "Folders",
			tags: "Tags",
			noFolder: "Unfiled",
			allFolders: "All folders",
			relNow: "just now",
			relMinutes: "min",
			relHours: "h",
			relDays: "d",
			relMonths: "mo",
			relYears: "y",
			relAgo: "{n} {unit} ago",
			color: "Color",
			labelTitle: "Title",
			content: "Content",
			transcript: "Transcript",
			inputBadge: "IN",
			sessionBadge: "SES",
			msgCount: "{n} messages",
			folderDeleteWarn: "Deleting a folder leaves its contents untouched.",
			tagDeleteWarn: "Deleting a tag removes it from every entry.",
			serverOffline: "Clipboard storage unreachable; data stays in this page only.",
			busy: "Working…",
			savedToFolder: "Moved to “{name}”.",
			editFolder: "Edit folder",
			movedToLoose: "Removed from folder.",
			reordered: "Order updated.",
			pillDragHint: "Drag to move up/down · drag away from the edge to expand as a floating window",
			dragHint: "Drag onto a folder to move it, or onto the list to take it out",
			edgeHint: "Drag the header to move",
			settingsTitle: "Clipboard Settings",
			settingsGeneral: "General",
			settingsWindow: "Floating window",
			settingsShortcut: "Shortcut Ctrl/⌘+Shift+K",
			settingsShortcutDesc: "Show / hide the floating window",
			settingsResizeHandle: "Resize handle position",
			settingsActionBar: "Action buttons position",
			settingsActionBarDesc: "Bottom row by default; a vertical column on the panel's left edge keeps them clear of other plugins' overlays",
			actionBarBottom: "Bottom row (default)",
			actionBarLeft: "Left column",
			settingsResizeHandleDesc: "The bottom-right handle can be covered by other plugins' overlays; switch to a full-height column on the window's left edge (drag the left border, right border stays put)",
			resizeHandleCorner: "Bottom-right (default)",
			resizeHandleEdge: "Left edge column",
			settingsResetPosition: "Reset window position",
			settingsResetPositionDone: "Window position reset.",
			settingsRestartWidget: "Restart clipboard window",
			settingsRestartWidgetDesc: "Stop the current clipboard window and summon it again (unstuck)",
			restarted: "Clipboard window restarted.",
			settingsCapture: "Session capture",
			settingsMaxRecords: "Max session records",
			settingsMaxRecordsDesc: "Events stored per snapshot (only affects snapshot size; browsing older history is not limited by it)",
			settingsIncludeTools: "Include tool calls in transcript",
			settingsIncludeToolsDesc: "Add tool names and call summaries to the transcript (affects future captures)",
			settingsIncludeHeaders: "Include request/title lines in transcript",
			settingsIncludeHeadersDesc: "Add model, agent preset and title lines (affects future captures)",
			settingsManageTagsDesc: "Create, rename and delete tags, and assign tag colors",
			settingsData: "Data",
			settingsDataStats: "{inputs} inputs / {sessions} sessions / {folders} folders / {tags} tags",
			settingsStoragePath: "Storage: $DSH_HOME/kidai-clipboard/store.json",
			settingsClear: "Clear all clipboard data",
			settingsClearDesc: "Deletes every entry, folder and tag; cannot be undone",
			settingsClearConfirm: "Really clear everything?",
			settingsCleared: "Cleared.",
			settingsAbout: "About",
			settingsVersion: "Kidai Clipboard v{version}",
			settingsBrandSub: "{inputs} inputs · {sessions} sessions · {folders} folders · {tags} tags",
			settingsAboutDesc: "Cross-session clipboard + session presets. Data lives in $DSH_HOME/kidai-clipboard/store.json; nothing is uploaded.",
		};
		//#endregion

		//#region utils
		const PALETTE = ["#e8a33d", "#d95c5c", "#2e9e63", "#5b8def", "#8a5cf6", "#3fbfc9", "#e06aa9", "#8c8c8c"];
		function uid() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return String(Date.now()).slice(-9) + "-" + Math.random().toString(36).slice(2, 10);
		}
		function clip(value, max) {
			if (typeof value !== "string") return "";
			return value.length > max ? value.slice(0, max) + "…" : value;
		}
		function firstLine(value) {
			const line = String(value ?? "").split("\n").find((l) => l.trim() !== "");
			return line === undefined || line === null ? "" : clip(line.trim(), 80);
		}
		function colorOf(value) {
			return typeof value === "string" && value !== "" ? value : null;
		}
		function entryKindBadge(entry) {
			return entry.kind;
		}
		function snippetOf(entry) {
			if (entry.kind === "input") return entry.text !== null && typeof entry.text === "string" ? entry.text : "";
			return entry.session !== null && entry.session !== undefined ? (entry.session.transcript ?? "") : "";
		}
		function seqOf(record) {
			if (record === null || record === undefined) return Number.MAX_SAFE_INTEGER;
			const event = record.event;
			if (event !== null && event !== undefined && typeof event.seq === "number") return event.seq;
			if (typeof record.seq === "number") return record.seq;
			return Number.MAX_SAFE_INTEGER;
		}
		function slimContent(content, limit = 4000) {
			if (!Array.isArray(content)) return [];
			const out = [];
			for (const block of content) {
				if (block === null || block === undefined || typeof block !== "object") continue;
				if (block.type === "text") { out.push({ type: "text", text: clip(String(block.text ?? ""), limit) }); continue; }
				if (block.type === "reasoning") { out.push({ type: "reasoning", text: clip(String(block.text ?? ""), 2000) }); continue; }
				if (block.type === "tool-call") { out.push({ type: "tool-call", name: clip(String(block.name ?? ""), 80), arguments: clip(String(block.arguments ?? ""), 1000) }); continue; }
				if (block.type === "tool-result") { out.push({ type: "tool-result", isError: block.isError === true, text: clip(typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""), 1500) }); continue; }
				if (block.type === "image") { out.push({ type: "image" }); continue; }
				out.push({ type: block.type });
			}
			return out;
		}
		function textOfSlim(content) {
			if (!Array.isArray(content)) return "";
			return content
				.map((block) => {
					if (block === null || block === undefined) return "";
					if (block.type === "text" || block.type === "reasoning") return block.text ?? "";
					if (block.type === "tool-call") return `[工具 ${block.name ?? ""}] ${block.arguments ?? ""}`;
					if (block.type === "tool-result") return block.isError === true ? `[工具错误] ${block.text ?? ""}` : `[工具结果] ${block.text ?? ""}`;
					return block.type;
				})
				.join("\n");
		}
		/** Slim one event record to essentials; returns null when not worth keeping. */
		function slimRecord(record) {
			const event = record !== null && record !== undefined ? record.event : undefined;
			const type = record?.type === "chunks" ? "chunks" : event?.type;
			if (typeof type !== "string") return null;
			const data = event !== null && event !== undefined && event.data !== null && event.data !== undefined ? event.data : {};
			const seq = event !== null && event !== undefined && typeof event.seq === "number" ? event.seq : 0;
			const time = event !== null && event !== undefined && typeof event.time === "number" ? event.time : 0;
			const base = { type, seq, time };
			switch (type) {
				case "user/message":
					return { ...base, role: "user", content: slimContent(data.content) };
				case "assistant/message":
					return {
						...base,
						role: "assistant",
						turn: typeof data.turn === "number" ? data.turn : undefined,
						messageId: typeof data.message?.id === "string" ? clip(data.message.id, 128) : undefined,
						content: slimContent(data.message?.content),
						reason: typeof data.message?.source === "string" ? data.message.source : undefined,
					};
				case "tool/call":
					return { ...base, name: clip(String(data.name ?? ""), 80), arguments: clip(String(data.arguments ?? ""), 1000) };
				case "tool/result": {
					const message = data.message ?? {};
					return { ...base, isError: data.error !== undefined || message.error === true, text: clip(typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""), 1200) };
				}
				case "request/header":
					return { ...base, model: data.header?.model !== null && data.header?.model !== undefined ? data.header.model : undefined, reason: data.reason };
				case "session/title":
					return { ...base, title: clip(String(data.title ?? ""), 120) };
				case "agent-preset/selected":
					return { ...base, agentPreset: clip(String(data.agentPreset ?? ""), 80) };
				case "model/selection":
					return { ...base, model: clip(String(data.model ?? ""), 80) };
				case "turn/start":
				case "turn/end":
					return { ...base, turn: data.turn };
				case "step/start":
				case "step/end":
					return { ...base, turn: data.turn, step: data.step };
				case "todo/write":
					return { ...base, count: Array.isArray(data.todos) ? data.todos.length : 0 };
				case "command/run":
					return { ...base, name: clip(String(data.name ?? ""), 80) };
				case "approval/asked":
					return { ...base, toolName: clip(String(data.toolName ?? ""), 80) };
				case "approval/decided":
					return { ...base, outcome: data.outcome };
				default:
					return null;
			}
		}
		/** Render slim records into a readable transcript. */
		function renderTranscript(records, msgCount = 0, opts = {}) {
			const includeTools = opts.includeTools !== false;
			const includeHeaders = opts.includeHeaders !== false;
			const lines = [];
			const A = "🤖 助手";
			const U = "🧑 用户";
			const T = "🔧 工具";
			for (const record of records) {
				if (record.role === "user") {
					lines.push(`## ${U}\n${textOfSlim(record.content)}`);
				} else if (record.role === "assistant") {
					lines.push(`## ${A}\n${textOfSlim(record.content)}`);
				} else if (record.type === "tool/call") {
					if (includeTools === true) lines.push(`## ${T} · ${record.name}\n${clip(record.arguments ?? "", 600)}`);
				} else if (record.type === "tool/result") {
					if (includeTools === true && record.isError === true) lines.push(`## ⚠️ 工具错误\n${clip(record.text ?? "", 600)}`);
				} else if (record.type === "request/header") {
					if (includeHeaders === true) lines.push(`## 请求 · ${record.model ?? "?"}${record.reason ? ` (${record.reason})` : ""}`);
				} else if (record.type === "agent-preset/selected") {
					if (includeHeaders === true) lines.push(`## 代理预设 · ${record.agentPreset}`);
				} else if (record.type === "session/title") {
					if (includeHeaders === true) lines.push(`## 会话标题 · ${record.title}`);
				}
			}
			let text = lines.join("\n\n");
			if (msgCount > 0) text = `# 会话转录（${msgCount} 条消息）\n\n${text}`;
			return text.length > 1024 * 1024 ? text.slice(0, 1024 * 1024) : text;
		}
		function countMessages(records) {
			let count = 0;
			for (const record of records) if (record.role === "user") count += 1;
			return count;
		}
		/** Completed turn boundaries (`turn/end`) inside slim records. The event
		 * seq of a `turn/end` is exactly the inclusive fork anchor the host
		 * expects, so a mark doubles as the branch point for that turn. */
		function turnMarks(records) {
			const marks = [];
			let lastUser = "";
			for (const record of records) {
				if (record === null || record === undefined) continue;
				if (record.role === "user") {
					lastUser = firstLine(textOfSlim(record.content));
				} else if (record.type === "turn/end") {
					marks.push({
						turn: typeof record.turn === "number" ? record.turn : marks.length + 1,
						seq: typeof record.seq === "number" ? record.seq : 0,
						label: lastUser,
						time: typeof record.time === "number" ? record.time : 0,
					});
					lastUser = "";
				}
			}
			return marks;
		}
		/** Cut a fetched history down to one completed turn (inclusive). */
		function sliceHistoryToTurn(history, boundarySeq) {
			if (typeof boundarySeq !== "number") return history;
			const records = history.records.filter((record) => (typeof record.seq === "number" ? record.seq : 0) <= boundarySeq);
			return { ...history, records, messageCount: countMessages(records), lastSeq: boundarySeq };
		}
		function now() {
			return Date.now();
		}
		/** Format a timestamp with the primitives' {unit,n} shape, never a raw object. */
		function relLabel(ts, t) {
			try {
				if (typeof _primitives.relativeTime === "function") {
					const r = _primitives.relativeTime(ts, Date.now());
					if (r !== null && r !== undefined && typeof r === "object" && typeof r.n === "number") {
						if (r.unit === "now") return t("relNow");
						const unit = t("rel" + String(r.unit).slice(0, 1).toUpperCase() + String(r.unit).slice(1));
						return t("relAgo", { n: r.n, unit });
					}
				}
			} catch {}
			try {
				return new Date(ts).toLocaleString();
			} catch {
				return "";
			}
		}
		/** Restart the floating window (脱离卡死): remount the whole overlay
		 * subtree with a fresh key and re-open the window at defaults. */
		function restartWidgetWidget() {
			const epoch = (meta.getSnapshot().restartEpoch ?? 0) + 1;
			meta.actions.patch({ restartEpoch: epoch, notice: null, noticeError: false });
			prefs.actions.patch({
				open: true,
				collapsed: false,
				selectMode: false,
				selected: [],
				expandedIds: [],
				editorVisible: false,
				editor: null,
				folderModal: false,
				folderEditor: null,
				tagModal: false,
				sessionModal: null,
				confirm: null,
			});
			commitData((d) => {
				d.settings = d.settings ?? {};
				d.settings.window = { x: 24, y: 96, expanded: true };
			});
			notifyMeta("restarted");
		}
		//#endregion

		//#region stores
		/** Lightweight UI prefs (persisted in localStorage). */
		const prefsDecl = _client_runtime.defineStore({
			init: () => ({
				open: true,
				collapsed: false,
				tab: "input",
				query: "",
				folder: "all",
				tag: "all",
				selectMode: false,
				selected: [],
				expandedIds: [],
				editorVisible: false,
				editor: null,
				folderModal: false,
				folderEditor: null,
				tagModal: false,
				sessionModal: null,
				confirm: null,
			}),
			persist: "kidai-clipboard.ui",
			actions: {
				patch: (d, partial) => { Object.assign(d, partial); },
				toggleSelect: (d, id) => {
					const index = d.selected.indexOf(id);
					if (index >= 0) d.selected.splice(index, 1);
					else d.selected.push(id);
				},
				setSelected: (d, ids) => { d.selected = ids.slice(); },
				toggleExpanded: (d, id) => {
					const index = d.expandedIds.indexOf(id);
					if (index >= 0) d.expandedIds.splice(index, 1);
					else d.expandedIds.push(id);
				},
			},
		});
		/** Clipboard data (authoritative host file; localStorage is only a fallback). */
		const dataDecl = _client_runtime.defineStore({
			init: () => ({
				schema: 1,
				updatedAt: 0,
				folders: [],
				tags: [],
				entries: [],
				settings: { window: null, ui: {} },
			}),
			actions: {
				set: (d, next) => {
					d.schema = next.schema ?? 1;
					d.updatedAt = next.updatedAt ?? 0;
					d.folders = Array.isArray(next.folders) ? next.folders : [];
					d.tags = Array.isArray(next.tags) ? next.tags : [];
					d.entries = Array.isArray(next.entries) ? next.entries : [];
					d.settings = next.settings && typeof next.settings === "object" ? next.settings : {};
				},
			},
		});
		/** Runtime meta (loaded/syncing/notice/busy), not persisted. */
		const metaDecl = _client_runtime.defineStore({
			init: () => ({ loaded: false, syncing: false, notice: null, noticeError: false, busy: null, restartEpoch: 0 }),
			actions: {
				patch: (d, partial) => { Object.assign(d, partial); },
			},
		});

		const prefs = prefsDecl.create();
		const dataStore = dataDecl.create();
		const meta = metaDecl.create();

		function useStoreOf(handle) {
			return useSyncExternalStore(
				(cb) => handle.subscribe(cb),
				() => handle.getSnapshot(),
				() => handle.getSnapshot()
			);
		}
		const StoreCtx = react.createContext(null);

		//#endregion

		//#region server sync
		let saveTimer = null;
		let saveInFlight = null;
		let noticeTimer = null;
		let cacheTimer = null;
		/** localStorage 只是启动兜底：合并写入，避免大 state 反复同步序列化阻塞主线程。 */
		function cacheLocalData(state) {
			if (cacheTimer !== null) clearTimeout(cacheTimer);
			cacheTimer = setTimeout(() => {
				cacheTimer = null;
				try { localStorage.setItem("kidai-clipboard.data", JSON.stringify(state)); } catch {}
			}, 400);
		}
		function readLocalCache() {
			try {
				const raw = localStorage.getItem("kidai-clipboard.data");
				if (raw === null) return null;
				const parsed = JSON.parse(raw);
				return parsed !== null && typeof parsed === "object" && parsed.schema === 1 ? parsed : null;
			} catch {
				return null;
			}
		}
		function scheduleSave(state) {
			if (saveTimer !== null) clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				saveTimer = null;
				void flushSave(state);
			}, 500);
		}
		async function flushSave(state) {
			if (saveInFlight !== null) return saveInFlight;
			saveInFlight = fetch("/kidai-clipboard/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ state }),
			}).then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			}).catch((error) => {
				meta.actions.patch({ notice: "serverOffline", noticeError: true });
				throw error;
			}).finally(() => {
				saveInFlight = null;
			});
			return saveInFlight;
		}
		async function loadServerState() {
			try {
				const response = await fetch("/kidai-clipboard/state", { headers: { "Accept": "application/json" } });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const payload = await response.json();
				if (payload !== null && payload.ok === true && payload.state !== null && payload.state !== undefined) {
					dataStore.actions.set(payload.state);
					meta.actions.patch({ syncing: true });
					return true;
				}
				return false;
			} catch {
				const cached = readLocalCache();
				if (cached !== null) dataStore.actions.set(cached);
				meta.actions.patch({ notice: "serverOffline", noticeError: true });
				return false;
			}
		}
		function commitData(mutator) {
			dataStore.store.update((draft) => {
				mutator(draft);
				draft.updatedAt = now();
			});
			const snapshot = dataStore.getSnapshot();
			cacheLocalData(snapshot);
			scheduleSave(snapshot);
		}
		//#endregion

		//#region session-capture & input facade
		/** Resolve the composer input facade actions for one session id. */
		function inputActionsOf(ctx, sessionId) {
			if (typeof sessionId !== "string") return null;
			const actx = ctx.sessions.scope(sessionId);
			if (actx === null || actx === undefined) return null;
			const conversation = actx.get("conversation");
			if (conversation === null || conversation === undefined || conversation.input === null || conversation.input === undefined) return null;
			const shell = conversation.input.for(actx);
			if (shell === null || shell === undefined) return null;
			return { actions: shell.actions ?? null, state: shell.state ?? null };
		}
		/** Capture the composer draft of the current session into a new input entry. */
		function captureDraft(ctx, t) {
			const currentId = ctx.sessions.list.getSnapshot().current;
			if (typeof currentId !== "string") {
				notifyMeta("noCurrentSession");
				return false;
			}
			const facade = inputActionsOf(ctx, currentId);
			const draft = facade !== null && facade.state !== null
				? facade.state.getSnapshot().draft
				: "";
			const text = typeof draft === "string" ? draft : "";
			if (text.trim() === "") {
				notifyMeta("emptyDraft");
				return false;
			}
			commitData((d) => {
				d.entries.unshift({
					id: uid(),
					kind: "input",
					title: firstLine(text),
					text,
					session: null,
					folderId: null,
					tagIds: [],
					color: null,
					pinned: false,
					createdAt: now(),
					updatedAt: now(),
				});
			});
			notifyMeta("savedInput");
			return true;
		}
		/** Fetch full history of one session (follow + backwards page). */
		async function fetchSessionHistory(ctx, sessionId, signal, maxRecords = 6000) {
			const address = { kind: "session", sessionId };
			const records = [];
			let header = null;
			let projections = null;
			let hasMore = false;
			let cursor = -1;
			const max = maxRecords;
			let iter;
			try {
				iter = ctx.remote.session.follow({ address, maxMessages: 1000 }, signal);
				for await (const frame of iter) {
					if (frame !== null && frame !== undefined && frame.type === "snapshot") {
						header = frame.header ?? null;
						cursor = typeof frame.cursor === "number" ? frame.cursor : -1;
						hasMore = frame.hasMore === true;
						projections = frame.projections ?? null;
						const batch = frame.records ?? [];
						if (batch.length > 0) records.push(...batch);
						break;
					}
				}
			} catch (error) {
				throw error;
			}
			let guard = 0;
			while (hasMore === true && records.length < max && guard < 60) {
				guard += 1;
				let oldest = Number.MAX_SAFE_INTEGER;
				for (const record of records) oldest = Math.min(oldest, seqOf(record));
				if (oldest === Number.MAX_SAFE_INTEGER) break;
				const page = await ctx.remote.session.page({
					address,
					throughSeq: oldest - 1,
					maxMessages: 1000,
				}, signal);
				if (page === null || page === undefined || page.ok !== true) break;
				const batch = page.value !== null && page.value !== undefined ? (page.value.records ?? []) : [];
				if (batch.length === 0) break;
				records.unshift(...batch);
				hasMore = page.value.hasMore === true;
				cursor = Math.min(cursor, seqOf(batch[0]));
			}
			const slim = [];
			for (const record of records) {
				const value = slimRecord(record);
				if (value !== null) slim.push(value);
			}
			if (slim.length > max) slim.splice(0, slim.length - max);
			const messageCount = countMessages(slim);
			return {
				header,
				projections,
				lastSeq: cursor,
				records: slim,
				messageCount,
			};
		}
		/** 每页加载的会话事件数（向上翻页粒度）。 */
		const CAPTURE_PAGE = 1000;
		/** 选择器向上浏览的上限：独立于「保存上限」设置，否则长会话只能看到
		 * 最近几轮（用户反馈：设置的 1000 条正好卡在 ~41 轮）。 */
		const CAPTURE_SCAN_MAX = 20000;
		/** 槽位注册的统一入口：DSH 的槽位分 single/keyed/list/chain 四种，
		 * 选项不合法时 register 会直接抛错（chain 槽位必须给 options.select）。
		 * 这里兜住异常：任何单个入口注册失败只告警，绝不让整个插件 apply 崩掉
		 * ——否则其后的按钮/设置页全部丢失，甚至渲染器启动失败。 */
		function safeRegister(slots, options, Component) {
			try {
				return slots.register(options, Component);
			} catch (error) {
				try {
					console.warn("[kidai-clipboard] slot register failed: " + String(options.name) + " — " + String((error && error.message) || error));
				} catch {}
				return () => {};
			}
		}
		/** 拉一页会话事件：无 throughSeq → follow 取最新页；有则 page 取更早页。 */
		async function readCapturePage(ctx, address, older) {
			const slimOf = (list) => {
				const out = [];
				for (const record of list ?? []) {
					const value = slimRecord(record);
					if (value !== null) out.push(value);
				}
				return out;
			};
			if (older === null || older === undefined) {
				const iter = ctx.remote.session.follow({ address, maxMessages: CAPTURE_PAGE }, undefined);
				for await (const frame of iter) {
					if (frame !== null && frame !== undefined && frame.type === "snapshot") {
						return {
							records: slimOf(frame.records),
							header: frame.header ?? null,
							projections: frame.projections ?? null,
							cursor: typeof frame.cursor === "number" ? frame.cursor : -1,
							hasMore: frame.hasMore === true,
						};
					}
				}
				return null;
			}
			const page = await ctx.remote.session.page({ address, throughSeq: older.throughSeq, maxMessages: CAPTURE_PAGE }, undefined);
			if (page === null || page === undefined || page.ok !== true) return null;
			return { records: slimOf(page.value !== null && page.value !== undefined ? page.value.records : []), hasMore: page.value?.hasMore === true };
		}
		function oldestSeqOf(records) {
			let oldest = Number.MAX_SAFE_INTEGER;
			for (const record of records) if (typeof record.seq === "number") oldest = Math.min(oldest, record.seq);
			return oldest === Number.MAX_SAFE_INTEGER ? -1 : oldest;
		}
		function publishCapture(value) {
			meta.actions.patch({ capture: value });
		}
		/** 向上加载更早一页并前置到 pending.records（滚动栏懒加载）。 */
		async function loadOlderCapture(ctx, pending) {
			const current = pending ?? meta.getSnapshot().capture;
			if (current === null || current === undefined) return null;
			if (current.loading === true || current.hasMore !== true) return current;
			const scanMax = current.scanMax ?? CAPTURE_SCAN_MAX;
			if (current.records.length >= scanMax) {
				publishCapture({ ...current, hasMore: false, capped: true });
				return null;
			}
			publishCapture({ ...current, loading: true });
			const oldest = oldestSeqOf(current.records);
			if (oldest < 0) {
				publishCapture({ ...current, loading: false, hasMore: false });
				return null;
			}
			try {
				const page = await readCapturePage(ctx, current.address, { throughSeq: oldest - 1 });
				if (page === null) {
					publishCapture({ ...current, loading: false, hasMore: false });
					return null;
				}
				const merged = page.records.length > 0 ? [...page.records, ...current.records] : current.records;
				const capped = merged.length > scanMax ? merged.slice(merged.length - scanMax) : merged;
				const next = {
					...current,
					records: capped,
					marks: turnMarks(capped),
					loading: false,
					hasMore: page.hasMore === true && capped.length < scanMax,
					loadedPages: (current.loadedPages ?? 1) + 1,
				};
				publishCapture(next);
				return next;
			} catch (error) {
				publishCapture({ ...current, loading: false, hasMore: false, error: String((error && error.message) || error).slice(0, 160) });
				return null;
			}
		}
		/** 打开分支点选择器：先取最新一页立即显示，再在后台持续向上加载更早
		 * 的历史（用户滚动到顶部时也会手动触发加载）。 */
		async function beginCapture(ctx, t, sessionId, focusMessageId, focusTurn) {
			const list = ctx.sessions.list.getSnapshot();
			const targetId = typeof sessionId === "string" && sessionId !== "" ? sessionId : list.current;
			if (typeof targetId !== "string") {
				notifyMeta("noCurrentSession");
				return false;
			}
			publishCapture(null);
			notifyMeta("capturing");
			meta.actions.patch({ busy: "capture" });
			try {
				const ui = dataStore.getSnapshot().settings?.ui ?? {};
				const maxRecords = typeof ui.maxRecords === "number" && ui.maxRecords > 0 ? ui.maxRecords : 6000;
				const address = { kind: "session", sessionId: targetId };
				const first = await readCapturePage(ctx, address, null);
				if (first === null) {
					notifyMeta("capturedEmpty");
					return false;
				}
				const proj = first.projections ?? {};
				const title = proj.title !== null && proj.title !== undefined && proj.title !== ""
					? clip(String(proj.title), 120)
					: `会话 ${firstLine(String(first.header?.cwd ?? "")) || targetId.slice(0, 8)}`;
				const records = first.records.length > CAPTURE_SCAN_MAX ? first.records.slice(first.records.length - CAPTURE_SCAN_MAX) : first.records;
				const marks = turnMarks(records);
				const pending = {
					id: uid(),
					address,
					title,
					sessionId: targetId,
					focusMessageId: typeof focusMessageId === "string" && focusMessageId !== "" ? focusMessageId : null,
					focusTurn: typeof focusTurn === "number" ? focusTurn : null,
					agentPreset: proj.agentPreset !== null && proj.agentPreset !== undefined && proj.agentPreset !== "" ? String(proj.agentPreset) : null,
					cwd: typeof first.header?.cwd === "string" ? first.header.cwd : null,
					records,
					marks,
					lastSeq: typeof first.cursor === "number" ? first.cursor : -1,
					scanMax: CAPTURE_SCAN_MAX,
					saveMax: maxRecords,
					hasMore: first.hasMore === true && records.length < CAPTURE_SCAN_MAX,
					loading: false,
					loadedPages: 1,
					render: {
						includeTools: ui.includeTools !== false,
						includeHeaders: ui.includeHeaders !== false,
					},
				};
				// 没有可用的轮次边界（空会话、记录被裁剪）：保持原有行为原样保存。
				if (marks.length === 0) {
					meta.actions.patch({ busy: null });
					return saveCaptureEntry(ctx, pending, null);
				}
				// 只有一个已完成轮次且没有更早历史：无需选择，等价于「全部内容」。
				if (marks.length === 1 && pending.hasMore !== true) {
					meta.actions.patch({ busy: null });
					return saveCaptureEntry(ctx, pending, marks[0]);
				}
				publishCapture(pending);
				meta.actions.patch({ busy: null });
				// 后台继续向上加载，不阻塞弹窗显示。
				void (async () => {
					let guard = 0;
					while (guard < 60) {
						guard += 1;
						const snapshot = meta.getSnapshot().capture;
						if (snapshot === null || snapshot === undefined || snapshot.id !== pending.id) return;
						if (snapshot.hasMore !== true) return;
						const next = await loadOlderCapture(ctx, snapshot);
						if (next === null) return;
					}
				})();
				return true;
			} catch (error) {
				notifyMeta("captureFailed", { err: String((error && error.message) || error).slice(0, 200) });
				return false;
			} finally {
				meta.actions.patch({ busy: null });
			}
		}
		/** Store one capture at its chosen branch point (null = whole history).
		 * `atSeq` is the inclusive `turn/end` seq, so a later fork lands exactly
		 * at the end of that turn. Remaining older pages are loaded first so the
		 * stored transcript stays complete even when the user saves early. */
		async function saveCaptureEntry(ctx, pending, mark) {
			let current = pending;
			let guard = 0;
			while (current !== null && current !== undefined && current.hasMore === true && guard < 60) {
				guard += 1;
				const next = await loadOlderCapture(ctx, current);
				if (next === null) break;
				current = next;
			}
			if (current === null || current === undefined) return false;
			const chosen = mark === null || mark === undefined ? null : mark;
			const history = {
				records: current.records,
				messageCount: countMessages(current.records),
				lastSeq: typeof current.lastSeq === "number" ? current.lastSeq : -1,
			};
			const sliced = chosen === null ? history : sliceHistoryToTurn(history, chosen.seq);
			// 转录按完整的截断结果渲染；records 的存储受「保存上限」设置约束
			// （超出时保留靠近分支点的尾部），分支点 atSeq 与 fork 不受影响。
			const transcript = renderTranscript(sliced.records, sliced.messageCount, current.render);
			const saveMax = typeof current.saveMax === "number" && current.saveMax > 0 ? current.saveMax : 6000;
			const storedRecords = sliced.records.length > saveMax ? sliced.records.slice(sliced.records.length - saveMax) : sliced.records;
			const trimmed = sliced.records.length - storedRecords.length;
			const totalTurns = current.marks.length;
			const turnCount = chosen === null ? null : chosen.turn;
			commitData((d) => {
				d.entries.unshift({
					id: uid(),
					kind: "session",
					title: current.title,
					text: null,
					session: {
						sessionId: current.sessionId,
						capturedAt: now(),
						lastSeq: typeof sliced.lastSeq === "number" ? sliced.lastSeq : 0,
						atSeq: chosen === null ? null : chosen.seq,
						turnCount,
						totalTurns,
						messageCount: sliced.messageCount,
						chars: transcript.length,
						title: current.title,
						agentPreset: current.agentPreset,
						cwd: current.cwd,
						records: storedRecords,
						transcript,
					},
					folderId: null,
					tagIds: [],
					color: null,
					pinned: false,
					createdAt: now(),
					updatedAt: now(),
				});
			});
			meta.actions.patch({ capture: null });
			if (trimmed > 0) notifyMeta("capturedTrimmed", { n: trimmed });
			else if (turnCount !== null && totalTurns > turnCount) notifyMeta("capturedAtTurn", { n: turnCount, k: sliced.messageCount });
			else notifyMeta(sliced.messageCount > 0 ? "captured" : "capturedEmpty", { n: sliced.messageCount });
			return true;
		}
		/** Continue from a saved snapshot: fork at the saved seq into a NEW
		 * session (inheriting the full prior context). If the original session
		 * is gone or the fork fails, fall back to a blank session with the
		 * whole transcript pre-filled in the composer — the user just hits send. */
		async function continueSession(ctx, t, entry) {
			const session = entry.session;
			if (session === null || session === undefined || session.sessionId === undefined) {
				notifyMeta("continueFailed", { err: "missing session id" });
				return false;
			}
			meta.actions.patch({ busy: "continue" });
			try {
				// 带分支点 fork；若分支点不可用（该轮未完成/会话状态变化），
				// 自动降级为不传 atSeq（DSH 语义 = 从最后一个已完成轮次分支）。
				// 锚点优先取捕获时选定的轮次边界 atSeq，旧快照回退 lastSeq。
				const anchor = typeof session.atSeq === "number" && session.atSeq >= 0
					? session.atSeq
					: (typeof session.lastSeq === "number" && session.lastSeq >= 0 ? session.lastSeq : undefined);
				let lastError = null;
				const attempts = [
					{
						sessionId: session.sessionId,
						...(anchor === undefined ? {} : { atSeq: anchor }),
						increaseTitle: true,
					},
					{ sessionId: session.sessionId, increaseTitle: true },
				];
				let childId = null;
				for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
					const opts = attempts[attemptIndex];
					try {
						childId = await ctx.sessions.fork(opts);
						break;
					} catch (forkError) {
						lastError = forkError;
						// 第二次尝试已不带 atSeq；若仍失败则跳出
						if (attemptIndex === attempts.length - 1) throw forkError;
					}
				}
				if (typeof childId === "string") {
					ctx.sessions.open(childId);
					notifyMeta("continued");
					return true;
				}
				throw lastError ?? new Error("fork returned no child session");
			} catch (error) {
				// Fallback: full-transcript preset into the composer of a new session.
				try {
					const transcript = session.transcript ?? "";
					const current = ctx.sessions.list.getSnapshot().current;
					if (typeof current === "string") {
						pasteToComposer(ctx, t, transcript, notifyMeta);
						notifyMeta("continueFailed", { err: `原会话不可用（${String((error && error.message) || error).slice(0, 200)}），已将完整上下文粘贴到当前输入框，直接发送即可继续。` });
						return false;
					}
					await ctx.sessions.create({});
					const created = ctx.sessions.list.getSnapshot().current;
					if (typeof created === "string") {
						pasteToComposer(ctx, t, transcript, notifyMeta);
						notifyMeta("continued");
						return true;
					}
				} catch (fallbackError) {
					// fall through to the failure notice below
				}
				notifyMeta("continueFailed", { err: String((error && error.message) || error).slice(0, 200) });
				return false;
			} finally {
				meta.actions.patch({ busy: null });
			}
		}
		/** Paste text into the current session's composer draft. */
		function pasteToComposer(ctx, t, text, notify) {
			const currentId = ctx.sessions.list.getSnapshot().current;
			if (typeof currentId !== "string") {
				notify("pasteNoSession");
				return false;
			}
			const facade = inputActionsOf(ctx, currentId);
			if (facade === null || facade.actions === null || facade.actions.setDraft === undefined) {
				notify("pasteNoSession");
				return false;
			}
			facade.actions.setDraft(text);
			notify("pasted");
			return true;
		}
		//#endregion

		//#region components
		function AppCtxProvider({ value, children }) {
			// Reactivity hub: subscribe once at the provider root so every
			// consumer sees a fresh, live `data` snapshot; context identity
			// itself never changes, and only data mutations re-render.
			const snapshot = react.useSyncExternalStore(
				(cb) => dataStore.subscribe(cb),
				() => dataStore.getSnapshot(),
				() => dataStore.getSnapshot()
			);
			const provide = react.useMemo(() => ({ ...value, app: { ...value.app, data: snapshot } }), [value, snapshot]);
			return jx(StoreCtx.Provider, { value: provide, children });
		}

		/** Render boundary for the floating window: a crash never takes the page down. */
		class OverlayBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error) {
				console.error("[kidai-clipboard] overlay crashed:", (error && error.message) || error);
			}
			render() {
				if (this.state.error !== null) {
					// 崩溃不再静默消失：给出可恢复的占位（点击重试重建窗口）
					return jx("div", { className: "kidc_crashFallback", children: [
						jx("div", { className: "kidc_crashText", children: String((this.state.error && this.state.error.message) || this.state.error).slice(0, 160) }),
						jx("button", { type: "button", className: "kidc_crashBtn", onClick: () => { this.setState({ error: null }); }, children: "重试 / Retry" }),
					] });
				}
				return jx(AppCtxProvider, { value: this.props.provide, children: this.props.children });
			}
		}
		/** Module-level notify: always available regardless of context wiring. */
		function notifyMeta(key, params) {
			meta.actions.patch({ notice: key, noticeError: key === "serverOffline" || key === "captureFailed" || key === "continueFailed" || key === "copyFailed" || key === "pasteNoSession" });
			if (noticeTimer !== null) clearTimeout(noticeTimer);
			noticeTimer = setTimeout(() => meta.actions.patch({ notice: null }), 3200);
			if (params !== null && params !== undefined) void params;
		}
		function useApp() {
			// Never null: resolve the live data snapshot directly from the store
			// whenever context is absent, and keep `data` a reactive snapshot
			// even when the provider path breaks (slot-engine re-renders etc.).
			const value = react.useContext(StoreCtx);
			const snapshot = react.useSyncExternalStore(
				(cb) => dataStore.subscribe(cb),
				() => dataStore.getSnapshot(),
				() => dataStore.getSnapshot()
			);
			return react.useMemo(() => ({
				...(value ?? {}),
				app: { ...(value?.app ?? {}), data: snapshot, notify: notifyMeta },
			}), [value, snapshot]);
		}
		function usePrefs() {
			return useStoreOf(prefs);
		}
		function useData() {
			return useStoreOf(dataStore);
		}
		function useMeta() {
			return useStoreOf(meta);
		}

		function Notice({ t }) {
			const m = useMeta();
			if (m.notice === null || m.notice === undefined) return null;
			return jx("div", { className: "kidc_notice", "data-error": m.noticeError === true, children: t(m.notice) });
		}

		function ColorSwatch({ color, active, onClick }) {
			return jx("button", {
				type: "button",
				className: "kidc_swatch",
				style: color === null || color === undefined || color === "" ? undefined : { background: color },
				"data-active": active === true,
				"data-none": color === null || color === undefined || color === "",
				onClick,
			});
		}

		function TagChips({ t, value, onChange }) {
			// useApp() 返回 { app: { data, notify, ... }, ... }——顶层无 data，必须经 app.data
			const appView = useApp();
			const data = appView?.app?.data ?? { tags: [] };
			if (data.tags.length === 0) return jx("span", { className: "kidc_metaText", children: t("tags") });
			return jxs("div", {
				className: "kidc_tagPicker",
				children: data.tags.map((tag) => {
					const active = Array.isArray(value) && value.indexOf(tag.id) >= 0;
					return jxs("button", {
						type: "button",
						key: tag.id,
						className: "kidc_chip",
						"data-active": active,
						onClick: () => {
							const next = Array.isArray(value) ? value.slice() : [];
							const index = next.indexOf(tag.id);
							if (index >= 0) next.splice(index, 1);
							else next.push(tag.id);
							onChange(next);
						},
						children: [
							tag.color !== null && tag.color !== undefined && tag.color !== "" ? jx("span", { className: "kidc_dot", style: { background: tag.color } }) : null,
							tag.name,
						],
					});
				}),
			});
		}

		/** 列表排序：置顶优先 → 手动排序（order）→ 最近更新。 */
		function compareEntries(a, b) {
			if (a.pinned !== b.pinned) return a.pinned === true ? -1 : 1;
			const ao = typeof a.order === "number" && Number.isFinite(a.order) ? a.order : null;
			const bo = typeof b.order === "number" && Number.isFinite(b.order) ? b.order : null;
			if (ao !== null && bo !== null && ao !== bo) return ao - bo;
			if (ao !== null && bo === null) return -1;
			if (ao === null && bo !== null) return 1;
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		}

		function EntryCard({ t, entry, ctx, onDropBeside }) {
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const prefsState = usePrefs();
			// 拖动到本条目的上半/下半 → 插到它前面/后面（"Before"/"After"/null）
			const [dropSide, setDropSide] = useState(null);
			const folder = data.folders.find((f) => f.id === entry.folderId) ?? null;
			const snippet = snippetOf(entry);
			const msgCount = entry.kind === "session" && entry.session !== null && entry.session !== undefined ? entry.session.messageCount : 0;
			const selected = prefsState.selected.indexOf(entry.id) >= 0;
			const text = entry.kind === "input" ? entry.text ?? "" : "";
			const expanded = entry.kind === "input" && prefsState.expandedIds.indexOf(entry.id) >= 0;
			const pasteNow = () => {
				const copyText = entry.kind === "input" ? text : (entry.session !== null && entry.session !== undefined ? entry.session.transcript ?? "" : "");
				if (typeof _primitives.writeClipboard === "function") {
					_primitives.writeClipboard(copyText).then(() => app.notify("copied")).catch(() => {});
				} else {
					navigator.clipboard?.writeText?.(copyText).then(() => app.notify("copied")).catch(() => {});
				}
			};
			const pasteComposer = () => {
				const sendText = entry.kind === "input" ? text : (entry.session !== null && entry.session !== undefined ? entry.session.transcript ?? "" : "");
				pasteToComposer(ctx, t, sendText, app.notify);
			};
			const continueNow = () => {
				void continueSession(ctx, t, entry);
			};
			const openSession = () => {
				prefsActions.patch({ sessionModal: entry.id });
			};
			const toggleSelected = () => prefsActions.toggleSelect(entry.id);
			const toggleExpand = () => prefsActions.toggleExpanded(entry.id);
			const onCardClick = prefsState.selectMode === true
				? toggleSelected
				: entry.kind === "input"
					? toggleExpand
					: openSession;
			return jxs("div", {
				className: "kidc_card" + (dropSide !== null ? " kidc_drop" + dropSide : ""),
				"data-selected": selected,
				// 原生拖拽：拖到文件夹行＝移入；拖到条目上＝插到它前/后（并归入它的文件夹）；
				// 拖到列表空白＝移出。多选模式下不启用，避免与多选冲突。
				draggable: prefsState.selectMode !== true,
				title: prefsState.selectMode !== true ? t("dragHint") : undefined,
				onDragStart: (e) => {
					try {
						e.dataTransfer.setData("text/plain", entry.id);
						e.dataTransfer.effectAllowed = "move";
					} catch { /* noop */ }
				},
				onDragOver: (e) => {
					e.preventDefault();
					e.stopPropagation();
					let side = "After";
					try {
						const rect = e.currentTarget.getBoundingClientRect();
						side = e.clientY < rect.top + rect.height / 2 ? "Before" : "After";
					} catch { /* noop */ }
					if (dropSide !== side) setDropSide(side);
				},
				onDragLeave: (e) => {
					e.stopPropagation();
					setDropSide(null);
				},
				onDrop: (e) => {
					e.preventDefault();
					e.stopPropagation();
					const side = dropSide;
					setDropSide(null);
					let id = "";
					try { id = e.dataTransfer.getData("text/plain"); } catch { /* noop */ }
					if (id !== "" && id !== entry.id && typeof onDropBeside === "function") onDropBeside(id, entry.id, side !== "After");
				},
				onClick: onCardClick,
				children: [
					jxs("div", { className: "kidc_cardRow", children: [
						prefsState.selectMode === true ? jx("button", {
							type: "button",
							className: "kidc_checkbox",
							"data-checked": selected,
							onClick: (e) => { e.stopPropagation(); toggleSelected(); },
							children: selected === true ? jx(_primitives.IconCheckOutline14, { size: 12 }) : null,
						}) : null,
						entry.kind === "input" ? jx("span", {
							className: "kidc_chevron",
							"data-open": expanded,
							children: jx(_primitives.IconTriangleRightFill14, { size: 10 }),
						}) : null,
						entry.color !== null && entry.color !== undefined && entry.color !== "" ? jx("span", { className: "kidc_dot", style: { background: entry.color } }) : null,
						jx("span", { className: "kidc_badge", children: entry.kind === "session" ? t("sessionBadge") : t("inputBadge") }),
						jx("span", { className: "kidc_cardTitle", children: entry.title !== "" ? entry.title : "…" }),
					]}),
					entry.kind === "input"
						? (expanded === true
							? jx("div", { className: "kidc_fullText", onClick: (e) => e.stopPropagation(), children: text !== "" ? text : "…" })
							: (snippet !== "" ? jx("div", { className: "kidc_snippet kidc_previewLine", children: clip(snippet.replace(/\s+/g, " "), 88) }) : null))
						: (snippet !== "" ? jx("div", { className: "kidc_snippet", children: clip(snippet.replace(/\s+/g, " "), 160) }) : null),
					jxs("div", { className: "kidc_cardMeta", children: [
						folder !== null ? jxs("span", { className: "kidc_metaText", children: [folder.color !== null && folder.color !== undefined && folder.color !== "" ? jx("span", { className: "kidc_dot", style: { background: folder.color } }) : null, folder.name] }) : null,
						entry.kind === "session" ? jx("span", { className: "kidc_metaText", children: t("msgCount", { n: msgCount }) }) : null,
						entry.kind === "input" ? jx("span", { className: "kidc_metaText", children: String(text.length) }) : null,
						jx("span", { className: "kidc_metaText", children: relLabel(entry.updatedAt, t) }),
						entry.pinned === true ? jx("span", { className: "kidc_metaText", children: "📌" }) : null,
					]}),
					prefsState.selectMode !== true ? jxs("div", { className: "kidc_actions", onClick: (e) => e.stopPropagation(), children: entry.kind === "input"
						? [
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("edit"), onClick: (e) => { e.stopPropagation(); prefsActions.patch({ editorVisible: true, editor: entry.id }); }, children: jx(_primitives.IconEditOutline16, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("copy"), onClick: pasteNow, children: jx(_primitives.IconCopyOutline16, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("paste"), onClick: pasteComposer, children: jx(_primitives.IconSendOutline16, { size: 13 }) }),
						]
						: [
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("continue_"), onClick: continueNow, children: jx(_primitives.IconBranchOutline16, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("copy"), onClick: pasteNow, children: jx(_primitives.IconCopyOutline16, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("openSession"), onClick: openSession, children: jx(_primitives.IconInspectOutline12, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("delete"), onClick: () => prefsActions.patch({ confirm: { ids: [entry.id] } }), children: jx(_primitives.IconTrashOutline16, { size: 13 }) }),
						]}) : null,
				],
			});
		}

		function EntryList({ t, ctx }) {
			const app = useApp();
			const data = useData();
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const query = prefsState.query.trim().toLowerCase();
			const entries = useMemo(() => {
				let list = data.entries.slice();
				if (prefsState.tab === "input") list = list.filter((e) => e.kind === "input");
				if (prefsState.tab === "session") list = list.filter((e) => e.kind === "session");
				if (prefsState.tag !== "all") list = list.filter((e) => Array.isArray(e.tagIds) && e.tagIds.indexOf(prefsState.tag) >= 0);
				if (query !== "") list = list.filter((e) => (String(e.title ?? "") + " " + String(e.text ?? "") + " " + String(e.session?.transcript ?? "")).toLowerCase().indexOf(query) >= 0);
				return list.sort(compareEntries);
			}, [data, prefsState.tab, prefsState.tag, query]);
			// 拖拽移动目标：文件夹 id / "loose"（列表空白＝移出文件夹）/ null
			const [over, setOver] = useState(null);
			const moveToFolder = (entryId, folderId) => {
				commitData((d) => {
					const target = d.entries.find((e) => e.id === entryId);
					if (target === null || target === undefined) return;
					target.folderId = folderId;
					target.updatedAt = now();
				});
				const folder = folderId !== null ? data.folders.find((f) => f.id === folderId) : null;
				if (folder !== null && folder !== undefined) app.notify("savedToFolder", { name: folder.name });
				else app.notify("movedToLoose");
			};
			/** 把条目插到目标条目之前/之后：同容器内重排 order，并归入目标所在的文件夹。 */
			const moveEntryBeside = (draggedId, targetId, before) => {
				let ok = false;
				commitData((d) => {
					const dragged = d.entries.find((e) => e.id === draggedId);
					const target = d.entries.find((e) => e.id === targetId);
					if (dragged === null || dragged === undefined || target === null || target === undefined) return;
					const folderId = target.folderId ?? null;
					dragged.folderId = folderId;
					dragged.updatedAt = now();
					// 取同容器的兄弟（不含自己）、按当前显示顺序排好，再插到目标前/后，最后重编 order
					const siblings = d.entries
						.filter((e) => e.id !== draggedId)
						.filter((e) => (e.folderId ?? null) === folderId)
						.sort(compareEntries);
					const at = siblings.findIndex((e) => e.id === targetId);
					const insertAt = at < 0 ? siblings.length : (before === true ? at : at + 1);
					siblings.splice(insertAt, 0, dragged);
					siblings.forEach((e, i) => { e.order = i; });
					ok = true;
				});
				if (ok) app.notify("reordered");
			};
			if (entries.length === 0) {
				return jx("div", {
					className: "kidc_empty",
					children: (data.entries.length === 0 ? t("emptyAll") : t("emptyFilter")),
				});
			}
			// Obsidian 风格文件夹树：有 folderId 的条目归入对应文件夹组（可展开/收起），
			// 无 folderId 的条目直接平铺在"未分类"区。文件夹组按名称排序。
			const folderGroups = [];
			const loose = [];
			for (const entry of entries) {
				if (entry.folderId !== null && entry.folderId !== undefined) {
					const holder = folderGroups.find((g) => g.id === entry.folderId);
					if (holder !== undefined) holder.items.push(entry);
					else folderGroups.push({ id: entry.folderId, items: [entry] });
				} else {
					loose.push(entry);
				}
			}
			// 组排序：按文件夹列表顺序（stable），无文件夹条目最后
			const folderOrder = new Map(data.folders.map((f) => [f.id, f]));
			folderGroups.sort((a, b) => {
				const fa = folderOrder.get(a.id);
				const fb = folderOrder.get(b.id);
				return String(fa?.name ?? "").localeCompare(String(fb?.name ?? ""));
			});
			return jxs("div", {
				className: "kidc_list kidc_treeList" + (over === "loose" ? " kidc_dropActive" : ""),
				onDragOver: (e) => { e.preventDefault(); if (over !== "loose") setOver("loose"); },
				onDragLeave: () => setOver((prev) => (prev === "loose" ? null : prev)),
				onDrop: (e) => {
					e.preventDefault();
					let id = "";
					try { id = e.dataTransfer.getData("text/plain"); } catch { /* noop */ }
					setOver(null);
					if (id !== "") moveToFolder(id, null);
				},
				children: [
				folderGroups.map((group) => {
					const folder = folderOrder.get(group.id);
					const expanded = prefsState.expandedIds.indexOf(group.id) >= 0;
					return jxs("div", { key: "grp-" + group.id, className: "kidc_treeGroup", children: [
						jxs("div", {
							className: "kidc_treeHeadRow" + (over === group.id ? " kidc_dropActive" : ""),
							onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (over !== group.id) setOver(group.id); },
							onDragLeave: (e) => { e.stopPropagation(); setOver((prev) => (prev === group.id ? null : prev)); },
							onDrop: (e) => {
								e.preventDefault();
								e.stopPropagation();
								let id = "";
								try { id = e.dataTransfer.getData("text/plain"); } catch { /* noop */ }
								setOver(null);
								if (id !== "") moveToFolder(id, group.id);
							},
							children: [
								jxs("button", {
									type: "button",
									className: "kidc_treeHead",
									onClick: () => prefsActions.toggleExpanded(group.id),
									children: [
										jx("span", { className: "kidc_treeChevron" + (expanded ? " kidc_treeChevronOpen" : ""), children: "▸" }),
										folder !== undefined && folder !== null ? jx("span", { className: "kidc_dot", style: { background: folder.color ?? "#8c8c8c" } }) : null,
										jx("span", { className: "kidc_treeName", children: folder !== undefined && folder !== null ? folder.name : t("noFolder") }),
										jx("span", { className: "kidc_count", children: String(group.items.length) }),
									],
								}),
								jx("button", {
									type: "button",
									className: "kidc_iconBtn kidc_treeEdit",
									title: t("editFolder"),
									onClick: (e) => { e.stopPropagation(); prefsActions.patch({ folderEditor: group.id }); },
									children: jx(_primitives.IconEditOutline16, { size: 12 }),
								}),
							],
						}),
						expanded === true
							? jxs("div", { className: "kidc_treeItems", children: group.items.map((entry) => jx(EntryCard, { key: entry.id, entry, t, ctx, onDropBeside: moveEntryBeside })) })
							: null,
					] });
				}),
				loose.map((entry) => jx(EntryCard, { key: entry.id, entry, t, ctx, onDropBeside: moveEntryBeside })),
			] });
		}

		function WindowHeader({ t, ctx, collapsed }) {
			const app = useApp();
			const data = useData();
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const drag = useRef(null);
			const frameRef = useRef(0);
			const onPointerDown = (e) => {
				if (e.button !== 0) return;
				// 按在标题栏的按钮（收起/多选/关闭）上时不启动拖动：否则 pointerdown
				// 会冒泡到这里，手抖几像素就把窗口拖走了，收起键会显得"不好用"。
				try {
					const target = e.target;
					if (target !== null && target !== undefined && typeof target.closest === "function" && target.closest("button") !== null) return;
				} catch { /* noop */ }
				e.preventDefault();
				const headerEl = e.currentTarget;
				const rootEl = typeof headerEl.closest === "function" ? headerEl.closest(".kidc_root") : null;
				liveResize.rootEl = rootEl;
				if (rootEl !== null && rootEl !== undefined) rootEl.classList.add("kidc_resizing");
				const hideShield = showDragShield("grabbing");
				const win = data.settings?.window ?? null;
				const startX = e.clientX;
				const startY = e.clientY;
				// 拖动基准必须是**面板此刻的实际位置**：停靠时面板由 right/top 定位，
				// settings.window.x/y 只是陈旧的浮动坐标（例如 800/225），拿它当基准
				// 一拖就会跳走 —— 这就是"拖着转一下位置就乱"的原因。停靠/浮动一视同仁。
				const rect = rootEl !== null && rootEl !== undefined && typeof rootEl.getBoundingClientRect === "function"
					? rootEl.getBoundingClientRect()
					: null;
				const hasRect = rect !== null && rect.width > 0 && rect.height > 0;
				const baseX = hasRect ? Math.round(rect.left) : (win !== null && win !== undefined && typeof win.x === "number" ? win.x : 24);
				const baseY = hasRect ? Math.round(rect.top) : (win !== null && win !== undefined && typeof win.y === "number" ? win.y : 96);
				const baseW = hasRect ? Math.round(rect.width) : (win !== null && win !== undefined && typeof win.width === "number" ? win.width : 360);
				const baseH = hasRect ? Math.round(rect.height) : (win !== null && win !== undefined && typeof win.height === "number" ? win.height : 560);
				// 拖动中会从停靠形态切到浮动形态：用当前实际宽高渲染并落库，避免尺寸跳变
				if (hasRect) {
					liveResize.width = baseW;
					liveResize.height = baseH;
				}
				const vw0 = typeof window !== "undefined" ? window.innerWidth : 1280;
				const isDocked = win !== null && win !== undefined && win.dock === "right";
				// 停靠形态锚点：拖动没离开吸附区时原样保持（贴右缘距离 / 顶部 / 宽高）
				const dockRight = hasRect && isDocked === true ? Math.max(0, vw0 - Math.round(rect.right)) : null;
				drag.current = {
					startX, startY, baseX, baseY, moved: false, id: e.pointerId,
					lastX: baseX, lastY: baseY, lastDock: null, lastW: baseW, lastH: baseH,
					dockRight, dockTop: baseY, dockW: baseW, dockH: baseH,
				};
				const cancelFrame = () => {
					if (frameRef.current === 0) return;
					try {
						if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRef.current);
						else clearTimeout(frameRef.current);
					} catch { /* noop */ }
					frameRef.current = 0;
				};
				// 拖动期间只改 DOM（每帧最多一次），不写 store —— 之前每帧 commit 会深拷贝
				// 整个 state、序列化写 localStorage 并排队 PUT，拖起来才卡。
				const paint = () => {
					frameRef.current = 0;
					const d = drag.current;
					if (d === null) return;
					const el = liveResize.rootEl;
					if (el === null || el === undefined) return;
					// 拖动期间一律跟手（含吸附区内）：手感自然，靠边松手时再回弹归位
					el.style.right = "auto";
					el.style.left = d.lastX + "px";
					el.style.top = d.lastY + "px";
					el.style.width = d.lastW + "px";
					// 高度钉在起始实际高度：否则从停靠形态拖出时高度仍是"停靠到底"的值
					if (typeof d.lastH === "number" && Number.isFinite(d.lastH)) el.style.height = d.lastH + "px";
				};
				const schedule = () => {
					if (frameRef.current !== 0) return;
					try {
						frameRef.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : setTimeout(paint, 16);
					} catch {
						frameRef.current = 0;
						paint();
					}
				};
				const onMove = (ev) => {
					const d = drag.current;
					if (d === null) return;
					const dx = ev.clientX - d.startX;
					const dy = ev.clientY - d.startY;
					if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
					d.moved = true;
					const winW = data.settings?.window?.width;
					const panelW = collapsed === true ? 140 : (typeof winW === "number" && Number.isFinite(winW) ? winW : 360);
					const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
					const vh = typeof window !== "undefined" ? window.innerHeight : 720;
					const maxX = Math.max(0, vw - panelW - 8);
					const maxY = Math.max(0, vh - 60);
					// PS 风格吸附：仅窗口右缘（右停靠）
					let x = Math.max(0, Math.min(maxX, d.baseX + dx));
					const y = Math.max(0, Math.min(maxY, d.baseY + dy));
					let dock = null;
					const SNAP = 32;
					if (x + panelW >= vw - SNAP) {
						dock = "right";
						x = vw - panelW - 8;
					}
					d.lastX = x;
					d.lastY = y;
					d.lastDock = dock;
					// 拖动期间一律跟手（含吸附区内）：实时位置写进 liveResize，任何一次
					// 重渲染都不会把面板弹回旧坐标；store 等松手再写。
					liveResize.x = x;
					liveResize.y = y;
					schedule();
				};
				const onUp = () => {
					const d = drag.current;
					drag.current = null;
					cancelFrame();
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					window.removeEventListener("pointercancel", onUp);
					const el = liveResize.rootEl;
					if (el !== null && el !== undefined) el.classList.remove("kidc_resizing");
					hideShield();
					// 靠边回弹：拖动期间是跟手的，松手时若判定为停靠，就用一次过渡把面板
					// 平滑滑到停靠位（贴右缘 8px、顶到会话区上沿、高度到底），随后交给
					// React 的停靠样式接管。原本停靠时这一步几乎就是原处微调；从浮动拖到
					// 边缘时则变成"滑入停靠"，不再闪现。
					if (d !== null && d.moved === true && d.lastDock === "right" && el !== null && el !== undefined) {
						try {
							const geom = measureDock();
							const vh2 = typeof window !== "undefined" ? window.innerHeight : 720;
							const targetTop = geom !== null ? Math.max(0, Math.round(geom.top)) : 0;
							const targetH = geom !== null ? Math.max(200, Math.round(geom.bottom - targetTop)) : vh2;
							el.classList.add("kidc_snapBack");
							el.style.left = "auto";
							el.style.right = "8px";
							el.style.top = targetTop + "px";
							el.style.width = d.lastW + "px";
							el.style.height = targetH + "px";
							const target = el;
							setTimeout(() => {
								try { target.classList.remove("kidc_snapBack"); } catch { /* noop */ }
							}, 240);
						} catch { /* noop */ }
					}
					// 松手才落库一次（含吸附判定结果）
					if (d !== null && d.moved === true) commitWindow(d.lastX, d.lastY, d.lastDock, d.lastW, d.lastH);
					liveResize.rootEl = null;
					liveResize.x = null;
					liveResize.y = null;
					liveResize.width = null;
					liveResize.height = null;
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
				window.addEventListener("pointercancel", onUp);
			};
			const commitWindow = (x, y, dock, widthValue, heightValue) => {
				commitData((d) => {
					const current = d.settings.window ?? {};
					d.settings.window = {
						x: Math.round(x),
						y: Math.round(y),
						expanded: current.expanded !== false,
						// 拖动时带上实际宽高（从停靠形态拖出后，浮动尺寸应与拖动中的视觉一致）
						width: typeof widthValue === "number" && Number.isFinite(widthValue)
							? Math.round(widthValue)
							: (typeof current.width === "number" && Number.isFinite(current.width) ? current.width : 360),
						height: typeof heightValue === "number" && Number.isFinite(heightValue)
							? Math.round(heightValue)
							: (typeof current.height === "number" && Number.isFinite(current.height) ? current.height : Math.min(560, (typeof window !== "undefined" ? window.innerHeight : 720) - 32)),
						...(dock !== null ? { dock } : { dock: null }),
					};
				});
			};
			const count = data.entries.length;
			const selectMode = prefsState.selectMode === true;
			return jxs("div", {
				className: "kidc_header",
				onPointerDown,
				title: t("edgeHint"),
				children: [
					jx("span", { className: "kidc_brand", children: "📋" }),
					jx("span", { className: "kidc_title", children: t("title") }),
					jx("span", { className: "kidc_count", children: t("total", { n: count }) }),
					jx("button", {
						type: "button",
						className: "kidc_iconBtn kidc_headerCollapse",
						title: t("collapse"),
						onClick: (e) => { e.stopPropagation(); prefsActions.patch({ collapsed: true }); },
						children: jx(_primitives.IconChevronRightOutline14, { size: 14 }),
					}),
					jx("button", {
						type: "button",
						className: "kidc_iconBtn",
						title: selectMode === true ? t("exitSelect") : t("selectMode"),
						"data-active": selectMode,
						onClick: (e) => {
							e.stopPropagation();
							prefsActions.patch({ selectMode: !selectMode, selected: [] });
						},
						children: selectMode === true ? jx(_primitives.IconCheckOutline16, { size: 14 }) : jx(_primitives.IconChecklistOutline14, { size: 14 }),
					}),
					jx("button", {
						type: "button",
						className: "kidc_iconBtn",
						title: t("close"),
						onClick: (e) => { e.stopPropagation(); prefsActions.patch({ open: false }); },
						children: jx(_primitives.IconCloseOutline16, { size: 14 }),
					}),
				],
			});
		}

		function Toolbar({ t }) {
			const app = useApp();
			const data = useData();
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const selected = prefsState.selected;
			const [armed, setArmed] = useState(false);
			useEffect(() => {
				if (armed === true) {
					const timer = setTimeout(() => setArmed(false), 3000);
					return () => clearTimeout(timer);
				}
			}, [armed]);
			const selectable = data.entries.filter((e) => {
				if (prefsState.tab === "input" && e.kind !== "input") return false;
				if (prefsState.tab === "session" && e.kind !== "session") return false;
				return true;
			});
			const allSelected = selectable.length > 0 && selectable.every((e) => selected.indexOf(e.id) >= 0);
			const batchDelete = () => {
				if (selected.length === 0) {
					setArmed(false);
					return;
				}
				// 批量删除需点两次：第一次进入待确认，第二次真正删除。
				if (armed !== true) {
					setArmed(true);
					return;
				}
				const count = selected.length;
				commitData((d) => {
					d.entries = d.entries.filter((e) => selected.indexOf(e.id) < 0);
				});
				setArmed(false);
				prefsActions.patch({ selected: [], selectMode: false });
				app.notify("deleted", { n: count });
			};
			const exitSelectMode = () => {
				setArmed(false);
				prefsActions.patch({ selectMode: false, selected: [] });
			};
			return jxs("div", {
				className: "kidc_toolbar",
				children: [
					prefsState.selectMode === true
						? [
							jx("button", {
								type: "button",
								className: "kidc_ghost",
								"data-active": allSelected,
								onClick: () => prefsActions.setSelected(allSelected ? [] : selectable.map((e) => e.id)),
								children: t("selectAll"),
							}),
							jx("span", { className: "kidc_toolText", children: String(selected.length) }),
							jx("button", {
								type: "button",
								className: "kidc_ghost kidc_danger",
								"data-active": armed === true,
								onClick: batchDelete,
								children: armed === true ? t("deleteSelectedConfirm", { n: selected.length }) : t("deleteSelected", { n: selected.length }),
							}),
							jx("button", {
								type: "button",
								className: "kidc_ghost",
								onClick: exitSelectMode,
								children: [jx(_primitives.IconCheckOutline16, { size: 13 }), t("exitSelect")],
							}),
						]
						: [
							jx("span", { className: "kidc_spacer" }),
						],
				],
			});
		}

		function ClipboardPanel({ t, ctx }) {
			const app = useApp();
			const data = useData();
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const counts = {
				input: data.entries.filter((e) => e.kind === "input").length,
				session: data.entries.filter((e) => e.kind === "session").length,
			};
			const tabs = [
				["input", t("inputs")],
				["session", t("sessions")],
			];
			// 操作按钮（新建输入 / 保存快照 / 抓取输入）：默认排底部一行，也可排成面板
			// 左侧的竖栏（底部常被其它插件的浮层遮挡时更保险）。
			const sideActions = data.settings?.ui?.actionBar === "left";
			const actionButtons = [
				jx("button", {
					type: "button",
					key: "act-new",
					className: "kidc_ghost",
					title: t("newInput"),
					onClick: () => prefsActions.patch({ editorVisible: true, editor: null }),
					children: jx(_primitives.IconEditOutline16, { size: 13 }),
				}),
				jx("button", {
					type: "button",
					key: "act-session",
					className: "kidc_ghost kidc_primaryAlt",
					title: t("saveSessionHint"),
					onClick: () => void beginCapture(ctx, t),
					children: jx(_primitives.IconArchiveOutline20, { size: 13 }),
				}),
				jx("button", {
					type: "button",
					key: "act-capture",
					className: "kidc_primary",
					title: t("saveInputHint"),
					onClick: () => captureDraft(ctx, t, app.notify),
					children: jx(_primitives.IconPlusOutline16, { size: 13 }),
				}),
			];
			return jxs("div", {
				className: "kidc_panel",
				children: [
					jx(WindowHeader, { t, ctx, collapsed: false }),
					jxs("div", { className: "kidc_bodyRow" + (sideActions === true ? " kidc_bodyRowSide" : ""), children: [
						sideActions === true ? jxs("div", { className: "kidc_sideActions", children: actionButtons }) : null,
						jxs("div", { className: "kidc_body", children: [
						// 紧凑行1：搜索框 + 页签（同一行）
						jxs("div", { className: "kidc_searchRow", children: [
							jxs("div", { className: "kidc_search", children: [
								jx(_primitives.IconSearchOutline16, { size: 14 }),
								jx("input", {
									className: "kidc_searchInput",
									value: prefsState.query,
									placeholder: t("searchPlaceholder"),
									onChange: (e) => prefsActions.patch({ query: e.target.value }),
								}),
								prefsState.query !== "" ? jx("button", {
									type: "button",
									className: "kidc_iconBtn kidc_searchClear",
									onClick: () => prefsActions.patch({ query: "" }),
									children: jx(_primitives.IconCloseFill14, { size: 12 }),
								}) : null,
							]}),
							jxs("div", { className: "kidc_tabs", children: tabs.map(([key, label]) => jxs("button", {
								type: "button",
								key,
								className: "kidc_tab",
								"data-active": prefsState.tab === key,
								onClick: () => prefsActions.patch({ tab: key }),
								children: [label, jx("span", { className: "kidc_count", children: String(counts[key]) })],
							})) }),
						]}),
						// 紧凑行2：文件夹过滤 + 标签过滤（同一行，自动换行）
						// 紧凑行2：新建文件夹按钮（行首） + 标签筛选
						jxs("div", { className: "kidc_filterRow kidc_filterRowCompact", children: [
							jxs("button", {
								type: "button",
								className: "kidc_ghost kidc_iconOnly kidc_folderBtn",
								title: t("newFolder"),
								onClick: () => prefsActions.patch({ folderModal: true }),
								children: jx(_primitives.IconFolderOpenOutline16, { size: 20 }),
							}),
							data.tags.length > 0
								? [
									jxs("button", {
										type: "button",
										className: "kidc_chip kidc_tagAllChip",
										"data-active": prefsState.tag === "all",
										title: t("all"),
										onClick: () => prefsActions.patch({ tag: "all" }),
										children: jx(_primitives.IconListPenOutline16, { size: 13 }),
									}),
									data.tags.map((tag) => jxs("button", {
										type: "button",
										key: "tag-" + tag.id,
										className: "kidc_chip",
										"data-active": prefsState.tag === tag.id,
										onClick: () => prefsActions.patch({ tag: tag.id }),
										children: [jx("span", { className: "kidc_dot", style: { background: tag.color ?? "#8c8c8c" } }), tag.name],
									})),
								]
								: null,
						]}),
						jx(Toolbar, { t }),
						jx(EntryList, { t, ctx }),
						]}),
					]}),
					jxs("div", { className: "kidc_footer", children: [
						jx(Notice, { t }),
						jx("span", { className: "kidc_toolText", children: t("saveInputHint") }),
						jx("span", { className: "kidc_spacer" }),
						sideActions === true ? null : actionButtons,
					]}),
				],
			});
		}

		function CollapsedPill({ t, ctx }) {
			const app = useApp();
			const data = useData();
			const { actions: prefsActions } = prefs;
			return jxs("button", {
				type: "button",
				className: "kidc_pill",
				onClick: () => prefsActions.patch({ collapsed: false }),
				children: [
					jx("span", { className: "kidc_brand", children: "📋" }),
					String(data.entries.length),
				],
			});
		}

		function EditorModal({ t, ctx }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const extra = useMemo(() => {
				if (prefsState.editor === null) return null;
				return data.entries.find((e) => e.id === prefsState.editor) ?? null;
			}, [prefsState.editor, data]);
			const [title, setTitle] = useState(() => (extra !== null ? extra.title : ""));
			const [text, setText] = useState(() => (extra !== null ? (extra.text ?? "") : ""));
			const [folderId, setFolderId] = useState(() => (extra !== null ? (extra.folderId ?? null) : null));
			const [tagIds, setTagIds] = useState(() => (extra !== null ? (Array.isArray(extra.tagIds) ? extra.tagIds.slice() : []) : []));
			const [color, setColor] = useState(() => (extra !== null ? (extra.color ?? null) : null));
			if (prefsState.editorVisible !== true) return null;
			const save = () => {
				const finalTitle = title.trim() !== "" ? title.trim() : firstLine(text);
				if (extra !== null) {
					commitData((d) => {
						const entry = d.entries.find((e) => e.id === extra.id);
						if (entry !== null && entry !== undefined) {
							entry.title = finalTitle;
							entry.text = text;
							entry.folderId = folderId;
							entry.tagIds = tagIds.slice();
							entry.color = color;
							entry.updatedAt = now();
						}
					});
				} else {
					commitData((d) => {
						d.entries.unshift({
							id: uid(),
							kind: "input",
							title: finalTitle,
							text,
							session: null,
							folderId,
							tagIds: tagIds.slice(),
							color,
							pinned: false,
							createdAt: now(),
							updatedAt: now(),
						});
					});
				}
				prefsActions.patch({ editorVisible: false, editor: null });
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) prefsActions.patch({ editorVisible: false, editor: null }); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("newInput") }),
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: () => prefsActions.patch({ editorVisible: false, editor: null }), children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jxs("div", { className: "kidc_field", children: [
							jx("span", { className: "kidc_label", children: t("labelTitle") }),
							jx("input", { className: "kidc_input", value: title, onChange: (e) => setTitle(e.target.value), placeholder: t("labelTitle") }),
						]}),
						jxs("div", { className: "kidc_field", children: [
							jx("span", { className: "kidc_label", children: t("content") }),
							jx("textarea", { className: "kidc_textarea", value: text, onChange: (e) => setText(e.target.value) }),
						]}),
						jxs("div", { className: "kidc_field", children: [
							jx("span", { className: "kidc_label", children: t("folder") }),
							jxs("select", { className: "kidc_input", value: folderId ?? "", onChange: (e) => setFolderId(e.target.value === "" ? null : e.target.value), children: [
								jx("option", { value: "", children: t("noFolder") }),
								...data.folders.map((folder) => jx("option", { key: folder.id, value: folder.id, children: folder.name })),
							]}),
						]}),
						jxs("div", { className: "kidc_field", children: [
							jx("span", { className: "kidc_label", children: t("tags") }),
							jx(TagChips, { t, value: tagIds, onChange: setTagIds }),
						]}),
						jxs("div", { className: "kidc_field", children: [
							jx("span", { className: "kidc_label", children: t("color") }),
							jxs("div", { className: "kidc_palette", children: [
								jx(ColorSwatch, { color: null, active: color === null, onClick: () => setColor(null) }),
								...PALETTE.map((c) => jx(ColorSwatch, { key: c, color: c, active: color === c, onClick: () => setColor(c) })),
							]}),
						]}),
					]}),
					jxs("div", { className: "kidc_modalFoot", children: [
						jx("span", { className: "kidc_spacer" }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => prefsActions.patch({ editorVisible: false, editor: null }), children: t("cancel") }),
						jx("button", { type: "button", className: "kidc_primary", onClick: save, children: t("save") }),
					]}),
				]}),
			});
		}

		/** 文件夹编辑弹窗：名称 + 颜色（与「编辑输入」同样的弹窗结构）。 */
		function FolderEditorModal({ t }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const folder = useMemo(() => {
				if (prefsState.folderEditor === null || prefsState.folderEditor === undefined) return null;
				return data.folders.find((f) => f.id === prefsState.folderEditor) ?? null;
			}, [prefsState.folderEditor, data]);
			const [name, setName] = useState("");
			const [color, setColor] = useState(null);
			const openedId = folder !== null ? folder.id : null;
			// 每次打开（或切换目标文件夹）时把当前值填进表单
			useEffect(() => {
				if (folder === null) return;
				setName(folder.name ?? "");
				setColor(folder.color ?? null);
			}, [openedId]);
			if (folder === null) return null;
			const close = () => prefsActions.patch({ folderEditor: null });
			const save = () => {
				const trimmed = name.trim();
				commitData((d) => {
					const target = d.folders.find((f) => f.id === folder.id);
					if (target === null || target === undefined) return;
					if (trimmed !== "") target.name = trimmed;
					target.color = color;
				});
				close();
				app.notify("renamed");
			};
			const remove = () => {
				commitData((d) => {
					d.folders = d.folders.filter((f) => f.id !== folder.id);
					for (const entry of d.entries) if (entry.folderId === folder.id) entry.folderId = null;
				});
				close();
				app.notify("deletedOne");
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) close(); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("editFolder") }),
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: close, children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jxs("div", { className: "kidc_field", children: [
							jx("div", { className: "kidc_label", children: t("folderName") }),
							jx("input", {
								className: "kidc_input",
								value: name,
								placeholder: t("renamePlaceholder"),
								onChange: (e) => setName(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") save();
									if (e.key === "Escape") close();
								},
								autoFocus: true,
							}),
						]}),
						jxs("div", { className: "kidc_field", children: [
							jx("div", { className: "kidc_label", children: t("color") }),
							jxs("div", { className: "kidc_palette", children: [
								jx(ColorSwatch, { key: "none", color: null, active: color === null, onClick: () => setColor(null) }),
								PALETTE.map((c) => jx(ColorSwatch, { key: c, color: c, active: color === c, onClick: () => setColor(c) })),
							]}),
						]}),
					]}),
					jxs("div", { className: "kidc_modalFoot", children: [
						jx("button", { type: "button", className: "kidc_ghost kidc_danger", onClick: remove, children: t("delete") }),
						jx("span", { className: "kidc_spacer" }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: close, children: t("cancel") }),
						jx("button", { type: "button", className: "kidc_primary", onClick: save, children: t("save") }),
					]}),
				]}),
			});
		}

		function FolderModal({ t }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const [name, setName] = useState("");
			const [color, setColor] = useState(null);
			if (prefsState.folderModal !== true) return null;
			const addFolder = () => {
				const trimmed = name.trim();
				if (trimmed === "") return;
				commitData((d) => {
					d.folders.push({ id: uid(), name: trimmed, color, createdAt: now() });
				});
				setName("");
				setColor(null);
			};
			const rename = (folder, value) => {
				commitData((d) => {
					const target = d.folders.find((f) => f.id === folder.id);
					if (target !== null && target !== undefined) target.name = value.trim() !== "" ? value.trim() : target.name;
				});
			};
			const recolor = (folder) => {
				const next = PALETTE[(Math.max(0, PALETTE.indexOf(folder.color ?? "")) + 1) % PALETTE.length];
				commitData((d) => {
					const target = d.folders.find((f) => f.id === folder.id);
					if (target !== null && target !== undefined) target.color = next;
				});
			};
			const remove = (folder) => {
				commitData((d) => {
					d.folders = d.folders.filter((f) => f.id !== folder.id);
					for (const entry of d.entries) if (entry.folderId === folder.id) entry.folderId = null;
				});
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) prefsActions.patch({ folderModal: false }); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("folders") }),
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: () => prefsActions.patch({ folderModal: false }), children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jxs("div", { className: "kidc_rowList", children: data.folders.map((folder) => jxs("div", { className: "kidc_rowItem", key: folder.id, children: [
							jx("button", { type: "button", className: "kidc_swatch", style: { background: folder.color ?? "#8c8c8c" }, title: t("color"), onClick: () => recolor(folder) }),
							jx("input", {
								className: "kidc_input",
								style: { minWidth: 0, flex: 1 },
								defaultValue: folder.name,
								onBlur: (e) => rename(folder, e.target.value),
								onKeyDown: (e) => { if (e.key === "Enter") rename(folder, e.target.value); },
							}),
							jx("span", { className: "kidc_rowMeta", children: String(data.entries.filter((entry) => entry.folderId === folder.id).length) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("editFolder"), onClick: () => prefsActions.patch({ folderEditor: folder.id }), children: jx(_primitives.IconEditOutline16, { size: 13 }) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("delete"), onClick: () => remove(folder), children: jx(_primitives.IconTrashOutline16, { size: 13 }) }),
						] }))}),
						jxs("div", { className: "kidc_field", children: [
							jxs("div", { className: "kidc_filterRow", children: [
								jx("input", { className: "kidc_input", style: { flex: 1, minWidth: 0 }, value: name, placeholder: t("folderName"), onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") addFolder(); } }),
								jx("button", { type: "button", className: "kidc_primary", onClick: addFolder, children: jx(_primitives.IconPlusOutline16, { size: 13 }) }),
							]}),
							jxs("div", { className: "kidc_palette", children: PALETTE.map((c) => jx(ColorSwatch, { key: c, color: c, active: color === c, onClick: () => setColor(c) })) }),
						]}),
						jx("span", { className: "kidc_rowMeta", children: t("folderDeleteWarn") }),
					]}),
				]}),
			});
		}

		function TagModal({ t }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const [name, setName] = useState("");
			const [color, setColor] = useState(null);
			if (prefsState.tagModal !== true) return null;
			const addTag = () => {
				const trimmed = name.trim();
				if (trimmed === "") return;
				commitData((d) => {
					d.tags.push({ id: uid(), name: trimmed, color, createdAt: now() });
				});
				setName("");
				setColor(null);
			};
			const rename = (tag, value) => {
				commitData((d) => {
					const target = d.tags.find((x) => x.id === tag.id);
					if (target !== null && target !== undefined) target.name = value.trim() !== "" ? value.trim() : target.name;
				});
			};
			const recolor = (tag) => {
				const next = PALETTE[(Math.max(0, PALETTE.indexOf(tag.color ?? "")) + 1) % PALETTE.length];
				commitData((d) => {
					const target = d.tags.find((x) => x.id === tag.id);
					if (target !== null && target !== undefined) target.color = next;
				});
			};
			const remove = (tag) => {
				commitData((d) => {
					d.tags = d.tags.filter((x) => x.id !== tag.id);
					for (const entry of d.entries) entry.tagIds = entry.tagIds.filter((id) => id !== tag.id);
				});
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) prefsActions.patch({ tagModal: false }); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("tags") }),
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: () => prefsActions.patch({ tagModal: false }), children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jxs("div", { className: "kidc_rowList", children: data.tags.map((tag) => jxs("div", { className: "kidc_rowItem", key: tag.id, children: [
							jx("button", { type: "button", className: "kidc_swatch", style: { background: tag.color ?? "#8c8c8c" }, title: t("color"), onClick: () => recolor(tag) }),
							jx("input", {
								className: "kidc_input",
								style: { minWidth: 0, flex: 1 },
								defaultValue: tag.name,
								onBlur: (e) => rename(tag, e.target.value),
								onKeyDown: (e) => { if (e.key === "Enter") rename(tag, e.target.value); },
							}),
							jx("span", { className: "kidc_rowMeta", children: String(data.entries.filter((entry) => Array.isArray(entry.tagIds) && entry.tagIds.indexOf(tag.id) >= 0).length) }),
							jx("button", { type: "button", className: "kidc_iconBtn", title: t("delete"), onClick: () => remove(tag), children: jx(_primitives.IconTrashOutline16, { size: 13 }) }),
						] }))}),
						jxs("div", { className: "kidc_field", children: [
							jxs("div", { className: "kidc_filterRow", children: [
								jx("input", { className: "kidc_input", style: { flex: 1, minWidth: 0 }, value: name, placeholder: t("tagName"), onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") addTag(); } }),
								jx("button", { type: "button", className: "kidc_primary", onClick: addTag, children: jx(_primitives.IconPlusOutline16, { size: 13 }) }),
							]}),
							jxs("div", { className: "kidc_palette", children: PALETTE.map((c) => jx(ColorSwatch, { key: c, color: c, active: color === c, onClick: () => setColor(c) })) }),
						]}),
						jx("span", { className: "kidc_rowMeta", children: t("tagDeleteWarn") }),
					]}),
				]}),
			});
		}

		function SessionModal({ t, ctx }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const entry = useMemo(() => {
				if (prefsState.sessionModal === null) return null;
				return data.entries.find((e) => e.id === prefsState.sessionModal && e.kind === "session") ?? null;
			}, [prefsState.sessionModal, data]);
			const [renaming, setRenaming] = useState(false);
			const [renameValue, setRenameValue] = useState("");
			if (entry === null) return null;
			const session = entry.session;
			const transcript = session !== null && session !== undefined ? (session.transcript ?? "") : "";
			const startRename = () => {
				setRenameValue(entry.title ?? "");
				setRenaming(true);
			};
			const commitRename = () => {
				const finalTitle = renameValue.trim() !== "" ? renameValue.trim() : entry.title;
				commitData((d) => {
					const target = d.entries.find((e) => e.id === entry.id);
					if (target !== null && target !== undefined) {
						target.title = finalTitle;
						target.updatedAt = now();
					}
				});
				setRenaming(false);
				app.notify("renamed");
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) prefsActions.patch({ sessionModal: null }); },
				children: jxs("div", { className: "kidc_modalCard kidc_modalWide", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						renaming === true
							? jxs("div", { style: { flex: 1, minWidth: 0, display: "flex", gap: 6, alignItems: "center" }, children: [
								jx("input", {
									className: "kidc_renameInput",
									value: renameValue,
									placeholder: t("renamePlaceholder"),
									onChange: (e) => setRenameValue(e.target.value),
									onKeyDown: (e) => {
										if (e.key === "Enter") commitRename();
										if (e.key === "Escape") setRenaming(false);
									},
									autoFocus: true,
								}),
								jx("button", { type: "button", className: "kidc_ghost", onClick: commitRename, children: t("save") }),
								jx("button", { type: "button", className: "kidc_ghost", onClick: () => setRenaming(false), children: t("cancel") }),
							]})
							: jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: entry.title }),
						renaming !== true
							? jx("button", { type: "button", className: "kidc_ghost", title: t("rename"), onClick: startRename, children: [jx(_primitives.IconEditOutline16, { size: 13 }), t("rename")] })
							: null,
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: () => prefsActions.patch({ sessionModal: null }), children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jxs("div", { className: "kidc_cardMeta", children: [
							jx("span", { className: "kidc_metaText", children: t("msgCount", { n: session !== null && session !== undefined ? session.messageCount : 0 }) }),
							session !== null && session !== undefined && typeof session.atSeq === "number"
								? jx("span", {
									className: "kidc_metaText kidc_branchTag",
									children: typeof session.totalTurns === "number" && session.totalTurns > (typeof session.turnCount === "number" ? session.turnCount : 0)
										? t("branchPoint", { n: typeof session.turnCount === "number" ? session.turnCount : 0, m: session.totalTurns })
										: t("branchPointAll", { m: typeof session.totalTurns === "number" ? session.totalTurns : 0 }),
								})
								: null,
							session !== null && session !== undefined && session.agentPreset !== null && session.agentPreset !== undefined ? jx("span", { className: "kidc_metaText", children: session.agentPreset }) : null,
							jx("span", { className: "kidc_metaText", children: String(session !== null && session !== undefined ? session.capturedAt : 0) }),
						]}),
						session !== null && session !== undefined && typeof session.atSeq === "number" && typeof session.totalTurns === "number" && session.totalTurns > (typeof session.turnCount === "number" ? session.turnCount : 0)
							? jx("div", {
								className: "kidc_rowMeta kidc_branchWarn",
								children: t("branchDropped", {
									n: typeof session.turnCount === "number" ? session.turnCount : 0,
									k: session.totalTurns - (typeof session.turnCount === "number" ? session.turnCount : 0),
								}),
							})
							: null,
						jx("pre", { className: "kidc_transcript", children: transcript !== "" ? transcript : "…" }),
					]}),
					jxs("div", { className: "kidc_modalFoot", children: [
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => { void continueSession(ctx, t, entry); }, children: [jx(_primitives.IconBranchOutline16, { size: 13 }), t("continue_")] }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => pasteToComposer(ctx, t, transcript, app.notify), children: [jx(_primitives.IconNewChatOutline16, { size: 13 }), t("pasteTranscript")] }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => {
							_primitives.writeClipboard(transcript).then(() => app.notify("copied")).catch(() => {});
						}, children: [jx(_primitives.IconCopyOutline16, { size: 13 }), t("copyTranscript")] }),
						jx("span", { className: "kidc_spacer" }),
						jx("button", { type: "button", className: "kidc_ghost kidc_danger", onClick: () => prefsActions.patch({ sessionModal: null, confirm: { ids: [entry.id] } }), children: t("delete") }),
					]}),
				]}),
			});
		}

		/** Branch-point picker: a scrollable list of the session's completed
		 * turns. The newest page shows up immediately and older history keeps
		 * loading as you scroll up, so even a long session's early turns can be
		 * picked as the branch point. */
		function CaptureModal({ t, ctx }) {
			const metaState = useMeta();
			const pending = metaState.capture ?? null;
			const marks = pending !== null && pending !== undefined && Array.isArray(pending.marks) ? pending.marks : [];
			const markCount = marks.length;
			const pendingId = pending !== null && pending !== undefined ? String(pending.id ?? "") : "";
			const focusMessageId = pending !== null && pending !== undefined ? (pending.focusMessageId ?? null) : null;
			const focusTurn = pending !== null && pending !== undefined && typeof pending.focusTurn === "number" ? pending.focusTurn : null;
			const [selectedSeq, setSelectedSeq] = useState(null);
			const [saving, setSaving] = useState(false);
			const listRef = useRef(null);
			const scrollHeightRef = useRef(0);
			const lastPendingIdRef = useRef("");
			const userTouchedRef = useRef(false);
			// 默认选中：优先定位到触发的助手消息所在轮次（该轮可能还在更早的页
			// 里，等加载到之后再切换），否则取最后一轮（= 全部内容）。选中项用
			// seq 记录，向上加载不会错位；用户手动点过之后不再被自动覆盖。
			useEffect(() => {
				if (pendingId === "" || markCount === 0) return;
				if (lastPendingIdRef.current !== pendingId) {
					lastPendingIdRef.current = pendingId;
					userTouchedRef.current = false;
				}
				if (userTouchedRef.current === true) return;
				// 优先按轮次定位（来自回合尾部探针，最可靠），其次按 messageId。
				if (focusTurn !== null) {
					const hitTurn = marks.find((m) => m.turn === focusTurn);
					if (hitTurn !== undefined) setSelectedSeq(hitTurn.seq);
					return;
				}
				if (focusMessageId !== null) {
					const records = pending !== null && pending !== undefined && Array.isArray(pending.records) ? pending.records : [];
					const record = records.find((r) => r !== null && r !== undefined && r.messageId === focusMessageId);
					if (record !== undefined && typeof record.turn === "number") {
						const hit = marks.find((m) => m.turn === record.turn);
						if (hit !== undefined) setSelectedSeq(hit.seq);
					}
					// 目标轮次尚未加载时保持未选中，等更早的页到达后再定位。
					return;
				}
				setSelectedSeq(marks[markCount - 1].seq);
			}, [pendingId, markCount, focusMessageId, focusTurn]);
			// 向上加载会让列表变长：按滚动高度差补偿，保持视觉位置不跳。
			useLayoutEffect(() => {
				const el = listRef.current;
				if (el === null || el === undefined) return;
				const previous = scrollHeightRef.current;
				if (previous > 0 && el.scrollHeight > previous) el.scrollTop += el.scrollHeight - previous;
				scrollHeightRef.current = el.scrollHeight;
			});
			if (pending === null || pending === undefined) return null;
			const chosen = marks.find((m) => m.seq === selectedSeq) ?? marks[markCount - 1] ?? null;
			const dropped = chosen === null ? 0 : marks.filter((m) => m.seq > chosen.seq).length;
			const loading = pending.loading === true;
			const hasMore = pending.hasMore === true;
			const onScrollList = (e) => {
				if (e.target.scrollTop > 24) return;
				if (hasMore !== true || loading === true) return;
				void loadOlderCapture(ctx);
			};
			const doSave = () => {
				if (saving === true) return;
				setSaving(true);
				void Promise.resolve(saveCaptureEntry(ctx, pending, chosen)).finally(() => setSaving(false));
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) meta.actions.patch({ capture: null }); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("captureTitle") }),
						jx("button", { type: "button", className: "kidc_iconBtn", onClick: () => meta.actions.patch({ capture: null }), children: jx(_primitives.IconCloseOutline16, { size: 14 }) }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jx("div", { className: "kidc_rowMeta", children: t("captureHint") }),
						jxs("div", { className: "kidc_turnList", ref: listRef, onScroll: onScrollList, children: [
							jx("div", { className: "kidc_turnStatus", children: hasMore === true
								? (loading === true ? t("captureLoadingMore") : t("captureScrollUp"))
								: (pending.capped === true ? t("captureLoadCapped", { n: markCount }) : t("captureOldest", { n: markCount })) }),
							marks.map((mark) => jxs("button", {
								type: "button",
								key: "turn-" + String(mark.seq),
								className: "kidc_turnItem",
								"data-active": mark.seq === (chosen === null ? null : chosen.seq),
								onClick: () => { userTouchedRef.current = true; setSelectedSeq(mark.seq); },
								children: [
									jx("span", { className: "kidc_turnNo", children: t("captureTurn", { n: mark.turn }) }),
									jx("span", { className: "kidc_turnLabel", children: mark.label !== "" ? mark.label : t("captureUntitled") }),
									mark.turn === marks[markCount - 1].turn ? jx("span", { className: "kidc_turnTag", children: t("captureLastTurn") }) : null,
								],
							})),
						] }),
					]}),
					jxs("div", { className: "kidc_modalFoot", children: [
						jx("span", { className: "kidc_rowMeta", children: dropped > 0 ? t("captureWillDrop", { n: chosen === null ? 0 : chosen.turn, k: dropped }) : t("captureNothing") }),
						jx("span", { className: "kidc_spacer" }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => meta.actions.patch({ capture: null }), children: t("cancel") }),
						jx("button", {
							type: "button",
							className: "kidc_primary",
							disabled: saving === true,
							onClick: doSave,
							children: saving === true ? t("captureSaving") : t("save"),
						}),
					]}),
				]}),
			});
		}

		/** 助手消息操作行里的入口（每条回复下方那排图标）：以该条回复所在
		 * 轮次为默认分支点，打开「保存会话分支」弹窗。
		 * 轮次直接读 DOM 祖先 `[data-turn-tail]`（回合尾部节点自带该属性，
		 * 本按钮正渲染在其中），无需额外的槽位注册。 */
		function KcbAssistantAction({ t, openCapture, messageId }) {
			if (typeof openCapture !== "function") return null;
			return jx("button", {
				type: "button",
				className: "kidc_inlineAction",
				title: t("saveBranchHint"),
				onClick: (e) => {
					e.stopPropagation();
					let focusTurn = null;
					try {
						const node = e.currentTarget !== null && e.currentTarget !== undefined && typeof e.currentTarget.closest === "function"
							? e.currentTarget.closest("[data-turn-tail]")
							: null;
						const raw = node !== null && node !== undefined ? node.getAttribute("data-turn-tail") : null;
						if (raw !== null && raw !== undefined && raw !== "") {
							const parsed = Number(raw);
							if (Number.isFinite(parsed)) focusTurn = parsed;
						}
					} catch {}
					void openCapture(
						typeof messageId === "string" ? messageId : undefined,
						focusTurn === null ? undefined : focusTurn
					);
				},
				children: jx(_primitives.IconArchiveOutline20, { size: 14 }),
			});
		}

		function ConfirmModal({ t }) {
			const prefsState = usePrefs();
			const { actions: prefsActions } = prefs;
			const app = useApp();
			const data = useData();
			const confirm = prefsState.confirm;
			if (confirm === null || confirm === undefined) return null;
			const ids = Array.isArray(confirm.ids) ? confirm.ids : [];
			const doDelete = () => {
				commitData((d) => {
					const before = d.entries.length;
					d.entries = d.entries.filter((e) => ids.indexOf(e.id) < 0);
					if (d.entries.length === before && ids.length === 1) {
						const folder = d.folders.find((f) => f.id === ids[0]);
						if (folder !== null && folder !== undefined) {
							d.folders = d.folders.filter((f) => f.id !== ids[0]);
							for (const entry of d.entries) if (entry.folderId === ids[0]) entry.folderId = null;
						}
					}
				});
				prefsActions.patch({ confirm: null, selected: [], selectMode: false, sessionModal: null });
				app.notify(ids.length > 1 ? "deleted" : "deletedOne", { n: ids.length });
			};
			return jxs("div", {
				className: "kidc_modal",
				onClick: (e) => { if (e.target === e.currentTarget) prefsActions.patch({ confirm: null }); },
				children: jxs("div", { className: "kidc_modalCard", children: [
					jxs("div", { className: "kidc_modalHead", children: [
						jx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }, children: t("confirmDeleteTitle") }),
					]}),
					jxs("div", { className: "kidc_modalBody", children: [
						jx("div", { className: "kidc_label", children: t("confirmDeleteMsg", { n: ids.length }) }),
					]}),
					jxs("div", { className: "kidc_modalFoot", children: [
						jx("span", { className: "kidc_spacer" }),
						jx("button", { type: "button", className: "kidc_ghost", onClick: () => prefsActions.patch({ confirm: null }), children: t("cancel") }),
						jx("button", { type: "button", className: "kidc_primary kidc_danger", onClick: doDelete, children: t("confirm") }),
					]}),
				]}),
			});
		}

		/** Root floating window: renders the panel or the collapsed pill. */
		/** 测量 DSH 会话区几何：tab 行下沿(top)、窗口底(bottom)、会话区根(rootEl=scrollBody 的父)。
		 *  多选择器回退：先找 [data-conversation-scroll]（scrollBody），其父为根；
		 *  找不到时找 [data-slot="conversation.session"] 向上找滚动容器；
		 *  仍找不到时返回 null（调用方回退）。 */
		function measureDock() {
			try {
				const vh = typeof window !== "undefined" ? window.innerHeight : 720;
				let scroll = document.querySelector('[data-conversation-scroll]');
				let slot = document.querySelector('[data-slot="conversation.session"]');
				if (scroll === null || scroll === undefined) {
					// 回退：从 slot 向上找 overflow 祖先作为 scrollBody
					let node = slot;
					for (let depth = 0; depth < 8 && node !== null && node !== undefined; depth += 1) {
						const cs = window.getComputedStyle(node);
						if (cs.overflowY === "auto" || cs.overflowY === "scroll") { scroll = node; break; }
						node = node.parentElement;
					}
				}
				if (scroll === null || scroll === undefined) return null;
				const rootEl = scroll.parentElement;
				if (rootEl === null || rootEl === undefined) return null;
				// top：优先 slot（tab 行下方的消息区顶）；找不到用 scrollBody 顶 + 估算 header
				let top = 0;
				if (slot !== null && slot !== undefined) {
					const r = slot.getBoundingClientRect();
					if (r.height > 40) top = Math.round(r.top);
				}
				if (top <= 0) {
					const r = scroll.getBoundingClientRect();
					top = Math.max(0, Math.round(r.top));
				}
				// left：内容区左边界（会话区根的左缘），已有分隔线正是从这里开始；
				// 取不到就退回 slot 左缘，仍取不到则返回 0（此时不画延伸线，避免穿到侧栏）。
				let left = 0;
				try {
					const rootRect = rootEl.getBoundingClientRect();
					if (rootRect.left > 0) left = Math.round(rootRect.left);
				} catch {}
				if (left <= 0 && slot !== null && slot !== undefined) {
					try {
						const slotRect = slot.getBoundingClientRect();
						if (slotRect.left > 0) left = Math.round(slotRect.left);
					} catch {}
				}
				// insetEl：只挤窄会话滚动区（不含 header）。若连 header 一起挤窄，
				// header 底部的分界线会跟着变短，停靠卡片上方就接不上那条线。
				return { top: Math.max(0, top), bottom: vh, left: Math.max(0, left), rootEl, insetEl: scroll };
			} catch {
				return null;
			}
		}

		/** 拖动期间的透明遮罩：让指针始终落在这层上，下面的 DSH 内容不再收到
		 * hover —— 否则每帧都要做命中测试并重算 hover 样式，也是拖动卡顿的来源。
		 * 事件仍会冒泡到 window，所以拖动逻辑不受影响。返回移除函数。 */
		function showDragShield(cursor) {
			try {
				const host = typeof document !== "undefined" ? document.querySelector(".kidc_root") : null;
				if (host === null || host === undefined) return () => {};
				const shield = document.createElement("div");
				shield.className = "kidc_dragShield";
				if (typeof cursor === "string" && cursor !== "") shield.style.cursor = cursor;
				host.appendChild(shield);
				return () => {
					try { shield.remove(); } catch { /* noop */ }
				};
			} catch {
				return () => {};
			}
		}

		/** 收起胶囊占用的右缘宽度：收起时也要挤出这么多，否则胶囊会盖住内容。 */
		const DOCK_PILL_WIDTH = 42;
		/** 拖动缩放的实时几何：拖动期间完全不写 store（不碰 localStorage、不发请求），
		 * 只把宽度直接写到 DOM 上，松手时才 commit 一次。null = 未在拖动。 */
		const liveResize = { width: null, height: null, x: null, y: null, insetEl: null, rootEl: null, ghostValueEl: null };
		/** 当前生效的挤出宽度（null = 未挤出）。 */
		let dockInsetWidth = null;
		/** 挤出改用**动态样式表规则**，而不是元素上的 inline style：DSH 重渲染会话视图时
		 * React 会把它不认识的 inline 属性清掉（所以切换会话后内容又跑到面板底下），
		 * 而样式表规则不受影响 —— 新会话容器只要带 [data-conversation-scroll] 就自动生效。 */
		const DOCK_STYLE_ID = "kidai-clipboard-dock-inset";
		function dockInsetStyleEl() {
			try {
				let el = document.getElementById(DOCK_STYLE_ID);
				if (el === null || el === undefined) {
					el = document.createElement("style");
					el.id = DOCK_STYLE_ID;
					const host = document.head !== null && document.head !== undefined ? document.head : document.documentElement;
					if (host !== null && host !== undefined) host.appendChild(el);
				}
				return el;
			} catch {
				return null;
			}
		}
		/** 设定（或清除）挤出规则；width 不是正数时清空。 */
		function setDockInsetRule(width) {
			try {
				dockInsetWidth = typeof width === "number" && width > 0 ? width : null;
				const el = dockInsetStyleEl();
				if (el === null) return;
				el.textContent = typeof width === "number" && width > 0
					? "[data-conversation-scroll]{margin-right:" + width + "px!important;margin-left:0!important}"
					: "";
			} catch { /* noop */ }
		}
		/** 拖动期的轻量挤出：只更新样式表规则（零布局读取）。 */
		function applyDockInsetWidth(width) {
			try {
				setDockInsetRule(width);
				// 清掉早期版本留在元素上的 inline margin，避免叠加
				const el = liveResize.insetEl;
				if (el !== null && el !== undefined && el.isConnected === true && el.style.marginRight !== "") el.style.marginRight = "";
			} catch {
				/* noop */
			}
		}

		/** 停靠时挤出会话区（右停靠=右侧缩进）。返回恢复函数。 */
		function applyDockInset(dock, width) {
			try {
				if (dock !== "right") {
					setDockInsetRule(0);
					return () => {};
				}
				setDockInsetRule(width);
				const geom = measureDock();
				const el = geom !== null ? (geom.insetEl !== null && geom.insetEl !== undefined ? geom.insetEl : geom.rootEl) : null;
				liveResize.insetEl = el;
				const prev = el !== null && el !== undefined ? { right: el.style.marginRight, left: el.style.marginLeft } : { right: "", left: "" };
				if (el !== null && el !== undefined) {
					el.style.marginRight = "";
					el.style.marginLeft = "";
				}
				return () => {
					setDockInsetRule(0);
					if (el !== null && el !== undefined) {
						el.style.marginRight = prev.right;
						el.style.marginLeft = prev.left;
					}
				};
			} catch {
				return () => {};
			}
		}

		function ClipboardWindow({ t, ctx }) {
			const prefsState = usePrefs();
			const app = useApp();
			const data = useData();
			// 窗口开到面板的挤出可能跨越 open/收起状态切换；hook 必须在早退前无条件调用
			const winForEffect = data.settings?.window ?? null;
			const dockForEffect = winForEffect !== null && winForEffect !== undefined && winForEffect.dock === "right" ? winForEffect.dock : null;
			const collapsedForEffect = prefsState.collapsed === true;
			const openForEffect = prefsState.open === true;
			const widthForEffect = (() => {
				const w = winForEffect !== null && winForEffect !== undefined && typeof winForEffect.width === "number" && Number.isFinite(winForEffect.width) ? winForEffect.width : 360;
				const v = typeof window !== "undefined" ? window.innerWidth : 1280;
				return Math.max(280, Math.min(w, v - 16));
			})();
			// 显式解除挤出（不依赖 effect cleanup，确保收起/关闭时工作区必然恢复）
			const clearDockInset = () => {
				setDockInsetRule(0);
				try {
					const geom = measureDock();
					const el = geom !== null ? (geom.insetEl !== null && geom.insetEl !== undefined ? geom.insetEl : geom.rootEl) : null;
					if (el !== null && el !== undefined) {
						el.style.marginRight = "";
						el.style.marginLeft = "";
					}
					// 早期版本把挤出写在元素上，一并清掉，避免残留
					if (geom !== null && geom.rootEl !== null && geom.rootEl !== undefined && geom.rootEl !== el) {
						geom.rootEl.style.marginRight = "";
						geom.rootEl.style.marginLeft = "";
					}
				} catch {
					/* noop */
				}
			};
			useEffect(() => {
				// 关闭：彻底解除挤出；收起为胶囊：仍挤出胶囊那一小条（否则胶囊会盖住内容右缘）
				if (dockForEffect === null || !openForEffect) {
					clearDockInset();
					return undefined;
				}
				if (collapsedForEffect) return applyDockInset(dockForEffect, DOCK_PILL_WIDTH);
				return applyDockInset(dockForEffect, widthForEffect);
			}, [dockForEffect, widthForEffect, collapsedForEffect, openForEffect]);
			// useLayoutEffect：展开瞬间同步应用 margin，避免面板先按全宽渲染再回弹
			useLayoutEffect(() => {
				if (dockForEffect === null || !openForEffect) {
					clearDockInset();
					return undefined;
				}
				if (collapsedForEffect) return applyDockInset(dockForEffect, DOCK_PILL_WIDTH);
				return applyDockInset(dockForEffect, widthForEffect);
			}, [dockForEffect, widthForEffect, collapsedForEffect, openForEffect]);
			// dock 几何：每次渲染后重新测量，只在 top/bottom 变化时 setState
			// （稳定后不再触发重渲染）。用缓存会在会话头部高度变化后错位，
			// 面板就压不到那条分界线上了。
			const [dockGeom, setDockGeom] = useState(null);
			useLayoutEffect(() => {
				if (dockForEffect === null) {
					setDockGeom((prev) => (prev === null ? prev : null));
					return;
				}
				const next = measureDock();
				setDockGeom((prev) => {
					const prevTop = prev !== null && prev !== undefined ? prev.top : null;
					const prevBottom = prev !== null && prev !== undefined ? prev.bottom : null;
					const nextTop = next !== null && next !== undefined ? next.top : null;
					const nextBottom = next !== null && next !== undefined ? next.bottom : null;
					if (prevTop === nextTop && prevBottom === nextBottom) return prev;
					return next;
				});
			});
			useEffect(() => {
				if (dockForEffect === null) return undefined;
				const onResize = () => prefs.actions.patch({ bump: (prefs.getSnapshot().bump ?? 0) + 1 });
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, [dockForEffect]);
			if (prefsState.open !== true) { return null; }
			const win = data.settings?.window ?? null;
			const x = win !== null && win !== undefined && typeof win.x === "number" ? win.x : 24;
			const y = win !== null && win !== undefined && typeof win.y === "number" ? win.y : 96;
			// 可缩放窗口：宽度/高度持久化在 settings.window.width/height
			const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
			const vh = typeof window !== "undefined" ? window.innerHeight : 720;
			const storedWidth = win !== null && win !== undefined && typeof win.width === "number" && Number.isFinite(win.width)
				? Math.max(280, Math.min(win.width, vw - 16))
				: Math.min(360, vw - 16);
			const maxHeight = Math.min(960, vh - 32);
			const storedHeight = win !== null && win !== undefined && typeof win.height === "number" && Number.isFinite(win.height)
				? Math.max(200, Math.min(win.height, maxHeight))
				: maxHeight;
			// 拖动期间用实时值渲染：任何一次重渲染都不会把尺寸弹回旧值
			const width = liveResize.width !== null ? Math.max(280, Math.min(liveResize.width, vw - 16)) : storedWidth;
			const height = liveResize.height !== null ? Math.max(200, Math.min(liveResize.height, maxHeight)) : storedHeight;
			// PS 风格停靠：仅支持右停靠（贴窗口右缘）
			const dock = win !== null && win !== undefined && win.dock === "right" ? win.dock : null;
			// 拖动中：位置/尺寸一律用实时值，且强制走浮动定位（store 还没提交，
			// 否则 React 会按旧的停靠/x/y 把面板弹回去）
			const dragging = liveResize.x !== null || liveResize.y !== null;
			const posX = liveResize.x !== null ? liveResize.x : x;
			const posY = liveResize.y !== null ? liveResize.y : y;
			const anchorLeft = dock === "right" ? vw - width - 8 : posX;
			// 停靠：top = 会话区分界线（header 底边），高度到底（窗口底）；并挤开会话滚动区
			// dock 几何来自上方 state（每次渲染后重测，避免头部高度变化后错位）
			// 面板顶边紧贴那条分界线的下沿：分界线是会话 header 的 ::after
			// （bottom:1px，横跨整个内容区，一直画到窗口右缘），所以面板从线的
			// 正下方开始、并去掉自身顶边框 —— 顶部只剩那一条线，最精简；
			// 线也保持完整可见（穿过卡片上方）。收起/关闭时不受影响。
			const dockedTop = dock !== null && dockGeom !== null ? Math.max(0, dockGeom.top) : (dock !== null ? 0 : y);
			const dockedHeight = dock !== null && dockGeom !== null
				? Math.max(200, dockGeom.bottom - dockedTop)
				: (dock !== null ? vh : height);
			// 挤出会话区：hook 已在上方（open 前）无条件调用；此处仅保留几何计算
			// dock 停靠：右端固定（right 定位），左端随宽度伸缩；浮动：left+top 定位
			const style = dock === "right" && prefsState.collapsed !== true && dragging !== true
				? {
					left: "auto",
					right: 8,
					top: dockedTop,
					width: width,
					height: dockedHeight,
				}
				: {
					left: prefsState.collapsed === true ? anchorLeft : anchorLeft,
					top: prefsState.collapsed === true
						? Math.max(0, Math.min(posY, vh - 160))
						: (dragging === true ? posY : dockedTop),
					width: prefsState.collapsed === true ? undefined : width,
					height: prefsState.collapsed === true ? undefined : (dragging === true ? height : dockedHeight),
				};
			return jxs("div", {
				className: "kidc_root" + (prefsState.collapsed === true ? " kidc_rootCollapsed" : ""),
				style,
				children: [
					prefsState.collapsed === true
						? jx(DockedPill, { t, dock: prefsState.collapsed === true ? dock : null, y })
						: jxs("div", { className: "kidc_panelWrap" + (dock !== null ? " kidc_dockedRight" : ""), style: { height: "100%" }, children: [
							jx(ClipboardPanel, { t, ctx }),
							jx(ResizeHandle, { t, data, docked: dock !== null, edge: data.settings?.ui?.resizeHandle === "edge" }),
							// 拖动占位屏：只在缩放拖动期间显示（此时面板内容被隐藏）
							jxs("div", { className: "kidc_resizeGhost", children: [
								jx("span", { className: "kidc_resizeGhostValue", children: "" }),
								jx("span", { className: "kidc_resizeGhostHint", children: t("resizeGhostHint") }),
							] }),
						] }),
					jx(EditorModal, { t, ctx, key: "ed-" + String(prefsState.editor ?? "new") }),
					jx(FolderModal, { t }),
					jx(FolderEditorModal, { t }),
					jx(TagModal, { t }),
					jx(SessionModal, { t, ctx, key: "sm-" + String(prefsState.sessionModal ?? "none") }),
					jx(CaptureModal, { t, ctx }),
					jx(ConfirmModal, { t }),
				],
			});
		}

		/** 持久化收起胶囊的竖直位置（settings.window.pillTop）。 */
		function commitPillTop(top) {
			commitData((d) => {
				const current = d.settings.window ?? {};
				d.settings.window = {
					...current,
					x: typeof current.x === "number" ? current.x : 24,
					y: typeof current.y === "number" ? current.y : 96,
					expanded: current.expanded !== false,
					pillTop: Math.round(top),
				};
			});
		}

		/** PS 风格收起条：贴窗口右缘竖排小标签 —— 点击展开、上下拖动移位，
		 * 向左拖离边缘后松手则变成悬浮窗口展开。 */
		function DockedPill({ t, dock, y }) {
			const { actions: prefsActions } = prefs;
			const data = useData();
			const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
			const vh = typeof window !== "undefined" ? window.innerHeight : 720;
			const dockGeom = dock !== null ? measureDock() : null;
			// 上边界＝会话区顶（与展开面板同基准）；默认位置即上边界
			const minTop = dockGeom !== null ? Math.max(0, Math.round(dockGeom.top)) : 0;
			const storedTop = data.settings?.window?.pillTop;
			const baseTop = typeof storedTop === "number" && Number.isFinite(storedTop)
				? Math.max(minTop, Math.min(Math.round(storedTop), Math.max(minTop, vh - 60)))
				: (dockGeom !== null ? minTop : Math.max(0, Math.min(y, vh - 60)));
			// 拖动中：位置只走本地 state + 直接改 DOM，松手才落库
			const [live, setLive] = useState(null);
			const dragRef = useRef(null);
			const frameRef = useRef(0);
			const top = live !== null ? live.top : baseTop;
			const liveLeft = live !== null && live.leaving === true ? live.left : null;
			const onPointerDown = (e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				const el = e.currentTarget;
				const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
				const hasRect = rect !== null && rect.width > 0 && rect.height > 0;
				const pillW = hasRect ? Math.round(rect.width) : 36;
				const pillH = hasRect ? Math.round(rect.height) : 90;
				const startTop = hasRect ? Math.round(rect.top) : baseTop;
				const startLeft = hasRect ? Math.round(rect.left) : Math.max(0, vw - pillW);
				dragRef.current = {
					startX: e.clientX, startY: e.clientY, startTop, startLeft, pillW, pillH,
					moved: false, leaving: false, lastTop: startTop, lastLeft: startLeft,
				};
				const hideShield = showDragShield("grabbing");
				const cancelFrame = () => {
					if (frameRef.current === 0) return;
					try {
						if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRef.current);
						else clearTimeout(frameRef.current);
					} catch { /* noop */ }
					frameRef.current = 0;
				};
				const paint = () => {
					frameRef.current = 0;
					const d = dragRef.current;
					if (d === null) return;
					el.style.top = d.lastTop + "px";
					if (d.leaving === true) {
						el.style.left = d.lastLeft + "px";
						el.style.right = "auto";
					} else {
						el.style.left = "auto";
						el.style.right = "0px";
					}
				};
				const schedule = () => {
					if (frameRef.current !== 0) return;
					try {
						frameRef.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : setTimeout(paint, 16);
					} catch {
						frameRef.current = 0;
						paint();
					}
				};
				const onMove = (ev) => {
					const d = dragRef.current;
					if (d === null) return;
					const dx = ev.clientX - d.startX;
					const dy = ev.clientY - d.startY;
					if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
					d.moved = true;
					// 竖直：上＝会话区顶，下＝窗口底 − 胶囊高度
					const maxTop = Math.max(minTop, vh - d.pillH);
					d.lastTop = Math.round(Math.max(minTop, Math.min(d.startTop + dy, maxTop)));
					// 水平：向左拖离边缘超过 24px 视为"拖出停靠"
					d.leaving = dx < -24;
					const maxLeft = Math.max(0, vw - d.pillW);
					d.lastLeft = Math.round(Math.max(0, Math.min(d.startLeft + dx, maxLeft)));
					setLive({ top: d.lastTop, left: d.lastLeft, leaving: d.leaving });
					schedule();
				};
				const onUp = () => {
					const d = dragRef.current;
					dragRef.current = null;
					cancelFrame();
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					window.removeEventListener("pointercancel", onUp);
					hideShield();
					setLive(null);
					if (d === null) return;
					if (d.moved !== true) {
						// 没移动＝点击：展开回停靠面板（点击语义在这里判定，避免"拖过之后
						// 下一次点击被吞掉"的残留状态）
						prefsActions.patch({ collapsed: false });
						return;
					}
					if (d.leaving === true) {
						// 拖离边缘：松手变成悬浮窗口，位置落在胶囊被拖到的地方
						commitData((dd) => {
							const current = dd.settings.window ?? {};
							dd.settings.window = {
								...current,
								x: Math.round(d.lastLeft),
								y: Math.round(d.lastTop),
								expanded: current.expanded !== false,
								width: typeof current.width === "number" && Number.isFinite(current.width) ? current.width : 360,
								height: typeof current.height === "number" && Number.isFinite(current.height) ? current.height : Math.min(560, vh - 32),
								dock: null,
								pillTop: Math.round(d.lastTop),
							};
						});
						prefsActions.patch({ collapsed: false });
						return;
					}
					commitPillTop(d.lastTop);
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
				window.addEventListener("pointercancel", onUp);
			};
			// 键盘触发（Enter/Space）没有 pointer 事件，此时 detail === 0，按点击处理
			const onClick = (e) => {
				if (e.detail === 0) prefsActions.patch({ collapsed: false });
			};
			return jxs("button", {
				type: "button",
				className: "kidc_dockPill",
				style: { top, left: liveLeft === null ? "auto" : liveLeft, right: liveLeft === null ? 0 : "auto" },
				title: t("pillDragHint"),
				onPointerDown,
				onClick,
				children: [
					jx("span", { className: "kidc_brand", children: "📋" }),
					jx("span", { className: "kidc_dockPillArrow", children: "◂" }),
					jx("span", { className: "kidc_dockPillText", children: t("title") }),
				],
			});
		}

		/** 右下角拖拽改窗口宽高（浮动双向；dock 时左缘分隔条只调宽度）。 */
		/** 缩放把手。拖动期间**不写 store**：只更新 liveResize 并把尺寸直接写到 DOM
		 * （外加停靠挤出的 margin），用 rAF 节流到每帧一次；松手时才 commit 一次。
		 * 之前每帧 commit 一次 → 每帧深拷贝整个 state + 序列化写 localStorage + 发
		 * PUT，state 里还有会话记录的 records/transcript，拖起来自然卡。 */
		function ResizeHandle({ t, data, docked, edge }) {
			// 左侧竖列模式：停靠时本来如此；浮动时也能由设置切换（避免右下角被其它插件遮挡）
			const edgeMode = docked === true || edge === true;
			const active = useRef(false);
			const dragRef = useRef(null);
			const frameRef = useRef(0);
			const cancelFrame = () => {
				if (frameRef.current === 0) return;
				try {
					if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRef.current);
					else clearTimeout(frameRef.current);
				} catch { /* noop */ }
				frameRef.current = 0;
			};
			const onPointerDown = (e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				const handleEl = e.currentTarget;
				// pointer capture：拖拽不丢目标，重渲染不失效
				try { handleEl.setPointerCapture(e.pointerId); } catch { /* noop */ }
				const rootEl = typeof handleEl.closest === "function" ? handleEl.closest(".kidc_root") : null;
				liveResize.rootEl = rootEl;
				if (rootEl !== null && rootEl !== undefined) rootEl.classList.add("kidc_resizing");
				const hideShield = showDragShield(edgeMode === true ? "ew-resize" : "nwse-resize");
				const vh0 = typeof window !== "undefined" ? window.innerHeight : 720;
				const baseW = data.settings?.window?.width ?? 360;
				const baseH = data.settings?.window?.height ?? Math.min(560, vh0 - 32);
				const baseX = data.settings?.window?.x ?? 24;
				active.current = true;
				dragRef.current = { startX: e.clientX, startY: e.clientY, baseW, baseH, baseX, lastW: baseW, lastH: baseH, lastX: baseX };
				// 拖动期间：内容宽度锁在起始值 + 内容整体隐藏（只留占位屏），每帧只剩
				// 盒子尺寸变化 → layout/paint 近乎归零，帧率最高；松手立刻恢复。
				if (rootEl !== null && rootEl !== undefined) {
					rootEl.classList.add("kidc_resizing", "kidc_resizingW");
					rootEl.style.setProperty("--kidc-lock-w", baseW + "px");
					liveResize.ghostValueEl = typeof rootEl.querySelector === "function" ? rootEl.querySelector(".kidc_resizeGhostValue") : null;
				}
				liveResize.width = baseW;
				liveResize.height = docked === true ? null : baseH;
				let lastInsetAt = 0;
				const INSET_MS = 90;
				const paint = (force) => {
					frameRef.current = 0;
					const d = dragRef.current;
					if (!active.current || d === null) return;
					const el = liveResize.rootEl;
					if (el !== null && el !== undefined) {
						// 面板每帧跟手；内容此时已隐藏，只剩盒子尺寸在变 → 近乎零重排
						el.style.width = d.lastW + "px";
						if (docked !== true) el.style.height = d.lastH + "px";
						// 浮动 + 左侧竖列：左边界跟随指针（右边界保持不动）
						if (docked !== true && edge === true) el.style.left = d.lastX + "px";
					}
					// 拖动占位屏：显示实时尺寸
					const ghostValue = liveResize.ghostValueEl;
					if (ghostValue !== null && ghostValue !== undefined) {
						ghostValue.textContent = docked === true ? d.lastW + " px" : d.lastW + " × " + d.lastH;
					}
					// 左侧会话区联动：每帧改它的宽度会让整棵会话 DOM（含消息列表）
					// 重排，是卡顿主因。这里按时间节流（~90ms 一次），既能一起拉动，
					// 又把重排次数降一个数量级；松手时再强制对齐到最终宽度。
					if (docked === true) {
						const now = Date.now();
						if (force === true || now - lastInsetAt >= INSET_MS) {
							lastInsetAt = now;
							applyDockInsetWidth(d.lastW);
						}
					}
				};
				const schedule = () => {
					if (frameRef.current !== 0) return;
					try {
						frameRef.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : setTimeout(paint, 16);
					} catch {
						frameRef.current = 0;
						paint();
					}
				};
				const onMove = (ev) => {
					const d = dragRef.current;
					if (!active.current || d === null) return;
					const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
					const vh = typeof window !== "undefined" ? window.innerHeight : 720;
					const raw = ev.clientX - d.startX;
					if (docked === true) {
						// 停靠：向左侧拖 = 加宽（右端固定）
						d.lastW = Math.round(Math.max(280, Math.min(d.baseW - raw, vw - 16)));
					} else if (edge === true) {
						// 浮动 + 左侧竖列：左边界跟随指针，宽度反向变化（右边界固定）
						d.lastW = Math.round(Math.max(280, Math.min(d.baseW - raw, vw - 16)));
						d.lastX = Math.round(Math.max(0, Math.min(d.baseX + raw, vw - d.lastW - 8)));
					} else {
						d.lastW = Math.round(Math.max(280, Math.min(d.baseW + raw, vw - 16)));
						d.lastH = Math.round(Math.max(200, Math.min(d.baseH + (ev.clientY - d.startY), Math.min(960, vh - 32))));
					}
					liveResize.width = d.lastW;
					liveResize.height = docked === true ? null : d.lastH;
					if (docked !== true && edge === true) liveResize.x = d.lastX;
					schedule();
				};
				const finish = (ev) => {
					const d = dragRef.current;
					active.current = false;
					dragRef.current = null;
					cancelFrame();
					try {
						if (ev !== undefined && ev !== null && ev.pointerId !== undefined) handleEl.releasePointerCapture?.(ev.pointerId);
					} catch { /* noop */ }
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", finish);
					window.removeEventListener("pointercancel", finish);
					const rootEl = liveResize.rootEl;
					if (rootEl !== null && rootEl !== undefined) {
						rootEl.classList.remove("kidc_resizing", "kidc_resizingW");
						rootEl.style.removeProperty("--kidc-lock-w");
					}
					liveResize.ghostValueEl = null;
					hideShield();
					// 松手先把左侧挤出对齐到最终宽度，再落库（store 变化后 effect 也会再对齐一次）
					if (d !== null && docked === true) applyDockInsetWidth(d.lastW);
					// 只在松手时落库一次（commit 会触发 effect 把挤出调到最终宽度）
					if (d !== null) {
						if (docked === true) commitWindowSize(d.lastW, undefined);
						else if (edge === true) commitWindowSize(d.lastW, d.lastH, d.lastX);
						else commitWindowSize(d.lastW, d.lastH);
					}
					liveResize.rootEl = null;
					liveResize.width = null;
					liveResize.height = null;
					liveResize.x = null;
					liveResize.y = null;
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", finish);
				window.addEventListener("pointercancel", finish);
			};
			return jx("div", {
				className: "kidc_resizeHandle" + (edgeMode === true ? " kidc_resizeHandleDock" : ""),
				title: t("resizeHint"),
				onPointerDown,
				// 竖列模式无图标（避免顶部弧形干扰）
				children: edgeMode === true ? null : jx(_primitives.IconPanelLeftOutline16, { size: 12 }),
			});
		}

		/** 持久化窗口宽高（可选同时更新 x）到 settings.window。 */
		function commitWindowSize(widthValue, heightValue, xValue) {
			commitData((d) => {
				const current = d.settings.window ?? {};
				d.settings.window = {
					x: typeof xValue === "number" ? Math.round(xValue) : (typeof current.x === "number" ? current.x : 24),
					y: typeof current.y === "number" ? current.y : 96,
					expanded: current.expanded !== false,
					width: widthValue,
					// dock 模式（heightValue 为 undefined）保留当前高度，不改写
					...(heightValue === undefined
						? { height: typeof current.height === "number" && Number.isFinite(current.height) ? current.height : Math.min(560, (typeof window !== "undefined" ? window.innerHeight : 720) - 32) }
						: { height: heightValue }),
					// 保留 dock 状态（缩放不退出停靠）
					...(typeof current.dock === "string" ? { dock: current.dock } : {}),
				};
			});
		}

		function Launcher({ wide, t }) {
			return jx(_primitives.Tooltip, {
				label: t("launcher"),
				delayMs: 500,
				disabled: wide,
				children: jx(_primitives.Button, {
					variant: "ghost",
					className: "kidc_launcher",
					"data-wide": wide,
					"aria-label": t("launcher"),
					icon: jx(_primitives.IconCopyOutline16, { size: wide ? 16 : 18 }),
					onClick: () => {
						prefs.actions.patch({ open: !prefs.getSnapshot().open, collapsed: false });
					},
					children: wide ? t("launcher") : null,
				}),
			});
		}

		//#region settings page (Kidai Hub tab first; settings.section fallback)
		function Toggle({ checked, onChange }) {
			return jx("button", {
				type: "button",
				className: "kidc_toggle",
				"data-active": checked === true,
				"aria-pressed": checked === true,
				onClick: () => onChange(checked !== true),
			});
		}

		function updateUiSettings(patch) {
			commitData((d) => {
				d.settings = d.settings ?? {};
				d.settings.ui = { ...(d.settings.ui ?? {}), ...patch };
			});
		}

		function resetWindowPosition(app) {
			commitData((d) => {
				d.settings = d.settings ?? {};
				const cur = d.settings.window ?? {};
				d.settings.window = {
					x: 24, y: 96, expanded: true,
					width: typeof cur.width === "number" && Number.isFinite(cur.width) ? cur.width : 360,
					height: typeof cur.height === "number" && Number.isFinite(cur.height) ? cur.height : Math.min(560, (typeof window !== "undefined" ? window.innerHeight : 720) - 32),
				};
			});
			prefs.actions.patch({ collapsed: false });
			app.notify("settingsResetPositionDone");
		}

		/** 设置页布局：Hub 页签用「左侧品牌栏 + 右侧主区」，设置页回退用「横向品牌头部」
		 * （与「纪代备份」kidai-snapshot-guard 的 ksg-layout / ksg-head 一致）。 */
		function SettingsPanel({ t, layout }) {
			const app = useApp();
			const data = useData();
			const ui = (data.settings?.ui ?? {});
			const [armed, setArmed] = useState(false);
			const [tab, setTab] = useState("general");
			useEffect(() => {
				if (armed === true) {
					const timer = setTimeout(() => setArmed(false), 3000);
					return () => clearTimeout(timer);
				}
			}, [armed]);
			const inputs = data.entries.filter((e) => e.kind === "input").length;
			const sessions = data.entries.filter((e) => e.kind === "session").length;
			const clearAll = () => {
				if (armed !== true) {
					setArmed(true);
					return;
				}
				commitData((d) => {
					d.entries = [];
					d.folders = [];
					d.tags = [];
					d.settings = d.settings ?? {};
					d.settings.window = { x: 24, y: 96, expanded: true };
				});
				prefs.actions.patch({ selected: [], selectMode: false, sessionModal: null, editorVisible: false, editor: null, folderModal: false, folderEditor: null, tagModal: false });
				setArmed(false);
				app.notify("settingsCleared");
			};
			const panels = {
				general: jxs("section", { className: "kidc_setCard", children: [
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsShortcut") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsShortcutDesc") }),
							]}),
							jx(Toggle, { checked: ui.shortcutEnabled !== false, onChange: (value) => updateUiSettings({ shortcutEnabled: value }) }),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsResizeHandle") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsResizeHandleDesc") }),
							]}),
							jx("select", {
								className: "kidc_select",
								value: ui.resizeHandle === "edge" ? "edge" : "corner",
								onChange: (e) => updateUiSettings({ resizeHandle: e.target.value }),
								children: [
									jx("option", { value: "corner", children: t("resizeHandleCorner") }),
									jx("option", { value: "edge", children: t("resizeHandleEdge") }),
								],
							}),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsActionBar") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsActionBarDesc") }),
							]}),
							jx("select", {
								className: "kidc_select",
								value: ui.actionBar === "left" ? "left" : "bottom",
								onChange: (e) => updateUiSettings({ actionBar: e.target.value }),
								children: [
									jx("option", { value: "bottom", children: t("actionBarBottom") }),
									jx("option", { value: "left", children: t("actionBarLeft") }),
								],
							}),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsResetPosition") }),
							]}),
							jx("button", { type: "button", className: "kidc_setBtn", onClick: () => resetWindowPosition(app), children: t("settingsResetPosition") }),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsRestartWidget") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsRestartWidgetDesc") }),
							]}),
							jx("button", { type: "button", className: "kidc_setBtn", onClick: () => restartWidgetWidget(), children: t("settingsRestartWidget") }),
						]}),
					]}),
				capture: jxs("section", { className: "kidc_setCard", children: [
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsMaxRecords") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsMaxRecordsDesc") }),
							]}),
							jxs("select", {
								className: "kidc_select",
								value: String(typeof ui.maxRecords === "number" && ui.maxRecords > 0 ? ui.maxRecords : 6000),
								onChange: (e) => updateUiSettings({ maxRecords: Number(e.target.value) }),
								children: [1000, 2000, 4000, 6000, 10000].map((value) => jx("option", { key: value, value: String(value), children: String(value) })),
							}),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsIncludeTools") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsIncludeToolsDesc") }),
							]}),
							jx(Toggle, { checked: ui.includeTools !== false, onChange: (value) => updateUiSettings({ includeTools: value }) }),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsIncludeHeaders") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsIncludeHeadersDesc") }),
							]}),
							jx(Toggle, { checked: ui.includeHeaders !== false, onChange: (value) => updateUiSettings({ includeHeaders: value }) }),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("manageTags") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsManageTagsDesc") }),
							]}),
							jx("button", { type: "button", className: "kidc_setBtn", onClick: () => prefs.actions.patch({ tagModal: true }), children: t("manageTags") }),
						]}),
					]}),
				data: jxs("section", { className: "kidc_setCard", children: [
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsDataStats", { inputs, sessions, folders: data.folders.length, tags: data.tags.length }) }),
								jx("div", { className: "kidc_setDesc", children: t("settingsStoragePath") }),
							]}),
						]}),
						jxs("div", { className: "kidc_setRow", children: [
							jxs("div", { className: "kidc_setText", children: [
								jx("div", { className: "kidc_setTitle", children: t("settingsClear") }),
								jx("div", { className: "kidc_setDesc", children: t("settingsClearDesc") }),
							]}),
							jx("button", {
								type: "button",
								className: "kidc_setBtn",
								"data-active": armed === true,
								onClick: clearAll,
								children: armed === true ? t("settingsClearConfirm") : t("settingsClear"),
							}),
						]}),
					]}),
					about: jxs("section", { className: "kidc_setCard", children: [
					jx("div", { className: "kidc_setHint", children: t("settingsVersion", { version: PLUGIN_VERSION }) }),
					jx("div", { className: "kidc_setHint", children: t("settingsAboutDesc") }),
				]}),
			};
			const tabDefs = [
				["general", t("settingsGeneral")],
				["capture", t("settingsCapture")],
				["data", t("settingsData")],
				["about", t("settingsAbout")],
			];
			// 品牌信息：Hub 用左侧栏（含副标题），设置页用横向头部
			const brand = (compact) => jxs("div", { className: compact === true ? "kidc_brandHead" : "kidc_brandRail", children: [
				jx("div", { className: "kidc_brandLogo", children: "KCB" }),
				jxs("div", { style: { minWidth: 0 }, children: [
					jx("div", { className: "kidc_brandTitle", children: t("title") }),
					jx("div", { className: "kidc_brandSub", children: t("settingsBrandSub", { inputs, sessions, folders: data.folders.length, tags: data.tags.length }) }),
				]}),
			]});
			const main = jxs("div", { className: "kidc_mainCol", children: [
				jx("div", { className: "kidc_statChips", children: [
					jx("span", { className: "kidc_statChip", children: t("settingsDataStats", { inputs, sessions, folders: data.folders.length, tags: data.tags.length }) }),
					jx("span", { className: "kidc_statChip", children: t("settingsVersion", { version: PLUGIN_VERSION }) }),
				]}),
				jx("div", { className: "kidc_tabBar", children: tabDefs.map((pair) => jx("button", {
					key: pair[0],
					type: "button",
					className: "kidc_tabBtn",
					"data-active": tab === pair[0],
					onClick: () => setTab(pair[0]),
					children: pair[1],
				})) }),
				panels[tab] ?? panels.general,
			]});
			return jx("div", {
				className: "kidc_settingsRoot",
				children: layout === "hub"
					? jxs("div", { className: "kidc_layoutRow", children: [brand(false), main] })
					: jxs("div", { className: "kidc_classicCol", children: [brand(true), main] }),
			});
		}
		//#endregion
		//#endregion

		//#region plugin body
		const inject = ["slots", "locale", "sessions", "remote", "remote.session", "conversation"];
		/** Mount the clipboard: launcher + floating window + modals. */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "kidai-clipboard: dictionaries");

			const app = {
				data: dataStore,
				meta,
				notify: notifyMeta,
			};
			const provide = { app, prefs, dataStore, meta, t, ctx };
			// Server state load: once at mount; localStorage is the fallback.
			void loadServerState();

			// Launcher above the Kidai Hub entry (order 990) and any standalone tools.
			ctx.slots.inject("sidebar.footer.action", () => safeRegister(ctx.slots, {
				name: "sidebar.footer.action",
				id: "kidai-clipboard",
				order: 991,
				label: () => t("launcher"),
				locale: NS,
			}, Launcher));

			// Floating window: a list entry in shell.overlay (root-scoped), always
			// mounted; the store controls visibility/collapse.
			ctx.slots.inject("shell.overlay", () => safeRegister(ctx.slots, {
				name: "shell.overlay",
				id: "kidai-clipboard",
				order: 9,
				locale: NS,
			}, function OverlayEntry(props) {
				void props;
				// Remount everything when restartEpoch bumps (脱离卡死).
				const epoch = react.useSyncExternalStore(
					(cb) => meta.subscribe(cb),
					() => meta.getSnapshot(),
					() => meta.getSnapshot()
				).restartEpoch ?? 0;
				return jx(OverlayBoundary, { key: "k" + String(epoch), provide, children: jx(ClipboardWindow, { t: provide.t, ctx: provide.ctx }) });
			}));

			// 助手消息操作行入口：每条回复下方那排图标（复制/赞/踩/重试…）
			// 里追加一个「保存会话分支」，点击后打开分支点选择器并默认定位到
			// 该条回复所在的轮次。
			ctx.slots.inject("conversation.chat.assistant-actions", () => safeRegister(ctx.slots, {
				name: "conversation.chat.assistant-actions",
				id: "kidai-clipboard",
				order: 40,
				locale: NS,
				inject: (sessionId) => ({
					openCapture: (focusMessageId, focusTurn) => beginCapture(ctx, t, sessionId, focusMessageId, focusTurn),
				}),
			}, KcbAssistantAction));

			// Settings page — Kidai Hub tab first. The hub-tabs slot stays
			// undeclared when kidai-hub is absent, so this inject simply never
			// fires; the settings.section fallback below covers that case (and is
			// torn down reactively the moment the Hub appears).
			ctx.slots.inject("kidai-hub.tabs", () => safeRegister(ctx.slots, {
				name: "kidai-hub.tabs",
				key: "kidai-clipboard",
				order: 60,
				label: () => t("settingsTitle"),
				locale: NS,
				inject: () => ({})
			}, function SettingsHubTab(props) {
				void props;
				return jx(AppCtxProvider, { value: provide, children: jx(SettingsPanel, { t: provide.t, layout: "hub" }) });
			}));

			// Settings fallback: register「剪贴板设置」in 设置 only when the Hub is
			// absent (mirrors kidai-snapshot-guard's authoritative pattern).
			ctx.slots.inject("settings.section", () => {
				let entry = null;
				const ensure = () => {
					const hub = ctx.slots.spec("kidai-hub.tabs") !== undefined;
					if (hub) {
						if (entry) { entry(); entry = null; }
					} else if (entry === null) {
						entry = safeRegister(ctx.slots, {
							name: "settings.section",
							id: "kidai-clipboard",
							order: 50,
							label: () => t("settingsTitle"),
							locale: NS,
						}, function SettingsSectionEntry(props) {
							void props;
							return jx(AppCtxProvider, { value: provide, children: jx(SettingsPanel, { t: provide.t, layout: "classic" }) });
						});
					}
				};
				ensure();
				const off = ctx.slots.subscribe("kidai-hub.tabs", ensure);
				return () => {
					off();
					if (entry) entry();
				};
			});

			// Global shortcuts: Ctrl/Cmd+Shift+K toggles the window (configurable).
			const onKey = (event) => {
				const ui = dataStore.getSnapshot().settings?.ui ?? {};
				if (ui.shortcutEnabled === false) return;
				if ((event.ctrlKey === true || event.metaKey === true) && event.shiftKey === true && (event.key === "k" || event.key === "K")) {
					event.preventDefault();
					const current = prefs.getSnapshot();
					prefs.actions.patch({ open: !current.open, collapsed: false });
				}
			};
			window.addEventListener("keydown", onKey);
			ctx.effect(() => () => {
				window.removeEventListener("keydown", onKey);
			}, "kidai-clipboard: key handlers");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
