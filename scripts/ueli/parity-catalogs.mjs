#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../..");
const manifestPath = path.join(scriptDir, "parity-catalogs.json");
const pinnedBaseline = Object.freeze({
  schemaVersion: 1,
  tag: "v9.29.0",
  commit: "c9670d61cb2576802adf99d95622c58538d265f3",
});

export const CATALOG_NAMES = Object.freeze([
  "bootstrap",
  "extensions",
  "actionHandlers",
  "bridgeMethods",
  "ipcChannels",
  "rendererSurfaces",
  "registries",
  "settings",
  "assets",
  "dependencies",
  "platforms",
]);

async function listFiles(root, prefix = "") {
  const directory = path.join(root, prefix);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function matches(source, expression, map) {
  return [...source.matchAll(expression)].map(map);
}

function discoverBridgeMethods(source) {
  const sourceFile = ts.createSourceFile(
    "src/common/Core/ContextBridge.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === "ContextBridge");
  if (!declaration || !ts.isTypeLiteralNode(declaration.type)) return [];
  return declaration.type.members.flatMap((member) => {
    if (!member.name) return [];
    const id = ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)
      ? member.name.text
      : member.name.getText(sourceFile);
    return [{ id, source: "src/common/Core/ContextBridge.ts" }];
  });
}

function sourceFileFor(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function discoverIpcChannels(file, source) {
  const sourceFile = sourceFileFor(file, source);
  const rows = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile);
      const method = node.expression.name.text;
      const main = receiver === "ipcMain" && (method === "on" || method === "handle");
      const renderer = (receiver === "ipcRenderer" || receiver.endsWith(".ipcRenderer"))
        && ["on", "off", "send", "sendSync", "invoke"].includes(method);
      if (main || renderer) {
        const argument = node.arguments[0];
        let channel;
        if (argument && ts.isStringLiteralLike(argument)) channel = argument.text;
        else if (argument && ts.isTemplateExpression(argument)) {
          channel = argument.getText(sourceFile).slice(1, -1).replace(/\$\{[^}]+\}/gu, "${*}");
        } else if (renderer && argument && ts.isIdentifier(argument) && argument.text === "channel") {
          channel = "<dynamic-channel>";
        }
        if (channel) rows.push({ id: `${main ? "main" : "renderer"}:${method}:${channel}`, source: file });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return rows;
}

function discoverRendererSurfaces(file, source) {
  const sourceFile = sourceFileFor(file, source);
  const rows = [];
  const visit = (node) => {
    if (ts.isJsxOpeningLikeElement(node) && node.tagName.getText(sourceFile) === "Route") {
      const attribute = node.attributes.properties.find((property) => (
        ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "path"
      ));
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer
        && ts.isStringLiteral(attribute.initializer)) {
        rows.push({ id: `route:${attribute.initializer.text}`, source: file });
      }
    }
    if (ts.isPropertyAssignment(node)
      && node.name.getText(sourceFile) === "absolutePath"
      && ts.isStringLiteralLike(node.initializer)) {
      rows.push({ id: `settings-route:${node.initializer.text}`, source: file });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return rows;
}

function uniqueRows(rows, shouldSort = true) {
  const byIdentity = new Map();
  for (const row of rows) {
    byIdentity.set(`${row.id}\u0000${row.source}`, row);
  }
  const result = [...byIdentity.values()];
  return shouldSort
    ? result.sort((left, right) => rowIdentity(left).localeCompare(rowIdentity(right)))
    : result;
}

function sourceReader(vendorRoot, sourceOverrides) {
  return async (relativePath) => {
    if (Object.hasOwn(sourceOverrides, relativePath)) {
      return sourceOverrides[relativePath];
    }
    return readFile(path.join(vendorRoot, relativePath), "utf8");
  };
}

function isProductionSource(file) {
  return !/\.(test|spec)\.(ts|tsx)$/u.test(file);
}

function extensionFromFile(file) {
  return file.match(/^src\/(?:common|main|renderer)\/Extensions\/([^/]+)\//u)?.[1];
}

async function discoverSettings(files, readSource) {
  const settings = new Map();

  function addSetting(scope, key, defaultValue, source) {
    const id = `${scope}:${key}`;
    const current = settings.get(id) ?? { id, sources: new Set(), defaults: new Set() };
    current.sources.add(source);
    if (defaultValue) current.defaults.add(defaultValue);
    settings.set(id, current);
  }

  for (const file of files.filter((file) =>
    /^src\/(common|main|renderer)\/.+\.(ts|tsx)$/u.test(file) && isProductionSource(file))) {
    const source = await readSource(file);
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const extension = extensionFromFile(file);
    const textOf = (node) => node?.getText(sourceFile).replace(/\s+/gu, " ").slice(0, 240);
    const stringOf = (node) => ts.isStringLiteralLike(node) ? node.text : undefined;

    function addObjectSetting(scope, object, sourceName) {
      const keyProperty = object.properties.find((property) =>
        ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "key");
      const defaultProperty = object.properties.find((property) =>
        ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "defaultValue");
      if (keyProperty && ts.isPropertyAssignment(keyProperty)) {
        const key = stringOf(keyProperty.initializer);
        if (key) addSetting(scope, key, defaultProperty && ts.isPropertyAssignment(defaultProperty) ? textOf(defaultProperty.initializer) : undefined, sourceName);
      }
    }

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const callName = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : undefined;

        if (["useSetting", "useExtensionSetting"].includes(callName) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          const scope = callName === "useExtensionSetting" ? `extension:${extension ?? "dynamic"}` : "global";
          addObjectSetting(scope, node.arguments[0], file);
        }

        if (["getSettingValue", "getValue", "updateSettingValue"].includes(callName)) {
          const key = stringOf(node.arguments[0]);
          const isExtensionGetter = extension
            && key
            && !key.includes(".");
          if (key) addSetting(isExtensionGetter ? `extension:${extension}` : "global", key, callName === "updateSettingValue" ? undefined : textOf(node.arguments[1]), file);
        }

        if (callName === "getExtensionSettingKey") {
          const key = stringOf(node.arguments[1]);
          if (key) addSetting(`extension:${stringOf(node.arguments[0]) ?? extension ?? "dynamic"}`, key, undefined, file);
        }
      }

      const isDefaultDeclaration = (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node))
        && /default(?:settings|values)/iu.test(node.name.getText(sourceFile))
        && node.initializer
        && ts.isObjectLiteralExpression(node.initializer);
      if (isDefaultDeclaration && extension) {
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = stringOf(property.name) ?? property.name.getText(sourceFile);
          addSetting(`extension:${extension}`, key, textOf(property.initializer), file);
        }
      }

      if (ts.isMethodDeclaration(node)
        && node.name.getText(sourceFile) === "getDefaultSettings"
        && extension
        && node.body) {
        const returnStatement = node.body.statements.find((statement) => ts.isReturnStatement(statement));
        if (returnStatement?.expression && ts.isObjectLiteralExpression(returnStatement.expression)) {
          for (const property of returnStatement.expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = stringOf(property.name) ?? property.name.getText(sourceFile);
            addSetting(`extension:${extension}`, key, textOf(property.initializer), file);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return [...settings.values()].map(({ id, sources, defaults }) => ({
    id,
    source: [...sources].sort().join(";"),
    defaultValue: [...defaults].sort().join(" | ") || "upstream-default-not-declared",
  }));
}

async function discoverCatalogs({ vendorRoot, sourceOverrides = {} }) {
  const trackedFiles = await listFiles(vendorRoot);
  const files = [...new Set([...trackedFiles, ...Object.keys(sourceOverrides)])].sort();
  const readSource = sourceReader(vendorRoot, sourceOverrides);
  const mainIndex = await readSource("src/main/index.ts");
  const extensionLoader = await readSource("src/main/Extensions/ExtensionLoader.ts");
  const contextBridge = await readSource("src/common/Core/ContextBridge.ts");
  const packageJson = JSON.parse(await readSource("package.json"));
  const packageLock = JSON.parse(await readSource("package-lock.json"));
  const builderConfig = await readSource("electron-builder.config.js");

  const catalogs = Object.fromEntries(CATALOG_NAMES.map((name) => [name, []]));

  catalogs.bootstrap.push(
    ...matches(mainIndex, /moduleRegistry\.register\(\s*["']([^"']+)["']/gu, ([, name]) => ({
      id: `runtime:${name}`,
      source: "src/main/index.ts",
    })),
    ...matches(mainIndex, /(?:await\s+)?(?:Core|Extensions)\.([A-Za-z0-9_]+)\.bootstrap\(moduleRegistry\)/gu, ([, name]) => ({
      id: `module:${name}`,
      source: "src/main/index.ts",
    })),
  );

  catalogs.extensions.push(
    ...matches(extensionLoader, /new\s+([A-Za-z0-9_]+Module)\(\)/gu, ([, name]) => ({
      id: name,
      source: "src/main/Extensions/ExtensionLoader.ts",
    })),
  );

  for (const file of files.filter((file) => file.startsWith("src/main/") && file.endsWith(".ts") && isProductionSource(file))) {
    const source = await readSource(file);
    catalogs.actionHandlers.push(
      ...matches(source, /export\s+class\s+([A-Za-z0-9_]+ActionHandler)\b/gu, ([, name]) => ({ id: name, source: file })),
      ...matches(source, /export\s+class\s+([A-Za-z0-9_]+)\s+implements\s+ActionHandler\b/gu, ([, name]) => ({ id: name, source: file })),
      ...matches(source, /actionHandlers\s*:\s*\[\s*new\s+([A-Za-z0-9_]+)\b/gu, ([, name]) => ({ id: name, source: file })),
    );
  }

  catalogs.bridgeMethods.push(...discoverBridgeMethods(contextBridge));

  for (const file of files.filter((file) => /^(src\/(main|preload|renderer)\/).+\.(ts|tsx)$/u.test(file) && isProductionSource(file))) {
    catalogs.ipcChannels.push(...discoverIpcChannels(file, await readSource(file)));
  }

  for (const file of files.filter((file) => file.startsWith("src/renderer/") && /\.(ts|tsx)$/u.test(file) && isProductionSource(file))) {
    catalogs.rendererSurfaces.push(...discoverRendererSurfaces(file, await readSource(file)));
    if (/^src\/renderer\/Extensions\/.+Settings\.tsx$/u.test(file)) {
      catalogs.rendererSurfaces.push({
        id: `extension-settings:${file.split("/")[3]}`,
        source: file,
      });
    }
  }

  for (const file of ["src/main/Core/Terminal/TerminalModule.ts", "src/main/Core/WebBrowser/WebBrowserModule.ts"]) {
    const source = await readSource(file);
    const kind = file.includes("/Terminal/") ? "terminal" : "browser";
    catalogs.registries.push(
      ...matches(source, /new\s+([A-Za-z0-9_]+)\(/gu, ([, name]) => ({
        id: `${kind}:${name}`,
        source: file,
      })),
    );
  }

  catalogs.settings.push(...await discoverSettings(files, readSource));

  catalogs.assets.push(
    ...files.filter((file) => file.startsWith("assets/")).map((file) => ({ id: file, source: file })),
  );

  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
      catalogs.dependencies.push({ id: `${section}:${name}@${version}`, source: "package.json" });
    }
  }
  for (const [packagePath, entry] of Object.entries(packageLock.packages ?? {})) {
    catalogs.dependencies.push({
      id: `lock:${packagePath || "<root>"}@${entry.version ?? packageLock.version}`,
      source: "package-lock.json",
    });
  }

  catalogs.platforms.push(
    ...matches(builderConfig, /^ {4}(darwin|win32|linux):\s*\{/gmu, ([, platform]) => ({
      id: `platform:${platform}`,
      source: "electron-builder.config.js",
    })),
    ...matches(builderConfig, /target:\s*["']([^"']+)["']/gu, ([, target]) => ({
      id: `package-target:${target}`,
      source: "electron-builder.config.js",
    })),
    ...matches(builderConfig, /arch:\s*\[([^\]]+)\]/gu, ([, architectures]) => architectures)
      .flatMap((architectures) => matches(architectures, /["']([^"']+)["']/gu, ([, architecture]) => ({
        id: `architecture:${architecture}`,
        source: "electron-builder.config.js",
      }))),
  );

  return Object.fromEntries(CATALOG_NAMES.map((name) => [
    name,
    uniqueRows(catalogs[name], !["bootstrap", "extensions"].includes(name)).map((row, order) =>
      ["bootstrap", "extensions"].includes(name) ? { ...row, order } : row),
  ]));
}

const extensionIssues = new Map([
  ...["Base64ConversionModule", "CalculatorModule", "ColorConverterExtensionModule", "PasswordGeneratorModule", "QuickFormatterModule", "RowlandTextEditorModule", "UuidGeneratorModule"].map((id) => [id, "tockteam-tl.6"]),
  ...["ApplicationSearchModule", "BrowserBookmarksModule", "JetBrainsToolboxModule", "VSCodeModule"].map((id) => [id, "tockteam-tl.7"]),
  ...["FileSearchModule", "SimpleFileSearchExtensionModule"].map((id) => [id, "tockteam-tl.8"]),
  ...["CurrencyConversionModule", "CustomWebSearchModule", "DeeplTranslatorModule", "WebSearchExtensionModule"].map((id) => [id, "tockteam-tl.9"]),
  ...["AppearanceSwitcherModule", "SystemCommandsModule", "SystemSettingsModule", "UeliCommandModule", "WindowsControlPanelModule"].map((id) => [id, "tockteam-tl.10"]),
  ["TerminalLauncherModule", "tockteam-tl.11"],
  ["WorkflowExtensionModule", "tockteam-tl.12"],
]);

const extensionApplicability = new Map([
  ["AppearanceSwitcherModule", ["macOS", "Windows"]],
  ["BrowserBookmarksModule", ["macOS", "Windows"]],
  ["FileSearchModule", ["macOS", "Windows"]],
  ["SystemSettingsModule", ["macOS", "Windows"]],
  ["TerminalLauncherModule", ["macOS", "Windows"]],
  ["WindowsControlPanelModule", ["Windows"]],
]);

const terminalApplicability = new Map([
  ["CommandPrompt", ["Windows"]],
  ["Iterm", ["macOS"]],
  ["MacOsTerminal", ["macOS"]],
  ["Powershell", ["Windows"]],
  ["PowershellCore", ["Windows"]],
  ["Wsl", ["Windows"]],
]);

const globalSettingApplicability = new Map([
  ["appearance.showAppIconInDock", ["macOS"]],
  ["general.browser.customWebBrowser.commandlineArguments", ["Windows"]],
  ["window.acrylicOpacity", ["Windows"]],
  ["window.backgroundMaterial", ["Windows"]],
  ["window.vibrancy", ["macOS"]],
  ["window.visibleOnAllWorkspaces", ["macOS", "Linux"]],
]);

function inferredApplicability(row) {
  const value = `${row.id} ${row.source}`.toLowerCase();
  const operatingSystems = [];
  if (/darwin|macos|mac-os|\/mac\//u.test(value)) operatingSystems.push("macOS");
  if (/win32|windows/u.test(value)) operatingSystems.push("Windows");
  if (/linux|wayland/u.test(value)) operatingSystems.push("Linux");
  return operatingSystems;
}

function applicability(catalog, row) {
  if (catalog === "extensions" && extensionApplicability.has(row.id)) {
    return extensionApplicability.get(row.id);
  }
  if (catalog === "settings" && row.id.startsWith("extension:")) {
    const extension = row.id.split(":")[1];
    const extensionPlatforms = extensionApplicability.get(`${extension}Module`) ?? ["macOS", "Windows", "Linux"];
    const inferredPlatforms = inferredApplicability(row);
    const intersection = extensionPlatforms.filter((platform) => inferredPlatforms.includes(platform));
    return intersection.length > 0 ? intersection : extensionPlatforms;
  }
  if (catalog === "settings" && row.id.startsWith("global:")) {
    const key = row.id.slice("global:".length);
    if (globalSettingApplicability.has(key)) return globalSettingApplicability.get(key);
  }
  if (catalog === "registries" && row.id.startsWith("terminal:")) {
    const name = row.id.slice("terminal:".length);
    if (terminalApplicability.has(name)) return terminalApplicability.get(name);
  }
  if (catalog === "registries" && row.id.startsWith("browser:")) {
    return ["macOS", "Windows"];
  }
  const operatingSystems = inferredApplicability(row);
  return operatingSystems.length > 0 ? operatingSystems : ["macOS", "Windows", "Linux"];
}

function extensionIssueForName(extension) {
  return extensionIssues.get(`${extension}Module`)
    ?? extensionIssues.get(`${extension}ExtensionModule`)
    ?? "tockteam-tl.3";
}

function ownerFor(catalog, row) {
  if (catalog === "extensions") return "desktop-provider";
  if (catalog === "bootstrap") return "electron-main";
  if (catalog === "actionHandlers" || catalog === "bridgeMethods" || catalog === "ipcChannels") return "electron-main";
  if (catalog === "rendererSurfaces") return "desktop-renderer";
  if (catalog === "registries") return "electron-main";
  if (catalog === "settings") return "electron-main";
  if (catalog === "assets" || catalog === "dependencies" || catalog === "platforms") return "release-engineering";
  return "desktop";
}

function issueFor(catalog, row) {
  if (catalog === "extensions") return extensionIssues.get(row.id) ?? "tockteam-tl.3";
  if (catalog === "bootstrap") {
    if (/Window|App|Dock|Tray|Autostart|Shortcut/u.test(row.id)) return "tockteam-tl.2,tockteam-tl.4";
    if (/Settings|SafeStorage|SearchIndex/u.test(row.id)) return "tockteam-tl.3,tockteam-tl.5";
    if (/Extension|Favorite|Excluded|Rescan|Translator/u.test(row.id)) return "tockteam-tl.3";
    if (/Terminal/u.test(row.id)) return "tockteam-tl.3,tockteam-tl.11";
    if (/WebBrowser/u.test(row.id)) return "tockteam-tl.3,tockteam-tl.11";
    return "tockteam-tl.3";
  }
  if (catalog === "actionHandlers") {
    const extension = row.source.match(/^src\/main\/Extensions\/([^/]+)\//u)?.[1];
    return extension ? `tockteam-tl.3,${extensionIssueForName(extension)}` : "tockteam-tl.3";
  }
  if (catalog === "bridgeMethods" || catalog === "ipcChannels") return "tockteam-tl.3";
  if (catalog === "rendererSurfaces") return row.id.startsWith("settings-route:")
    || row.id.startsWith("extension-settings:")
    || row.source.includes("/Settings/")
    ? "tockteam-tl.5,tockteam-tl.13"
    : "tockteam-tl.3,tockteam-tl.13";
  if (catalog === "registries") return "tockteam-tl.11";
  if (catalog === "settings") {
    const extension = row.id.startsWith("extension:") ? row.id.split(":")[1] : undefined;
    return extension ? `tockteam-tl.5,${extensionIssueForName(extension)}` : "tockteam-tl.5";
  }
  if (catalog === "assets") return "tockteam-tl.14";
  if (catalog === "dependencies" || catalog === "platforms") return "tockteam-tl.14,tockteam-tl.15";
  return "tockteam-tl.2";
}

function classify(catalog, row) {
  const privileged = catalog === "actionHandlers" || catalog === "bridgeMethods" || catalog === "ipcChannels";
  const dependency = catalog === "dependencies";
  const owner = ownerFor(catalog, row);
  const issue = issueFor(catalog, row);
  return {
    ...row,
    applicability: applicability(catalog, row),
    capabilities: dependency && /better-sqlite3|sharp|electron/u.test(row.id) ? "dependencies:native-or-electron" : catalog,
    securityDisposition: dependency
      ? "inventory-only-not-installed"
      : privileged
        ? "replace-with-typed-tockteam-adapter"
        : "compose-behind-tockteam-boundary",
    divergence: dependency
      ? "Ueli dependency graph is inventory-only; admit only reviewed TockTeam imports"
      : privileged
        ? "Raw Ueli authority is replaced by typed TockTeam ownership"
        : "TockTeam preserves reviewed behavior behind its owner boundary",
    owner,
    issue,
    evidence: `pnpm audit:ueli-launcher-parity; ${issue}`,
  };
}

function classifiedCatalogs(catalogs) {
  return Object.fromEntries(CATALOG_NAMES.map((name) => [name, catalogs[name].map((row) => classify(name, row))]));
}

function rowIdentity(row) {
  return `${row.id}\u0000${row.source}`;
}

export function compareCatalog(name, expected, actual) {
  const expectedIds = new Set(expected.map(rowIdentity));
  const actualIds = new Set(actual.map(rowIdentity));
  const added = actual.filter((row) => !expectedIds.has(rowIdentity(row)));
  const removed = expected.filter((row) => !actualIds.has(rowIdentity(row)));
  if (added.length > 0 || removed.length > 0) {
    const format = (rows) => rows.map((row) => `${row.id} (${row.source})`).join(", ") || "none";
    throw new Error(`Ueli parity catalog ${name} drift: added ${format(added)}; removed ${format(removed)}`);
  }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Ueli parity catalog ${name} drift: classification or source order changed`);
  }
}

export async function auditParityCatalogs({ repoRoot = defaultRepoRoot, sourceOverrides = {} } = {}) {
  const vendorRoot = path.join(repoRoot, "vendor/ueli");
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "scripts/ueli/parity-catalogs.json"), "utf8"));
  if (manifest.schemaVersion !== pinnedBaseline.schemaVersion
    || manifest.baseline?.tag !== pinnedBaseline.tag
    || manifest.baseline?.commit !== pinnedBaseline.commit) {
    throw new Error(`Ueli parity manifest baseline drift: expected ${pinnedBaseline.tag} ${pinnedBaseline.commit}`);
  }
  const actual = classifiedCatalogs(await discoverCatalogs({ vendorRoot, sourceOverrides }));
  const unclassified = [];

  for (const name of CATALOG_NAMES) {
    compareCatalog(name, manifest.catalogs[name] ?? [], actual[name]);
    for (const row of manifest.catalogs[name] ?? []) {
      const requiredFields = ["applicability", "capabilities", "securityDisposition", "divergence", "owner", "issue", "evidence"];
      if (name === "settings") requiredFields.push("defaultValue");
      for (const field of requiredFields) {
        if (row[field] === undefined || row[field] === "" || (Array.isArray(row[field]) && row[field].length === 0)) {
          unclassified.push(`${name}:${row.id}:${field}`);
        }
      }
    }
  }

  if (unclassified.length > 0) {
    throw new Error(`Ueli parity catalogs contain unclassified rows: ${unclassified.join(", ")}`);
  }

  return {
    counts: Object.fromEntries(CATALOG_NAMES.map((name) => [name, actual[name].length])),
    unclassified,
  };
}

async function writeManifest() {
  const vendorRoot = path.join(defaultRepoRoot, "vendor/ueli");
  const catalogs = classifiedCatalogs(await discoverCatalogs({ vendorRoot }));
  const manifest = {
    schemaVersion: pinnedBaseline.schemaVersion,
    baseline: {
      tag: pinnedBaseline.tag,
      commit: pinnedBaseline.commit,
    },
    catalogs,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  if (process.argv.includes("--write")) {
    await writeManifest();
    console.log(`Wrote ${path.relative(defaultRepoRoot, manifestPath)}`);
    return;
  }
  const result = await auditParityCatalogs();
  console.log(`Ueli parity catalogs verified: ${Object.entries(result.counts).map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
