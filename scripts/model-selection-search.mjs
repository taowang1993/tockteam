import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Only adapt the exact pinned browser bundle. Model selection remains owned by
// DSH's per-session directory and its Host RPC, including reasoning effort.
const NAME = '@deepseek-ai/dsh-client-ui-model-selection'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '4e6bd5d556836d086a329413967ad0a9dfb3a0a0bebe2863a9b073ab09db686d'
const PATCHED_SHA256 = 'b842f494cff821cde8857d90e805639a482307e5af46f323e7420152f50db697'
const STYLE_END = '._7KE1Ra_cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}'
const COMPONENT_START = '\t\tfunction ModelSelect('
const COMPONENT_END = '\n\t\t//#endregion\n\t\t//#region lib/types/client/locales.js'

// Synara's compact single-panel geometry, applied only to DSH's model seat.
const PICKER_CSS = String.raw`
._7KE1Ra_menu{box-sizing:border-box;width:min(268px,calc(100vw - 24px));min-width:0;max-width:none;max-height:min(360px,calc(100vh - 44px));padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:15px;box-shadow:var(--dsw-elevation-prominent);backdrop-filter:blur(24px)}
._7KE1Ra_tabs{display:flex;align-items:center;gap:2px;min-height:38px;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto;scrollbar-width:none}
._7KE1Ra_tabs::-webkit-scrollbar{display:none}
._7KE1Ra_tab{position:relative;display:grid;place-items:center;flex:none;width:27px;height:27px;border:0;border-radius:8px;background:none;color:var(--dsw-alias-label-tertiary);font-size:15px;font-weight:600;line-height:1;cursor:pointer}
._7KE1Ra_tab:hover,._7KE1Ra_tab:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);outline:none}
._7KE1Ra_tab[aria-selected=true]{color:var(--dsw-alias-label-primary)}
._7KE1Ra_tab[aria-selected=true]::after{content:'';position:absolute;bottom:-5px;left:8px;right:8px;height:2px;border-radius:2px;background:currentColor}
._7KE1Ra_searchRow{display:flex;align-items:center;gap:7px;height:29px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary)}
._7KE1Ra_searchIcon{flex:none}
._7KE1Ra_search{box-sizing:border-box;flex:1;min-width:0;height:100%;padding:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:400;line-height:1.4}
._7KE1Ra_search::placeholder{color:var(--dsw-alias-label-tertiary)}
._7KE1Ra_searchRow:focus-within{box-shadow:inset 0 -1px 0 var(--dsw-alias-border-l3)}
._7KE1Ra_groups{min-height:80px;max-height:min(200px,35vh);padding:4px;overflow-y:auto;overscroll-behavior:contain}
._7KE1Ra_group+._7KE1Ra_group{margin-top:1px}
._7KE1Ra_groupTitle{display:none}
._7KE1Ra_row{display:flex;align-items:center;min-height:27px;padding-right:3px;border-radius:9px}
._7KE1Ra_row:hover,._7KE1Ra_row:focus-within,._7KE1Ra_row._7KE1Ra_selected{background:var(--dsw-alias-interactive-bg-hover)}
._7KE1Ra_option{flex:1;min-width:0;min-height:27px;padding:2px 7px;border-radius:9px;font-size:12px;font-weight:400}
._7KE1Ra_option:hover:not(:disabled),._7KE1Ra_option:focus-visible{background:transparent}
._7KE1Ra_modelName{font-size:12px;font-weight:400;line-height:19px}
._7KE1Ra_hint{flex:none;padding:1px 3px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}
._7KE1Ra_star{display:grid;place-items:center;flex:none;width:23px;height:23px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:17px;line-height:1;cursor:pointer}
._7KE1Ra_star:hover,._7KE1Ra_star:focus-visible,._7KE1Ra_star[aria-pressed=true]{color:var(--dsw-alias-label-primary);outline:none}
._7KE1Ra_footer{flex:none;padding:6px 9px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
._7KE1Ra_effortTop{display:grid;grid-template-columns:22px 1fr 22px;align-items:center;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
._7KE1Ra_effortTop strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-info,#2e69cc);font-weight:500}
._7KE1Ra_reset{padding:2px;border:0;border-radius:5px;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
._7KE1Ra_reset:hover:not(:disabled),._7KE1Ra_reset:focus-visible{color:var(--dsw-alias-label-primary);outline:1px solid var(--dsw-alias-border-l3)}
._7KE1Ra_reset:disabled{opacity:.35;cursor:default}
._7KE1Ra_sliderWrap{position:relative;height:22px;margin:5px 1px 0;border-radius:14px;background:linear-gradient(to right,var(--dsw-alias-label-info,#2e69cc) var(--effort-progress),var(--dsw-alias-interactive-bg-hover) var(--effort-progress))}
._7KE1Ra_marks{position:absolute;inset:0 10px;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
._7KE1Ra_marks span{width:3px;height:3px;border-radius:50%;background:var(--dsw-specific-menu);opacity:.65}
._7KE1Ra_slider{position:absolute;inset:0;box-sizing:border-box;width:100%;height:22px;margin:0;appearance:none;background:transparent;cursor:pointer}
._7KE1Ra_slider::-webkit-slider-thumb{width:23px;height:23px;appearance:none;border:0;border-radius:50%;background:var(--dsw-specific-menu);box-shadow:0 1px 4px #0003}
._7KE1Ra_slider:focus-visible{outline:2px solid var(--dsw-alias-border-l3);border-radius:14px}
._7KE1Ra_slider:disabled{opacity:.5;cursor:default}
._7KE1Ra_empty{padding:14px 10px}
@media (prefers-reduced-transparency:reduce){._7KE1Ra_menu{backdrop-filter:none}}
`

// Browser-compatible JSX-runtime code replacing only the pinned model seat.
// Synara supplies the layout; DSH still supplies the catalog and the write path.
const PICKER = String.raw`		function ModelSelect({ locked, available, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("__current__");
			const [modelQuery, setModelQuery] = (0, react.useState)("");
			const [favorites, setFavorites] = (0, react.useState)(() => {
				try {
					const stored = JSON.parse(localStorage.getItem("tockteam.model-favorites.v1") ?? "[]");
					return Array.isArray(stored) ? stored.filter((key) => typeof key === "string").slice(0, 50) : [];
				} catch { return []; }
			});
			const lastActionRef = (0, react.useRef)("load");
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group, model, selection: { provider: group.id, model: model.id }
			}))), [state.groups]);
			const currentChoice = choices.find((choice) => choice.selection.provider === state.current?.provider && choice.selection.model === state.current.model);
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortChoices = reasoning === void 0 ? [] : [
				...reasoning.defaultEffort === void 0 ? [{ effort: void 0, label: t("effort.providerDefault") }] : [],
				...reasoning.efforts.map((level) => ({ effort: level.id, label: level.name }))
			];
			const effortIndex = Math.max(0, effortChoices.findIndex((level) => level.effort === effectiveEffort));
			const effortLabel = reasoning === void 0 ? void 0 : effortChoices[effortIndex]?.label ?? t("effort.providerDefault");
			const busy = state.status === "selecting";
			const favoritesSet = new Set(favorites);
			const activeTab = tab === null ? null : state.groups.some((group) => group.id === tab) ? tab : state.current?.provider ?? state.groups[0]?.id ?? null;
			const normalizedQuery = modelQuery.trim().toLowerCase();
			const visibleGroups = (activeTab === null ? state.groups : state.groups.filter((group) => group.id === activeTab)).map((group) => ({
				...group,
				models: group.models.filter((model) => (activeTab !== null || favoritesSet.has(JSON.stringify([group.id, model.id]))) && [group.name, group.id, model.name, model.id].some((value) => value.toLowerCase().includes(normalizedQuery)))
			})).filter((group) => group.models.length > 0);
			const visibleChoices = visibleGroups.flatMap((group) => group.models.map((model) => ({ provider: group.id, model: model.id })));
			const reload = () => { lastActionRef.current = "load"; load(); };
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
				document.addEventListener("mousedown", closeOutside);
				return () => document.removeEventListener("mousedown", closeOutside);
			}, [open]);
			if (!available) return null;
			const show = () => {
				setTab(favorites.length > 0 ? null : "__current__");
				setModelQuery("");
				setOpen(true);
				reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
			};
			const settleSelection = (accepted, keepOpen = false) => {
				if (accepted) { if (!keepOpen && rootRef.current !== null) close(true); return; }
				const message = directory.getSnapshot().error;
				if (message !== null) setToast({ seq: ++toastSeq.current, text: t("error.action", { message }) });
			};
			const choose = (selection) => {
				if (busy) return;
				if (state.current?.provider === selection.provider && state.current.model === selection.model) { close(true); return; }
				lastActionRef.current = "select";
				const model = choices.find((choice) => choice.selection.provider === selection.provider && choice.selection.model === selection.model)?.model;
				select({ ...selection, ...model?.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort } })
					.then((accepted) => settleSelection(accepted, model?.reasoning?.efforts.length > 0));
			};
			const chooseEffort = (effort) => {
				if (state.current === null || busy || effectiveEffort === effort) return;
				lastActionRef.current = "select";
				select({ provider: state.current.provider, model: state.current.model, ...effort === void 0 ? {} : { reasoningEffort: effort } })
					.then((accepted) => settleSelection(accepted, true));
			};
			const toggleFavorite = (group, model) => {
				const key = JSON.stringify([group.id, model.id]);
				const next = favoritesSet.has(key) ? favorites.filter((value) => value !== key) : [...favorites, key].slice(-50);
				setFavorites(next);
				try { localStorage.setItem("tockteam.model-favorites.v1", JSON.stringify(next)); } catch {}
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				const next = active < 0 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length;
				items[next]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (!open) return;
				if (event.key === "Escape") { event.preventDefault(); close(true); return; }
				if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
					event.preventDefault(); event.stopPropagation();
					if (visibleChoices[Number(event.key) - 1]) choose(visibleChoices[Number(event.key) - 1]);
					return;
				}
				if (event.target?.getAttribute("role") === "tab" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
					event.preventDefault();
					const tabs = [null, ...state.groups.map((group) => group.id)];
					const next = (tabs.indexOf(activeTab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
					setTab(tabs[next]);
					rootRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
				} else if (event.target?.type !== "range" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
					event.preventDefault(); moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
				close();
			};
			const modelLabel = currentChoice?.model.name ?? (state.current === null ? t("trigger.fallback") : state.current.provider + "/" + state.current.model);
			const triggerLabel = effortLabel === void 0 ? modelLabel : modelLabel + " · " + effortLabel;
			itemRefs.current = [];
			let itemIndex = 0;
			const itemRef = () => { const at = itemIndex++; return (node) => { itemRefs.current[at] = node; }; };
			return (0, react_jsx_runtime.jsxs)("div", { ref: rootRef, className: ModelSelect_module_css_default.root, onKeyDown: onRootKeyDown, onBlur, children: [
				(0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef, type: "button", className: ModelSelect_module_css_default.trigger,
					"aria-label": state.current === null ? t("trigger.selectAria") : t("trigger.ariaEffort", { model: modelLabel, effort: effortLabel ?? "" }),
					"aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": open ? id + "-menu" : void 0,
					title: triggerLabel, disabled: locked, onClick: () => open ? close() : show(), children: [
						(0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.triggerLabel, children: modelLabel }),
						effortLabel !== void 0 && (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.triggerEffort, children: effortLabel }),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(ModelSelect_module_css_default.chevron, open && ModelSelect_module_css_default.chevronOpen) })
					]
				}),
				open && (0, react_jsx_runtime.jsxs)("div", { id: id + "-menu", className: ModelSelect_module_css_default.menu, role: "dialog", "aria-label": t("menu.aria"), "aria-busy": state.status === "loading" || busy, children: [
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_tabs", role: "tablist", "aria-label": t("menu.sources"), children: [
						(0, react_jsx_runtime.jsx)("button", { type: "button", role: "tab", className: "_7KE1Ra_tab", "aria-selected": activeTab === null, "aria-label": t("menu.starred"), title: t("menu.starred"), onClick: () => { setTab(null); setModelQuery(""); }, children: "★" }),
						state.groups.map((group) => (0, react_jsx_runtime.jsx)("button", { type: "button", role: "tab", className: "_7KE1Ra_tab", "aria-selected": activeTab === group.id, "aria-label": group.name, title: group.name, onClick: () => { setTab(group.id); setModelQuery(""); }, children: /claude|anthropic/i.test(group.name) ? "✳" : /openai/i.test(group.name) ? "◎" : /deepseek/i.test(group.name) ? "◆" : group.name.slice(0, 1).toUpperCase() }, group.id)),
						(0, react_jsx_runtime.jsx)("a", { className: "_7KE1Ra_tab", href: "/settings", "aria-label": t("menu.addProviders"), title: t("menu.addProviders"), children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }) })
					] }),
					(0, react_jsx_runtime.jsxs)("label", { className: "_7KE1Ra_searchRow", children: [
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14, className: "_7KE1Ra_searchIcon" }),
						(0, react_jsx_runtime.jsx)("input", { type: "search", className: "_7KE1Ra_search", "aria-label": t("menu.search"), placeholder: t("menu.searchPlaceholder"), value: modelQuery, autoComplete: "off", spellCheck: false, autoFocus: true, onChange: (event) => setModelQuery(event.currentTarget.value), onKeyDown: (event) => {
							if (event.key === "Enter" && visibleChoices[0]) { event.preventDefault(); choose(visibleChoices[0]); }
						} })
					] }),
					state.status === "loading" && (0, react_jsx_runtime.jsx)("div", { className: ModelSelect_module_css_default.status, children: t("status.loading") }),
					state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", { className: ModelSelect_module_css_default.error, children: [
						(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", className: ModelSelect_module_css_default.retry, onClick: reload, children: t("retry") })
					] }),
					state.failures.map((failure) => (0, react_jsx_runtime.jsxs)("div", { className: ModelSelect_module_css_default.warning, children: [
						(0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", { name: failure.name, message: failure.message }) }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", className: ModelSelect_module_css_default.retry, onClick: reload, children: t("retry") })
					] }, failure.id)),
					(0, react_jsx_runtime.jsx)("div", { className: clsx(ModelSelect_module_css_default.groups, "scrollable"), role: "tabpanel", children: visibleGroups.map((group) => (0, react_jsx_runtime.jsx)("section", { className: ModelSelect_module_css_default.group, children: group.models.map((model) => {
						const selected = state.current?.provider === group.id && state.current.model === model.id;
						const starred = favoritesSet.has(JSON.stringify([group.id, model.id]));
						const index = visibleChoices.findIndex((choice) => choice.provider === group.id && choice.model === model.id);
						return (0, react_jsx_runtime.jsxs)("div", { className: clsx("_7KE1Ra_row", selected && ModelSelect_module_css_default.selected), children: [
							(0, react_jsx_runtime.jsx)("button", { ref: itemRef(), type: "button", className: ModelSelect_module_css_default.option, "aria-current": selected ? "true" : void 0, title: model.name, disabled: busy, onClick: () => choose({ provider: group.id, model: model.id }), children: (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.optionCopy, children: (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.modelName, children: model.name }) }) }),
							index < 9 && (0, react_jsx_runtime.jsx)("span", { className: "_7KE1Ra_hint", "aria-hidden": true, children: (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ") + (index + 1) }),
							(0, react_jsx_runtime.jsx)("button", { type: "button", className: "_7KE1Ra_star", "aria-pressed": starred, "aria-label": t(starred ? "action.unstar" : "action.star", { model: model.name }), title: t(starred ? "action.unstar" : "action.star", { model: model.name }), onClick: () => toggleFavorite(group, model), children: starred ? "★" : "☆" })
						] }, model.id);
					}) }, group.id)) }),
					state.status === "ready" && visibleChoices.length === 0 && (0, react_jsx_runtime.jsx)("div", { className: ModelSelect_module_css_default.empty, role: "status", children: choices.length === 0 ? t("empty.models") : normalizedQuery !== "" ? t("empty.search") : t("empty.favorites") }),
					effortChoices.length > 0 && (0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_footer", children: [
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_effortTop", children: [
						(0, react_jsx_runtime.jsx)("span", { "aria-hidden": true, children: "ϟ" }),
						(0, react_jsx_runtime.jsx)("strong", { children: effortLabel }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", className: "_7KE1Ra_reset", "aria-label": t("action.resetEffort"), title: t("action.resetEffort"), disabled: busy || effectiveEffort === reasoning.defaultEffort, onClick: () => chooseEffort(reasoning.defaultEffort), children: "↶" })
					] }),
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_sliderWrap", style: { "--effort-progress": (effortIndex / Math.max(1, effortChoices.length - 1) * 100) + "%" }, children: [
						(0, react_jsx_runtime.jsx)("div", { className: "_7KE1Ra_marks", "aria-hidden": true, children: effortChoices.map((_, index) => (0, react_jsx_runtime.jsx)("span", {}, index)) }),
						(0, react_jsx_runtime.jsx)("input", { type: "range", className: "_7KE1Ra_slider", min: 0, max: effortChoices.length - 1, step: 1, value: effortIndex, disabled: busy || effortChoices.length < 2, "aria-label": t("menu.effort"), "aria-valuetext": effortLabel, onChange: (event) => chooseEffort(effortChoices[Number(event.currentTarget.value)]?.effort) })
					] })
				] })
				] }),
				toast !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, { text: toast.text, icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {}), anchor: rootRef.current?.closest("[data-composer-card]") ?? null, onDone: () => setToast(null) }, toast.seq)
			] });
		}
`

const TRANSLATIONS = [
  ['"menu.model": "模型",', '"menu.model": "模型",\n\t\t\t"menu.sources": "模型来源",\n\t\t\t"menu.starred": "收藏",\n\t\t\t"menu.addProviders": "添加模型来源",\n\t\t\t"menu.search": "搜索模型",\n\t\t\t"menu.searchPlaceholder": "搜索模型…",\n\t\t\t"action.star": "收藏 {model}",\n\t\t\t"action.unstar": "取消收藏 {model}",\n\t\t\t"action.resetEffort": "恢复默认推理等级",\n\t\t\t"empty.search": "没有匹配的模型。",\n\t\t\t"empty.favorites": "收藏模型后即可在此快速选择。",'],
  ['"menu.model": "Model",', '"menu.model": "Model",\n\t\t\t"menu.sources": "Model Sources",\n\t\t\t"menu.starred": "Starred",\n\t\t\t"menu.addProviders": "Add Providers",\n\t\t\t"menu.search": "Search Models",\n\t\t\t"menu.searchPlaceholder": "Search models…",\n\t\t\t"action.star": "Star {model}",\n\t\t\t"action.unstar": "Remove {model} from Starred",\n\t\t\t"action.resetEffort": "Reset Effort",\n\t\t\t"empty.search": "No matching models.",\n\t\t\t"empty.favorites": "Star a model to pin it here.",'],
]

function sha256(source) { return createHash('sha256').update(source).digest('hex') }
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`${NAME}: pinned model selector shape changed at ${before.slice(0, 40)}; review required`)
  return source.replace(before, after)
}

function adapt(source) {
  const hash = sha256(source)
  if (hash === PATCHED_SHA256) return source
  if (hash !== ORIGINAL_SHA256) throw new Error(`${NAME}: pinned model selector hash changed; review required`)
  const start = source.indexOf(COMPONENT_START)
  const end = source.indexOf(COMPONENT_END, start)
  if (start < 0 || end < 0 || source.indexOf(COMPONENT_START, start + 1) !== -1) throw new Error(`${NAME}: pinned component shape changed; review required`)
  let result = source.slice(0, start) + PICKER + source.slice(end)
  result = replaceOnce(result, STYLE_END + '"', STYLE_END + PICKER_CSS.replace(/\s*\n\s*/g, '') + '"')
  for (const [before, after] of TRANSLATIONS) result = replaceOnce(result, before, after)
  if (sha256(result) !== PATCHED_SHA256) throw new Error(`${NAME}: adapted model selector hash changed; review required`)
  return result
}

export function addModelSelectionSearch(runtimeRoot) {
  const root = realpathSync(runtimeRoot)
  const candidates = [join(root, 'node_modules', NAME)]
  const store = join(root, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@deepseek-ai+dsh-client-ui-model-selection@')) {
        candidates.push(join(store, entry.name, 'node_modules', NAME))
      }
    }
  }
  const packages = [...new Set(candidates.filter(existsSync).map(path => realpathSync(path)))]
  if (packages.length === 0) throw new Error(`${NAME}: pinned staged package missing`)
  const updates = packages.map(packageRoot => {
    const within = relative(root, packageRoot)
    if (within.startsWith('..') || isAbsolute(within)) throw new Error(`${NAME}: package resolves outside staged runtime`)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.name !== NAME || manifest.version !== VERSION || manifest.exports?.['./client']?.default !== './lib/client.js') {
      throw new Error(`${NAME}: unsupported pinned browser export`)
    }
    const path = realpathSync(join(packageRoot, 'lib', 'client.js'))
    const inside = relative(packageRoot, path)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error(`${NAME}: browser export resolves outside staged package`)
    const original = readFileSync(path, 'utf8')
    return { path, original, source: adapt(original) }
  })
  // Validate every staged copy before replacing any; renaming breaks hardlinks.
  for (const { path, original, source } of updates) {
    if (original === source) continue
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, source, { flag: 'wx', mode: statSync(path).mode })
      renameSync(temporary, path)
    } finally { rmSync(temporary, { force: true }) }
  }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('usage: node scripts/model-selection-search.mjs <runtime-root>')
  addModelSelectionSearch(resolve(process.argv[2]))
}
