import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Only adapt the exact pinned browser bundle. Model selection remains owned by
// DSH's per-session directory and its Host RPC, including reasoning effort.
const NAME = '@deepseek-ai/dsh-client-ui-model-selection'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '4e6bd5d556836d086a329413967ad0a9dfb3a0a0bebe2863a9b073ab09db686d'
const PATCHED_SHA256 = '60b395bc942e5f67443ca5004747999dd15610668093ee53c1cd4b830c8a6333'
const COMPONENT_START = '\t\tfunction ModelSelect('
const COMPONENT_END = '\n\t\t//#endregion\n\t\t//#region lib/types/client/locales.js'

// Synara's MIT-licensed provider glyphs (see THIRD_PARTY_NOTICES.md).
const OPENAI_ICON = 'M9.79648 9.34799V7.49548C9.79648 7.33946 9.85502 7.22239 9.99146 7.14447L13.7161 4.9995C14.2231 4.70702 14.8276 4.57058 15.4515 4.57058C17.7915 4.57058 19.2736 6.38413 19.2736 8.31455C19.2736 8.451 19.2736 8.60703 19.254 8.76305L15.393 6.501C15.159 6.36456 14.925 6.36456 14.691 6.501L9.79648 9.34799ZM18.4935 16.5631V12.1364C18.4935 11.8634 18.3764 11.6684 18.1425 11.5319L13.248 8.68494L14.847 7.76838C14.9834 7.69046 15.1005 7.69046 15.237 7.76838L18.9615 9.91336C20.0342 10.5374 20.7555 11.8634 20.7555 13.1503C20.7555 14.6322 19.8782 15.9973 18.4935 16.5628V16.5631ZM8.64599 12.663L7.04699 11.7271C6.91054 11.6492 6.85201 11.5321 6.85201 11.3761V7.08614C6.85201 4.99968 8.45101 3.42007 10.6156 3.42007C11.4346 3.42007 12.195 3.69316 12.8386 4.18061L8.99717 6.40369C8.76323 6.54015 8.64617 6.73513 8.64617 7.00822V12.6632L8.64599 12.663ZM12.0878 14.652L9.79648 13.3651V10.6351L12.0878 9.34818L14.3789 10.6351V13.3651L12.0878 14.652ZM13.56 20.5801C12.741 20.5801 11.9806 20.307 11.3369 19.8196L15.1784 17.5964C15.4123 17.46 15.5294 17.2651 15.5294 16.992V11.3369L17.148 12.2729C17.2845 12.3508 17.3429 12.4679 17.3429 12.6239V16.9139C17.3429 19.0003 15.7243 20.5801 13.56 20.5801ZM8.93846 16.2316L5.21387 14.0866C4.14128 13.4625 3.41989 12.1366 3.41989 10.8497C3.41989 9.34818 4.31688 8.00269 5.70131 7.43713V11.8831C5.70131 12.1562 5.81838 12.3512 6.05232 12.4876L10.9274 15.315L9.32842 16.2316C9.19196 16.3096 9.0749 16.3096 8.93846 16.2316ZM8.72408 19.4297C6.52057 19.4297 4.90201 17.772 4.90201 15.7246C4.90201 15.5685 4.92158 15.4125 4.94097 15.2565L8.78243 17.4796C9.01637 17.616 9.2505 17.616 9.48444 17.4796L14.3789 14.6522V16.5047C14.3789 16.6607 14.3204 16.7777 14.1839 16.8557L10.4593 19.0007C9.95233 19.2931 9.3478 19.4297 8.72391 19.4297H8.72408ZM13.56 21.75C15.9195 21.75 17.8889 20.073 18.3376 17.85C20.5215 17.2844 21.9256 15.2369 21.9256 13.1505C21.9256 11.7855 21.3406 10.4595 20.2876 9.50401C20.3851 9.09448 20.4437 8.68494 20.4437 8.27559C20.4437 5.48714 18.1816 3.4005 15.5686 3.4005C15.0422 3.4005 14.5351 3.47842 14.0281 3.65401C13.1505 2.79599 11.9415 2.25 10.6156 2.25C8.25602 2.25 6.28663 3.92691 5.83795 6.14999C3.65402 6.71555 2.25 8.76305 2.25 10.8495C2.25 12.2146 2.83494 13.5405 3.88796 14.496C3.79046 14.9055 3.73194 15.315 3.73194 15.7244C3.73194 18.5128 5.99397 20.5994 8.60703 20.5994C9.13344 20.5994 9.64047 20.5216 10.1475 20.346C11.0249 21.204 12.2339 21.75 13.56 21.75Z'
const CLAUDE_ICON = 'M5.92405 15.2962L9.85823 13.0903L9.92405 12.8981L9.85823 12.7918H9.66582L9.0076 12.7513L6.75949 12.6906L4.81013 12.6097L2.92152 12.5085L2.44557 12.4073L2 11.8204L2.04557 11.5269L2.44557 11.2588L3.01772 11.3094L4.28354 11.3954L6.18228 11.5269L7.55949 11.6079L9.6 11.8204H9.92405L9.96962 11.6888L9.85823 11.6079L9.77215 11.5269L7.8076 10.1963L5.68101 8.78978L4.56709 7.98027L3.96456 7.57045L3.66076 7.18594L3.52911 6.34607L4.07595 5.74399L4.81013 5.79459L4.99747 5.84518L5.74177 6.4169L7.33165 7.64635L9.4076 9.1743L9.71139 9.42727L9.83291 9.34126L9.8481 9.28055L9.71139 9.05287L8.58228 7.01391L7.37722 4.93954L6.84051 4.07943L6.69873 3.56337C6.6481 3.35087 6.61266 3.17379 6.61266 2.95624L7.23544 2.11131L7.57975 2L8.41013 2.11131L8.75949 2.41487L9.27595 3.59373L10.1114 5.45054L11.4076 7.97521L11.7873 8.72401L11.9899 9.41715L12.0658 9.62965H12.1975V9.50822L12.3038 8.08652L12.5013 6.34101L12.6937 4.09461L12.7595 3.46218L13.0734 2.70326L13.6962 2.29345L14.1823 2.52618L14.5823 3.0979L14.5266 3.46724L14.2886 5.01037L13.8228 7.42879L13.519 9.04781H13.6962L13.8987 8.84543L14.719 7.75765L16.0962 6.03744L16.7038 5.35441L17.4127 4.60056L17.8684 4.24134H18.7291L19.362 5.18239L19.0785 6.15381L18.1924 7.27701L17.4582 8.22818L16.4051 9.64483L15.7468 10.7781L15.8076 10.8692L15.9646 10.854L18.3443 10.3481L19.6304 10.1154L21.1646 9.85226L21.8582 10.1761L21.9342 10.5049L21.6608 11.1778L20.0203 11.5826L18.0962 11.9671L15.2304 12.6451L15.1949 12.6704L15.2354 12.721L16.5266 12.8424L17.0785 12.8728H18.4304L20.9468 13.06L21.6051 13.4951L22 14.0263L21.9342 14.4311L20.9215 14.9471L19.5544 14.6233L16.3646 13.8644L15.2709 13.5912H15.119V13.6823L16.0304 14.5727L17.7013 16.0804L19.7924 18.0233L19.8987 18.5039L19.6304 18.8834L19.3468 18.8429L17.5089 17.4617L16.8 16.8394L15.1949 15.4885H15.0886V15.6302L15.4582 16.1715L17.4127 19.106L17.5139 20.0066L17.3722 20.3L16.8658 20.4771L16.3089 20.3759L15.1646 18.7721L13.9848 16.9658L13.0329 15.3468L12.9165 15.4126L12.3544 21.4586L12.0911 21.7673L11.4835 22L10.9772 21.6155L10.7089 20.9932L10.9772 19.7637L11.3013 18.1599L11.5646 16.8849L11.8025 15.3013L11.9443 14.7751L11.9342 14.7397L11.8177 14.7549L10.6228 16.3941L8.80506 18.848L7.36709 20.386L7.02279 20.5226L6.42532 20.214L6.48101 19.6625L6.81519 19.1718L8.80506 16.642L10.0051 15.0736L10.7797 14.168L10.7747 14.0364H10.7291L5.44304 17.4667L4.50127 17.5882L4.0962 17.2087L4.14684 16.5864L4.33924 16.384L5.92911 15.2912L5.92405 15.2962Z'

// Browser-compatible JSX-runtime code replacing only the pinned model seat.
// Synara supplies the layout; DSH still supplies the catalog and the write path.
const PICKER = String.raw`		function tockteamProviderGlyph(group) {
			const icon = /openai/i.test(group.name) ? "${OPENAI_ICON}" : /anthropic|claude/i.test(group.name) ? "${CLAUDE_ICON}" : null;
			if (icon) return (0, react_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: (0, react_jsx_runtime.jsx)("path", { d: icon }) });
			return group.name;
		}
		function tockteamStarIcon(filled) {
			return (0, react_jsx_runtime.jsx)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, react_jsx_runtime.jsx)("path", { d: "m12 2 3.09 6.26 6.91 1.01-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }) });
		}
		function ModelSelect({ locked, available, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("__current__");
			const [modelQuery, setModelQuery] = (0, react.useState)("");
			const [draftIndex, setDraftIndex] = (0, react.useState)(null);
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
			const effortCommitRef = (0, react.useRef)(null);
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
			const previewIndex = draftIndex ?? effortIndex;
			const previewLabel = effortChoices[previewIndex]?.label ?? t("effort.unavailable");
			const busy = state.status === "selecting";
			(0, react.useEffect)(() => { if (!busy && draftIndex !== null && effortIndex === draftIndex) setDraftIndex(null); }, [busy, draftIndex, effortIndex]);
			(0, react.useEffect)(() => { setDraftIndex(null); }, [state.current?.provider, state.current?.model]);
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
				setDraftIndex(null);
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
				setDraftIndex(null);
				lastActionRef.current = "select";
				const model = choices.find((choice) => choice.selection.provider === selection.provider && choice.selection.model === selection.model)?.model;
				select({ ...selection, ...model?.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort } })
					.then((accepted) => settleSelection(accepted, model?.reasoning?.efforts.length > 0));
			};
			const chooseEffort = (effort) => {
				if (busy) return;
				if (state.current === null || effectiveEffort === effort) { setDraftIndex(null); return; }
				const nextIndex = effortChoices.findIndex((level) => level.effort === effort);
				if (effortCommitRef.current === nextIndex) return;
				effortCommitRef.current = nextIndex;
				setDraftIndex(nextIndex);
				lastActionRef.current = "select";
				select({ provider: state.current.provider, model: state.current.model, ...effort === void 0 ? {} : { reasoningEffort: effort } })
					.then((accepted) => { effortCommitRef.current = null; if (!accepted) setDraftIndex(null); settleSelection(accepted, true); });
			};
			const commitEffort = (value) => {
				const next = effortChoices[Number(value)];
				if (next !== void 0) chooseEffort(next.effort);
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
					"aria-label": state.current === null ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", { model: modelLabel, effort: effortLabel }),
					"aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": open ? id + "-menu" : void 0,
					title: triggerLabel, disabled: locked, onClick: () => open ? close() : show(), children: [
						(0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.triggerLabel, children: modelLabel }),
						effortLabel !== void 0 && (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.triggerEffort, children: effortLabel }),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(ModelSelect_module_css_default.chevron, open && ModelSelect_module_css_default.chevronOpen) })
					]
				}),
				open && (0, react_jsx_runtime.jsxs)("div", { id: id + "-menu", className: clsx(ModelSelect_module_css_default.menu, "tockteam-model-picker"), role: "dialog", "aria-label": t("menu.aria"), "aria-busy": state.status === "loading" || busy, children: [
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_tabs", children: [
						(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_tabButtons", role: "tablist", "aria-label": t("menu.sources"), children: [
							(0, react_jsx_runtime.jsx)("button", { type: "button", id: id + "-tab-0", role: "tab", className: "_7KE1Ra_tab", "aria-selected": activeTab === null, tabIndex: activeTab === null ? 0 : -1, "aria-label": t("menu.starred"), title: t("menu.starred"), onClick: () => { setTab(null); setModelQuery(""); }, children: tockteamStarIcon(true) }),
							state.groups.map((group, index) => (0, react_jsx_runtime.jsx)("button", { type: "button", id: id + "-tab-" + (index + 1), role: "tab", className: "_7KE1Ra_tab", "aria-selected": activeTab === group.id, tabIndex: activeTab === group.id ? 0 : -1, "aria-label": group.name, title: group.name, onClick: () => { setTab(group.id); setModelQuery(""); }, children: tockteamProviderGlyph(group) }, group.id))
						] }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", className: "_7KE1Ra_tab", "aria-label": t("menu.addProviders"), title: t("menu.addProviders"), onClick: () => { close(); (document.querySelector('.tockteam-app-rail button[aria-label="Settings"]') ?? document.querySelector('[data-slot="settings.trigger"]')?.closest("button"))?.click(); }, children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }) })
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
					(0, react_jsx_runtime.jsx)("div", { className: clsx(ModelSelect_module_css_default.groups, "scrollable"), role: "tabpanel", "aria-labelledby": id + "-tab-" + (activeTab === null ? 0 : state.groups.findIndex((group) => group.id === activeTab) + 1), children: visibleGroups.map((group) => (0, react_jsx_runtime.jsx)("section", { className: ModelSelect_module_css_default.group, children: group.models.map((model) => {
						const selected = state.current?.provider === group.id && state.current.model === model.id;
						const starred = favoritesSet.has(JSON.stringify([group.id, model.id]));
						const index = visibleChoices.findIndex((choice) => choice.provider === group.id && choice.model === model.id);
						return (0, react_jsx_runtime.jsxs)("div", { className: clsx("_7KE1Ra_row", selected && ModelSelect_module_css_default.selected), children: [
							(0, react_jsx_runtime.jsx)("button", { ref: itemRef(), type: "button", className: ModelSelect_module_css_default.option, "aria-current": selected ? "true" : void 0, title: model.name, "aria-disabled": busy || void 0, onClick: () => choose({ provider: group.id, model: model.id }), children: (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.optionCopy, children: (0, react_jsx_runtime.jsx)("span", { className: ModelSelect_module_css_default.modelName, children: model.name }) }) }),
							index < 9 && (0, react_jsx_runtime.jsx)("span", { className: "_7KE1Ra_hint", "aria-hidden": true, children: (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ") + (index + 1) }),
							(0, react_jsx_runtime.jsx)("button", { type: "button", className: "_7KE1Ra_star", "aria-pressed": starred, "aria-label": t(starred ? "action.unstar" : "action.star", { model: model.name }), title: t(starred ? "action.unstar" : "action.star", { model: model.name }), onClick: () => toggleFavorite(group, model), children: tockteamStarIcon(starred) })
						] }, model.id);
					}) }, group.id)) }),
					state.status === "ready" && visibleChoices.length === 0 && (0, react_jsx_runtime.jsx)("div", { className: ModelSelect_module_css_default.empty, role: "status", children: choices.length === 0 ? t("empty.models") : normalizedQuery !== "" ? t("empty.search") : t("empty.favorites") }),
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_footer", children: [
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_effortTop", children: [
						(0, react_jsx_runtime.jsx)("span", { children: t("menu.effort") }),
						(0, react_jsx_runtime.jsx)("strong", { children: previewLabel }),
						effortChoices.length > 0 && (0, react_jsx_runtime.jsx)("button", { type: "button", className: "_7KE1Ra_reset", "aria-label": t("action.resetEffort"), title: t("action.resetEffort"), disabled: busy || effectiveEffort === reasoning.defaultEffort, onClick: () => chooseEffort(reasoning.defaultEffort), children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {}) })
					] }),
					(0, react_jsx_runtime.jsxs)("div", { className: "_7KE1Ra_sliderWrap", style: { "--effort-progress": "calc(11.5px + (100% - 23px) * " + (previewIndex / Math.max(1, effortChoices.length - 1)) + ")" }, children: [
						(0, react_jsx_runtime.jsx)("div", { className: "_7KE1Ra_marks", "aria-hidden": true, children: effortChoices.map((_, index) => (0, react_jsx_runtime.jsx)("span", {}, index)) }),
						(0, react_jsx_runtime.jsx)("input", { type: "range", className: "_7KE1Ra_slider", min: 0, max: Math.max(1, effortChoices.length - 1), step: 1, value: previewIndex, disabled: effortChoices.length < 2, "aria-disabled": busy || void 0, "aria-label": t("menu.effort"), "aria-valuetext": previewLabel, onChange: (event) => { if (!busy) setDraftIndex(Number(event.currentTarget.value)); }, onPointerUp: (event) => commitEffort(event.currentTarget.value), onKeyUp: (event) => { if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) commitEffort(event.currentTarget.value); }, onBlur: (event) => { if (draftIndex !== null) commitEffort(event.currentTarget.value); }, onPointerCancel: () => setDraftIndex(null) })
					] })
				] })
				] }),
				toast !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, { text: toast.text, icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {}), anchor: rootRef.current?.closest("[data-composer-card]") ?? null, onDone: () => setToast(null) }, toast.seq)
			] });
		}
`

const TRANSLATIONS = [
  ['"menu.effort": "推理等级",', '"menu.effort": "推理等级",\n\t\t\t"effort.unavailable": "不可调整",'],
  ['"menu.effort": "Effort",', '"menu.effort": "Reasoning Level",\n\t\t\t"effort.unavailable": "Not Available",'],
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
