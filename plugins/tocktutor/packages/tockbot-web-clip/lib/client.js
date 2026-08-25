window.__ModuleLoader__.load({ id: "tockbot-web-clip", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// ../../../ui/src/alert.tsx
var React = __toESM(require("react"), 1);

// ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}

// ../../node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
var cx = clsx;
var cva = (base, config) => (props) => {
  var _config_compoundVariants;
  if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  const { variants, defaultVariants } = config;
  const getVariantClassNames = Object.keys(variants).map((variant) => {
    const variantProp = props === null || props === void 0 ? void 0 : props[variant];
    const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
    if (variantProp === null) return null;
    const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
    return variants[variant][variantKey];
  });
  const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
    let [key, value] = param;
    if (value === void 0) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
  const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
    let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
    return Object.entries(compoundVariantOptions).every((param2) => {
      let [key, value] = param2;
      return Array.isArray(value) ? value.includes({
        ...defaultVariants,
        ...propsWithoutUndefined
      }[key]) : {
        ...defaultVariants,
        ...propsWithoutUndefined
      }[key] === value;
    }) ? [
      ...acc,
      cvClass,
      cvClassName
    ] : acc;
  }, []);
  return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
};

// ../../../ui/src/utils.ts
function cn(...inputs) {
  return clsx(inputs);
}

// ../../../ui/src/alert.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive: "border-destructive/30 bg-destructive/5 text-destructive"
      }
    },
    defaultVariants: { variant: "default" }
  }
);
var Alert = React.forwardRef(function Alert2({ className, variant = "default", unstyled = false, ...props }, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      "data-slot": "alert",
      role: "alert",
      className: unstyled ? className : cn(alertVariants({ variant, className })),
      ref,
      ...props
    }
  );
});

// ../../../ui/src/button.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline: "border-border bg-background text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*=size-])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*=size-])]:size-3.5",
        lg: "h-9 gap-1.5 px-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*=size-])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant = "default",
  size = "default",
  unstyled = false,
  ...props
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: unstyled ? className : cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}

// ../../../ui/src/card.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function Card({ className, unstyled = false, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { "data-slot": "card", className: unstyled ? className : cn("flex flex-col gap-4 rounded-xl bg-card py-4 text-card-foreground ring-1 ring-foreground/10", className), ...props });
}

// ../../../ui/src/input.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function Input({ className, type, unstyled = false, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "input",
    {
      type,
      "data-slot": "input",
      className: unstyled ? className : cn("h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20", className),
      ...props
    }
  );
}

// ../../../ui/src/label.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function Label({ className, unstyled = false, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "label",
    {
      "data-slot": "label",
      className: unstyled ? className : cn("flex w-fit items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className),
      ...props
    }
  );
}

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.js
var import_react2 = require("react");

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.js
var import_react = require("react");

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return (0, import_react.createElement)(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react2.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react2.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/arrow-left.js
var __iconNode = [
  ["path", { d: "m12 19-7-7 7-7", key: "1l729n" }],
  ["path", { d: "M19 12H5", key: "x3x0zl" }]
];
var ArrowLeft = createLucideIcon("ArrowLeft", __iconNode);

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/arrow-right.js
var __iconNode2 = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }]
];
var ArrowRight = createLucideIcon("ArrowRight", __iconNode2);

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-down.js
var __iconNode3 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
var ChevronDown = createLucideIcon("ChevronDown", __iconNode3);

// ../../node_modules/.pnpm/lucide-react@0.473.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode4 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("X", __iconNode4);

// ../../../ui/src/native-select.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function NativeSelect({ className, size = "default", unstyled = false, ...props }) {
  if (unstyled) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("select", { "data-slot": "native-select", className, ...props });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "div",
    {
      className: cn("group/native-select relative w-fit has-[select:disabled]:opacity-50", className),
      "data-slot": "native-select-wrapper",
      "data-size": size,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "select",
          {
            "data-slot": "native-select",
            "data-size": size,
            className: "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-md data-[size=sm]:py-0.5",
            ...props
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChevronDown, { className: "pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none", "aria-hidden": "true", "data-slot": "native-select-icon" })
      ]
    }
  );
}
function NativeSelectOption({ className, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { "data-slot": "native-select-option", className, ...props });
}

// src/client.tsx
var import_react3 = require("react");

// src/viewer.ts
var WEB_CLIP_APPLY_API_PATH = "/web-clip/api/clip/apply";
var WEB_CLIP_CANCEL_API_PATH = "/web-clip/api/clip/cancel";
var WEB_CLIP_READER_API_PATH = "/web-clip/api/reader";
var WEB_CLIP_REVIEW_API_PATH = "/web-clip/api/clip/review";
var WEB_CLIP_VIEWER_API_PATH = "/web-clip/api/viewer";
var MAX_VIEWER_TABS = 20;
var MAX_VIEWER_BOOKMARKS = 20;
var MAX_VIEWER_STORAGE_CHARS = 65536;
var SUPPORTED_TOCKTEAM_DESKTOP_VERSION = "0.1.6";
var MAX_VIEWER_TITLE_CHARS = 240;
var utf8 = new TextEncoder();
var defaultReaderPreferences = {
  appearance: "system",
  spacing: "md",
  textSize: "md",
  width: "md"
};
function normalizeViewerPageUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (url.protocol !== "http:" && url.protocol !== "https:" || url.username || url.password || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "home.arpa" || hostname.endsWith(".home.arpa") || hostname.startsWith("[") || /^[\d.]+$/u.test(hostname)) {
    throw new Error("Viewer pages require a credential-free public HTTP(S) hostname");
  }
  url.hash = "";
  const normalized = url.toString();
  if (utf8.encode(normalized).byteLength > 4096) throw new Error("Viewer page URL is too long");
  return normalized;
}
function tab(id) {
  return { id: `tab-${String(id)}`, title: "New Tab", url: null };
}
function createViewerState() {
  return {
    activeId: "tab-1",
    bookmarks: [],
    nextBookmarkId: 1,
    nextTabId: 2,
    readerPreferences: { ...defaultReaderPreferences },
    tabs: [tab(1)]
  };
}
function addViewerTab(state) {
  if (state.tabs.length >= MAX_VIEWER_TABS) return state;
  const created = tab(state.nextTabId);
  return {
    ...state,
    activeId: created.id,
    nextTabId: state.nextTabId + 1,
    tabs: [...state.tabs, created]
  };
}
function selectViewerTab(state, id) {
  return state.tabs.some((item) => item.id === id) ? { ...state, activeId: id } : state;
}
function navigateViewerTab(state, id, page) {
  const url = normalizeViewerPageUrl(page.url);
  let found = false;
  const tabs = state.tabs.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return {
      ...item,
      title: page.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname,
      url
    };
  });
  return found ? { ...state, tabs } : state;
}
function moveViewerTab(state, id, rawIndex) {
  const currentIndex = state.tabs.findIndex((item) => item.id === id);
  if (currentIndex < 0 || !Number.isSafeInteger(rawIndex)) return state;
  const targetIndex = Math.max(0, Math.min(state.tabs.length - 1, rawIndex));
  if (targetIndex === currentIndex) return state;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(currentIndex, 1);
  if (!moved) return state;
  tabs.splice(targetIndex, 0, moved);
  return { ...state, tabs };
}
function closeViewerTab(state, id) {
  const index = state.tabs.findIndex((item) => item.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((item) => item.id !== id);
  if (tabs.length === 0) {
    const created = tab(state.nextTabId);
    return {
      ...state,
      activeId: created.id,
      nextTabId: state.nextTabId + 1,
      tabs: [created]
    };
  }
  return {
    ...state,
    activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]?.id ?? state.activeId : state.activeId,
    tabs
  };
}
function addViewerBookmark(state) {
  if (state.bookmarks.length >= MAX_VIEWER_BOOKMARKS) return state;
  const active = state.tabs.find((item) => item.id === state.activeId);
  if (!active?.url || state.bookmarks.some((item) => item.url === active.url)) return state;
  return {
    ...state,
    bookmarks: [...state.bookmarks, {
      id: `bookmark-${String(state.nextBookmarkId)}`,
      title: active.title,
      url: active.url
    }],
    nextBookmarkId: state.nextBookmarkId + 1
  };
}
function removeViewerBookmark(state, id) {
  const bookmarks = state.bookmarks.filter((item) => item.id !== id);
  return bookmarks.length === state.bookmarks.length ? state : { ...state, bookmarks };
}
function readerPreferences(value) {
  const input = typeof value === "object" && value !== null ? value : {};
  return {
    appearance: input.appearance === "dark" || input.appearance === "light" ? input.appearance : "system",
    spacing: input.spacing === "compact" || input.spacing === "relaxed" ? input.spacing : "md",
    textSize: input.textSize === "lg" || input.textSize === "sm" ? input.textSize : "md",
    width: input.width === "narrow" || input.width === "wide" ? input.width : "md"
  };
}
function restoreViewerState(raw) {
  if (!raw || raw.length > MAX_VIEWER_STORAGE_CHARS) return createViewerState();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return createViewerState();
  }
  if (typeof value !== "object" || value === null) return createViewerState();
  const input = value;
  if (input.version !== 1 || !Array.isArray(input.tabs)) return createViewerState();
  const tabs = [];
  for (const item of input.tabs) {
    if (tabs.length >= MAX_VIEWER_TABS || typeof item !== "object" || item === null) continue;
    const candidate = item;
    if (candidate.url === null) {
      tabs.push(tab(tabs.length + 1));
      continue;
    }
    if (typeof candidate.url !== "string") continue;
    try {
      const url = normalizeViewerPageUrl(candidate.url);
      tabs.push({
        id: `tab-${String(tabs.length + 1)}`,
        title: typeof candidate.title === "string" ? candidate.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname : new URL(url).hostname,
        url
      });
    } catch {
    }
  }
  if (tabs.length === 0) return createViewerState();
  const bookmarks = [];
  if (Array.isArray(input.bookmarks)) {
    for (const item of input.bookmarks) {
      if (bookmarks.length >= MAX_VIEWER_BOOKMARKS || typeof item !== "object" || item === null) continue;
      const candidate = item;
      if (typeof candidate.url !== "string") continue;
      try {
        const url = normalizeViewerPageUrl(candidate.url);
        if (bookmarks.some((bookmark) => bookmark.url === url)) continue;
        bookmarks.push({
          id: `bookmark-${String(bookmarks.length + 1)}`,
          title: typeof candidate.title === "string" ? candidate.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname : new URL(url).hostname,
          url
        });
      } catch {
      }
    }
  }
  const activeIndex = Number.isSafeInteger(input.activeIndex) ? Math.max(0, Math.min(tabs.length - 1, input.activeIndex)) : 0;
  return {
    activeId: tabs[activeIndex]?.id ?? tabs[0]?.id ?? "tab-1",
    bookmarks,
    nextBookmarkId: bookmarks.length + 1,
    nextTabId: tabs.length + 1,
    readerPreferences: readerPreferences(input.readerPreferences),
    tabs
  };
}
function serializeViewerState(state) {
  const payload = {
    activeIndex: Math.max(0, state.tabs.findIndex((item) => item.id === state.activeId)),
    bookmarks: state.bookmarks.slice(0, MAX_VIEWER_BOOKMARKS).map(({ title, url }) => ({ title, url })),
    readerPreferences: state.readerPreferences,
    tabs: state.tabs.slice(0, MAX_VIEWER_TABS).map(({ title, url }) => ({ title, url })),
    version: 1
  };
  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_VIEWER_STORAGE_CHARS && payload.bookmarks.length > 0) {
    payload.bookmarks.pop();
    serialized = JSON.stringify(payload);
  }
  while (serialized.length > MAX_VIEWER_STORAGE_CHARS && payload.tabs.length > 1) {
    payload.tabs.pop();
    payload.activeIndex = Math.min(payload.activeIndex, payload.tabs.length - 1);
    serialized = JSON.stringify(payload);
  }
  return serialized;
}
var ViewerResultGuard = class {
  requestId = 0;
  sessionId;
  constructor(sessionId) {
    this.sessionId = sessionId;
  }
  start(tabId, rawUrl) {
    this.requestId += 1;
    return {
      requestId: this.requestId,
      sessionId: this.sessionId,
      tabId,
      url: normalizeViewerPageUrl(rawUrl)
    };
  }
  invalidate() {
    this.requestId += 1;
  }
  accepts(token, state) {
    const active = state.tabs.find((item) => item.id === state.activeId);
    return token.sessionId === this.sessionId && token.requestId === this.requestId && token.tabId === state.activeId && active?.url === token.url;
  }
};

// src/client-api.ts
var MAX_VIEWER_HTML_CHARS = 1e6;
var MAX_VIEWER_RESPONSE_BYTES = 61e5;
var acceptedContentTypes = /* @__PURE__ */ new Set(["application/xhtml+xml", "text/html", "text/plain"]);
function viewerInputUrl(raw) {
  const value = raw.trim();
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Enter a public HTTP(S) URL.");
  try {
    return normalizeViewerPageUrl(
      /^[a-z][a-z\d+.-]*:/iu.test(value) ? value : `https://${value}`
    );
  } catch {
    throw new Error("Enter a credential-free public HTTP(S) hostname.");
  }
}
function parseReaderViewResult(value) {
  if (typeof value !== "object" || value === null) throw new Error("The Host returned an invalid Reader View.");
  const input = value;
  if (typeof input.content !== "string" || input.content.length > 2e5 || typeof input.sourceUrl !== "string" || typeof input.title !== "string" || input.title.length > 200 || !Array.isArray(input.warnings) || input.warnings.length > 8 || input.warnings.some((warning) => typeof warning !== "string" || warning.length > 200)) {
    throw new Error("The Host returned an invalid Reader View.");
  }
  return {
    content: input.content,
    sourceUrl: viewerInputUrl(input.sourceUrl),
    title: input.title,
    warnings: input.warnings
  };
}
function parseViewerPageResult(value) {
  if (typeof value !== "object" || value === null) throw new Error("The Host returned an invalid viewer page.");
  const input = value;
  if (typeof input.contentType !== "string" || !acceptedContentTypes.has(input.contentType) || typeof input.html !== "string" || input.html.length > MAX_VIEWER_HTML_CHARS || typeof input.title !== "string" || input.title.length > 240 || typeof input.url !== "string") throw new Error("The Host returned an invalid viewer page.");
  const url = viewerInputUrl(input.url);
  return {
    contentType: input.contentType,
    html: input.html,
    title: input.title,
    url
  };
}
function validatedClipPath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/u.test(value)) throw new Error("The Host returned an invalid clip path.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part !== part.trim() || part === "." || part === ".." || part.length > 255 || /[:*?"<>|\\\u0000-\u001f\u007f]/u.test(part)) || !/\.(?:md|markdown)$/iu.test(value)) throw new Error("The Host returned an invalid clip path.");
  return value;
}
function parseClipPreview(value) {
  if (typeof value !== "object" || value === null) throw new Error("The Host returned an invalid clip preview.");
  const input = value;
  const destination = validatedClipPath(input.destination);
  const target = input.target;
  const vault = input.vault;
  if (typeof input.contentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(input.contentDigest) || typeof input.expiresAt !== "number" || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0 || typeof input.markdown !== "string" || input.markdown.length > 21e4 || new TextEncoder().encode(input.markdown).byteLength > 256 * 1024 || input.permission !== "user-approval-required" || typeof input.reviewId !== "string" || !input.reviewId || input.reviewId.length > 128 || typeof input.sourceUrl !== "string" || typeof input.title !== "string" || input.title.length > 200 || typeof target !== "object" || target === null || target.state !== "absent" || typeof vault !== "object" || vault === null || typeof vault.id !== "string" || vault.id.length > 256 || !Number.isSafeInteger(vault.generation) || vault.generation < 0) {
    throw new Error("The Host returned an invalid clip preview.");
  }
  return {
    contentDigest: input.contentDigest,
    destination,
    expiresAt: input.expiresAt,
    markdown: input.markdown,
    permission: "user-approval-required",
    reviewId: input.reviewId,
    sourceUrl: viewerInputUrl(input.sourceUrl),
    target: { state: "absent" },
    title: input.title,
    vault: {
      generation: vault.generation,
      id: vault.id
    }
  };
}
function parseClipApplyResult(value) {
  if (typeof value !== "object" || value === null) throw new Error("The Host returned an invalid clip result.");
  const input = value;
  const path = validatedClipPath(input.path);
  if (input.status !== "created" || typeof input.digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(input.digest) || typeof input.generation !== "number" || !Number.isSafeInteger(input.generation) || input.generation < 0 || typeof input.revision !== "string" || !input.revision || input.revision.length > 256) throw new Error("The Host returned an invalid clip result.");
  return {
    digest: input.digest,
    generation: input.generation,
    path,
    revision: input.revision,
    status: "created"
  };
}
async function responseText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_VIEWER_RESPONSE_BYTES) throw new Error("The Host response is too large.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => void 0);
    throw error;
  }
}
async function requestApi(path, body, signal) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method: "POST",
    signal
  });
  const raw = await responseText(response);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The Host returned an invalid response.");
  }
  if (!response.ok) {
    const code = typeof value === "object" && value !== null && typeof value.error === "string" ? value.error : `HTTP ${String(response.status)}`;
    throw new Error(`Viewer request failed: ${code.slice(0, 80)}`);
  }
  return value;
}
async function requestViewerPage(url, signal) {
  return parseViewerPageResult(await requestApi(WEB_CLIP_VIEWER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
async function requestReaderView(url, signal) {
  return parseReaderViewResult(await requestApi(WEB_CLIP_READER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
async function requestClipPreview(url, destination, signal) {
  return parseClipPreview(await requestApi(WEB_CLIP_REVIEW_API_PATH, {
    ...destination?.trim() ? { destination: destination.trim() } : {},
    url: viewerInputUrl(url)
  }, signal));
}
async function requestClipApply(approval, signal) {
  return parseClipApplyResult(await requestApi(WEB_CLIP_APPLY_API_PATH, approval, signal));
}
async function requestClipCancel(reviewId, signal) {
  const value = await requestApi(WEB_CLIP_CANCEL_API_PATH, { reviewId }, signal);
  if (typeof value !== "object" || value === null || typeof value.cancelled !== "boolean") {
    throw new Error("The Host returned an invalid clip cancellation.");
  }
  return value.cancelled;
}

// src/client.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var VIEWER_STORAGE_KEY = "tocktutor.webViewer.v1";
function storedViewerState() {
  try {
    return restoreViewerState(window.localStorage.getItem(VIEWER_STORAGE_KEY));
  } catch {
    return restoreViewerState(null);
  }
}
function cancelClipPreview(preview) {
  if (preview) void requestClipCancel(preview.reviewId, AbortSignal.timeout(5e3)).catch(() => void 0);
}
function WebViewer() {
  const bridge = window.dshDesktop?.webClip;
  const host = (0, import_react3.useRef)(null);
  const webview = (0, import_react3.useRef)(null);
  const frameId = (0, import_react3.useRef)(null);
  const request = (0, import_react3.useRef)(null);
  const readerRequest = (0, import_react3.useRef)(null);
  const clipRequest = (0, import_react3.useRef)(null);
  const clipPreviewRef = (0, import_react3.useRef)(null);
  const clipApplyingRef = (0, import_react3.useRef)(false);
  const navigateRef = (0, import_react3.useRef)(() => {
  });
  const [viewer, setViewer] = (0, import_react3.useState)(storedViewerState);
  const viewerRef = (0, import_react3.useRef)(viewer);
  const activeId = (0, import_react3.useRef)(viewer.activeId);
  const [readerGuard] = (0, import_react3.useState)(() => new ViewerResultGuard(crypto.randomUUID()));
  const [draft, setDraft] = (0, import_react3.useState)(() => viewer.tabs.find((tab2) => tab2.id === viewer.activeId)?.url ?? "");
  const [error, setError] = (0, import_react3.useState)("");
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const [reader, setReader] = (0, import_react3.useState)(null);
  const [readerLoading, setReaderLoading] = (0, import_react3.useState)(false);
  const [clipDestination, setClipDestination] = (0, import_react3.useState)("");
  const [clipPreview, setClipPreview] = (0, import_react3.useState)(null);
  const [clipLoading, setClipLoading] = (0, import_react3.useState)(false);
  const [clipApplying, setClipApplying] = (0, import_react3.useState)(false);
  const [clipSavedPath, setClipSavedPath] = (0, import_react3.useState)("");
  const active = viewer.tabs.find((tab2) => tab2.id === viewer.activeId);
  const applyViewer = (0, import_react3.useCallback)((next) => {
    viewerRef.current = next;
    activeId.current = next.activeId;
    setViewer(next);
  }, []);
  const navigate = (0, import_react3.useCallback)((raw, tabId = activeId.current) => {
    if (clipApplyingRef.current) return;
    if (!bridge) {
      setError("Web Viewer is available only in TockTeam Desktop.");
      return;
    }
    let url;
    try {
      url = viewerInputUrl(raw);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return;
    }
    request.current?.abort();
    readerRequest.current?.abort();
    clipRequest.current?.abort();
    const previousPreview = clipPreviewRef.current;
    clipPreviewRef.current = null;
    cancelClipPreview(previousPreview);
    readerGuard.invalidate();
    setReader(null);
    setClipPreview(null);
    setClipLoading(false);
    setClipSavedPath("");
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    void requestViewerPage(url, controller.signal).then(async (page) => {
      if (controller.signal.aborted) return;
      const element = webview.current;
      const id = frameId.current;
      if (!element || id === null) throw new Error("The isolated page frame is not ready.");
      const documentUrl = await bridge.authorizeDocument(id, page.html);
      if (controller.signal.aborted) return;
      await element.loadURL(documentUrl);
      if (controller.signal.aborted) return;
      applyViewer(navigateViewerTab(viewerRef.current, tabId, page));
      if (activeId.current === tabId) setDraft(page.url);
    }).catch((nextError) => {
      if (!controller.signal.aborted) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }).finally(() => {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    });
  }, [applyViewer, bridge, readerGuard]);
  (0, import_react3.useEffect)(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  (0, import_react3.useEffect)(() => {
    const container = host.current;
    if (!container || !bridge) return;
    const element = document.createElement("webview");
    element.setAttribute("partition", `tockteam-web-clip-${crypto.randomUUID()}`);
    element.setAttribute("src", "about:blank");
    element.className = "flex min-h-0 w-full flex-1 border-0";
    const ready = () => {
      try {
        frameId.current = element.getWebContentsId();
        const current = viewerRef.current;
        const restored = current.tabs.find((tab2) => tab2.id === current.activeId);
        if (restored?.url) navigateRef.current(restored.url, restored.id);
      } catch {
        setError("The isolated page frame failed to start.");
      }
    };
    element.addEventListener("dom-ready", ready, { once: true });
    container.append(element);
    webview.current = element;
    return () => {
      request.current?.abort();
      readerRequest.current?.abort();
      clipRequest.current?.abort();
      const previousPreview = clipPreviewRef.current;
      cancelClipPreview(previousPreview);
      readerGuard.invalidate();
      request.current = null;
      readerRequest.current = null;
      clipRequest.current = null;
      element.removeEventListener("dom-ready", ready);
      frameId.current = null;
      webview.current = null;
      element.remove();
    };
  }, [bridge, readerGuard]);
  (0, import_react3.useEffect)(() => {
    try {
      window.localStorage.setItem(VIEWER_STORAGE_KEY, serializeViewerState(viewer));
    } catch {
    }
  }, [viewer]);
  const invalidateClip = () => {
    if (clipApplyingRef.current) return;
    clipRequest.current?.abort();
    clipRequest.current = null;
    const previousPreview = clipPreviewRef.current;
    clipPreviewRef.current = null;
    cancelClipPreview(previousPreview);
    setClipPreview(null);
    setClipLoading(false);
    setClipSavedPath("");
  };
  const invalidateReader = () => {
    readerRequest.current?.abort();
    readerRequest.current = null;
    readerGuard.invalidate();
    invalidateClip();
    setReader(null);
    setReaderLoading(false);
  };
  const activate = (tab2) => {
    if (clipApplyingRef.current) return;
    const next = selectViewerTab(viewer, tab2.id);
    applyViewer(next);
    setDraft(tab2.url ?? "");
    request.current?.abort();
    invalidateReader();
    if (tab2.url) navigate(tab2.url, tab2.id);
  };
  const close = (id) => {
    if (clipApplyingRef.current) return;
    const next = closeViewerTab(viewer, id);
    applyViewer(next);
    const nextActive = next.tabs.find((tab2) => tab2.id === next.activeId);
    setDraft(nextActive?.url ?? "");
    request.current?.abort();
    invalidateReader();
    if (nextActive?.url) navigate(nextActive.url, nextActive.id);
  };
  const loadReader = () => {
    if (clipApplyingRef.current) return;
    const current = viewerRef.current;
    const tab2 = current.tabs.find((item) => item.id === current.activeId);
    if (!tab2?.url) return;
    readerRequest.current?.abort();
    const controller = new AbortController();
    readerRequest.current = controller;
    const token = readerGuard.start(tab2.id, tab2.url);
    setReaderLoading(true);
    setError("");
    void requestReaderView(tab2.url, controller.signal).then((result) => {
      if (readerGuard.accepts(token, viewerRef.current)) setReader(result);
    }).catch((nextError) => {
      if (readerGuard.accepts(token, viewerRef.current)) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }).finally(() => {
      if (readerRequest.current === controller) {
        readerRequest.current = null;
        setReaderLoading(false);
      }
    });
  };
  const createClipPreview = () => {
    const current = viewerRef.current;
    const tab2 = current.tabs.find((item) => item.id === current.activeId);
    if (!tab2?.url) return;
    invalidateClip();
    const controller = new AbortController();
    clipRequest.current = controller;
    setClipLoading(true);
    setError("");
    void requestClipPreview(tab2.url, clipDestination, controller.signal).then((result) => {
      if (controller.signal.aborted || activeId.current !== tab2.id) return;
      clipPreviewRef.current = result;
      setClipPreview(result);
      setClipDestination(result.destination);
    }).catch((nextError) => {
      if (!controller.signal.aborted) setError(nextError instanceof Error ? nextError.message : String(nextError));
    }).finally(() => {
      if (clipRequest.current === controller) {
        clipRequest.current = null;
        setClipLoading(false);
      }
    });
  };
  const applyClip = () => {
    const value = clipPreviewRef.current;
    if (!value) return;
    clipRequest.current?.abort();
    const controller = new AbortController();
    clipRequest.current = controller;
    clipApplyingRef.current = true;
    setClipApplying(true);
    setClipLoading(true);
    setError("");
    void requestClipApply({
      contentDigest: value.contentDigest,
      destination: value.destination,
      expiresAt: value.expiresAt,
      permission: "user-approved",
      reviewId: value.reviewId,
      sourceUrl: value.sourceUrl,
      target: value.target,
      vault: value.vault
    }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      clipApplyingRef.current = false;
      setClipApplying(false);
      clipPreviewRef.current = null;
      setClipPreview(null);
      setClipSavedPath(result.path);
    }).catch((nextError) => {
      if (!controller.signal.aborted) {
        clipApplyingRef.current = false;
        setClipApplying(false);
        cancelClipPreview(value);
        clipPreviewRef.current = null;
        setClipPreview(null);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }).finally(() => {
      if (clipRequest.current === controller) {
        clipRequest.current = null;
        clipApplyingRef.current = false;
        setClipApplying(false);
        setClipLoading(false);
      }
    });
  };
  const setReaderPreference = (key, value) => {
    const current = viewerRef.current;
    applyViewer({
      ...current,
      readerPreferences: { ...current.readerPreferences, [key]: value }
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { "aria-label": "Web Viewer", className: "flex min-h-0 flex-1 flex-col", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { "aria-label": "Viewer Tabs", className: "flex gap-1 overflow-x-auto", children: [
      viewer.tabs.map((tab2, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "inline-flex", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            unstyled: true,
            "aria-pressed": tab2.id === viewer.activeId,
            disabled: clipApplying,
            onClick: () => {
              activate(tab2);
            },
            type: "button",
            children: tab2.title
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            unstyled: true,
            "aria-label": `Close ${tab2.title}`,
            disabled: clipApplying,
            onClick: () => {
              close(tab2.id);
            },
            type: "button",
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(X, { "aria-hidden": "true", size: 16 })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            unstyled: true,
            "aria-label": `Move ${tab2.title} Left`,
            disabled: index === 0,
            onClick: () => {
              applyViewer(moveViewerTab(viewerRef.current, tab2.id, index - 1));
            },
            type: "button",
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ArrowLeft, { "aria-hidden": "true", size: 16 })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            unstyled: true,
            "aria-label": `Move ${tab2.title} Right`,
            disabled: index === viewer.tabs.length - 1,
            onClick: () => {
              applyViewer(moveViewerTab(viewerRef.current, tab2.id, index + 1));
            },
            type: "button",
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ArrowRight, { "aria-hidden": "true", size: 16 })
          }
        )
      ] }, tab2.id)),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Button,
        {
          unstyled: true,
          disabled: clipApplying,
          onClick: () => {
            if (clipApplyingRef.current) return;
            request.current?.abort();
            invalidateReader();
            applyViewer(addViewerTab(viewerRef.current));
            setDraft("");
          },
          type: "button",
          children: "New Tab"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      "form",
      {
        "aria-label": "Web Viewer Address",
        onSubmit: (event) => {
          event.preventDefault();
          navigate(draft);
        },
        className: "flex gap-1",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Input,
            {
              unstyled: true,
              "aria-label": "URL",
              disabled: clipApplying,
              onChange: (event) => {
                setDraft(event.currentTarget.value);
              },
              placeholder: "https://example.com",
              value: draft
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { unstyled: true, disabled: loading || clipApplying, type: "submit", children: loading ? "Loading\u2026" : "Go" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Button,
            {
              unstyled: true,
              disabled: !active?.url,
              onClick: () => {
                applyViewer(addViewerBookmark(viewerRef.current));
              },
              type: "button",
              children: "Bookmark"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Button,
            {
              unstyled: true,
              disabled: !active?.url || readerLoading || clipApplying,
              onClick: () => {
                reader ? invalidateReader() : loadReader();
              },
              type: "button",
              children: reader ? "Page View" : readerLoading ? "Loading Reader\u2026" : "Reader View"
            }
          )
        ]
      }
    ),
    viewer.bookmarks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("summary", { children: "Bookmarks" }),
      viewer.bookmarks.map((bookmark) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { unstyled: true, disabled: clipApplying, onClick: () => {
          navigate(bookmark.url);
        }, type: "button", children: bookmark.title }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            unstyled: true,
            "aria-label": `Remove ${bookmark.title}`,
            onClick: () => {
              applyViewer(removeViewerBookmark(viewerRef.current, bookmark.id));
            },
            type: "button",
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(X, { "aria-hidden": "true", size: 16 })
          }
        )
      ] }, bookmark.id))
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Alert, { unstyled: true, children: error }),
    reader && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      "article",
      {
        "aria-label": "Reader View",
        className: "w-full self-center overflow-auto p-6",
        style: {
          background: viewer.readerPreferences.appearance === "dark" ? "#171717" : viewer.readerPreferences.appearance === "light" ? "#fff" : void 0,
          color: viewer.readerPreferences.appearance === "dark" ? "#f5f5f5" : viewer.readerPreferences.appearance === "light" ? "#171717" : void 0,
          fontSize: viewer.readerPreferences.textSize === "sm" ? 14 : viewer.readerPreferences.textSize === "lg" ? 18 : 16,
          lineHeight: viewer.readerPreferences.spacing === "compact" ? 1.4 : viewer.readerPreferences.spacing === "relaxed" ? 1.9 : 1.65,
          maxWidth: viewer.readerPreferences.width === "narrow" ? 640 : viewer.readerPreferences.width === "wide" ? 1e3 : 800
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { "aria-label": "Reader Settings", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Label, { unstyled: true, children: [
              "Text Size ",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                NativeSelect,
                {
                  unstyled: true,
                  onChange: (event) => {
                    setReaderPreference("textSize", event.currentTarget.value);
                  },
                  value: viewer.readerPreferences.textSize,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "sm", children: "Small" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "md", children: "Medium" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "lg", children: "Large" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Label, { unstyled: true, children: [
              "Line Width ",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                NativeSelect,
                {
                  unstyled: true,
                  onChange: (event) => {
                    setReaderPreference("width", event.currentTarget.value);
                  },
                  value: viewer.readerPreferences.width,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "narrow", children: "Narrow" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "md", children: "Medium" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "wide", children: "Wide" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Label, { unstyled: true, children: [
              "Line Spacing ",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                NativeSelect,
                {
                  unstyled: true,
                  onChange: (event) => {
                    setReaderPreference("spacing", event.currentTarget.value);
                  },
                  value: viewer.readerPreferences.spacing,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "compact", children: "Compact" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "md", children: "Default" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "relaxed", children: "Relaxed" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Label, { unstyled: true, children: [
              "Appearance ",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                NativeSelect,
                {
                  unstyled: true,
                  onChange: (event) => {
                    setReaderPreference("appearance", event.currentTarget.value);
                  },
                  value: viewer.readerPreferences.appearance,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "system", children: "System" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "light", children: "Light" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NativeSelectOption, { value: "dark", children: "Dark" })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: reader.title }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { "aria-label": "Clip Web Page", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Label, { unstyled: true, children: [
              "Clip Destination",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                Input,
                {
                  unstyled: true,
                  disabled: clipLoading || clipPreview !== null,
                  onChange: (event) => {
                    setClipDestination(event.currentTarget.value);
                  },
                  placeholder: "example.md",
                  value: clipDestination
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              Button,
              {
                unstyled: true,
                disabled: clipLoading || clipPreview !== null,
                onClick: createClipPreview,
                type: "button",
                children: clipLoading && !clipPreview ? "Generating Preview\u2026" : "Generate Clip Preview"
              }
            ),
            clipPreview && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Card, { unstyled: true, children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "Review the exact Markdown and destination before saving." }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "Destination:" }),
                " ",
                clipPreview.destination
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("pre", { "aria-label": "Clip Markdown Preview", className: "max-h-80 overflow-auto whitespace-pre-wrap", children: clipPreview.markdown }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { unstyled: true, disabled: clipLoading, onClick: applyClip, type: "button", children: clipLoading ? "Saving\u2026" : "Save Clip" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { unstyled: true, disabled: clipLoading, onClick: invalidateClip, type: "button", children: "Cancel" })
            ] }),
            clipSavedPath && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Alert, { unstyled: true, role: "status", children: [
              "Saved clip to ",
              clipSavedPath,
              "."
            ] })
          ] }),
          reader.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Alert, { unstyled: true, role: "status", children: warning }, warning)),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("pre", { className: "whitespace-pre-wrap font-[inherit]", children: reader.content })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: reader ? "hidden" : "flex min-h-0 flex-1", ref: host })
  ] });
}
var inject = ["desktopSidebar", "tockTeamSurface"];
function apply(ctx) {
  const surface = ctx.get("tockTeamSurface");
  const sidebar = ctx.get("desktopSidebar");
  const desktop = window.dshDesktop;
  if (surface?.kind !== "desktop" || !sidebar || !desktop?.webClip) return;
  let disposed = false;
  let remove;
  ctx.effect(() => () => {
    disposed = true;
    remove?.();
  }, "tockbot-web-clip: Web Viewer");
  void desktop.getInfo().then((info) => {
    if (disposed || info.version !== SUPPORTED_TOCKTEAM_DESKTOP_VERSION) return;
    remove = sidebar.registerTab({
      id: "web-clip",
      order: 31,
      render: () => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(WebViewer, {}),
      single: true,
      title: "Web Viewer"
    });
  }).catch(() => void 0);
}
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/arrow-left.js:
lucide-react/dist/esm/icons/arrow-right.js:
lucide-react/dist/esm/icons/chevron-down.js:
lucide-react/dist/esm/icons/x.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.473.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
return module.exports; } });
//# sourceMappingURL=client.js.map
