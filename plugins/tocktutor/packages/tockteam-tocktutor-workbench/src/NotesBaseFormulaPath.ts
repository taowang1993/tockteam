import { notesBaseLinkPath } from './NotesBaseFormulaLink.ts'

const MAX_NOTES_BASE_PATH_LENGTH = 4_096;
const MAX_NOTES_BASE_LINK_VALUES = 10_000;
const MAX_NOTES_BASE_LINK_TEXT_LENGTH = 100_000;

type NotesBaseFormulaResult = { supported: true; value: unknown } | { supported: false };
type NotesBaseFormulaResolver = (property: string) => unknown;
type NotesBaseFileLinkTargetResolver = (normalizedSourcePath: string, normalizedTargetPath: string) => boolean | null;

function normalizedPathParts(value: string) {
  if (value.length > MAX_NOTES_BASE_PATH_LENGTH || value.includes("\0")) return null;
  const parts = value.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.some((part) => part === "." || part === "..") ? null : parts;
}

export function normalizeNotesBaseFilePath(value: string) {
  if (
    value.startsWith("/")
    || value.startsWith("\\")
    || /^[A-Za-z]:[\\/]/u.test(value)
    || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(value)
  ) return null;
  const parts = normalizedPathParts(value);
  return parts && parts.length > 0 ? parts.join("/") : null;
}

export function normalizeNotesBaseLinkPath(value: string) {
  if (value.startsWith("![[")) return null;
  const hasOpeningWrapper = value.startsWith("[[");
  const hasClosingWrapper = value.endsWith("]]");
  if (!hasOpeningWrapper && !hasClosingWrapper) {
    return normalizeNotesBaseFilePath(value);
  }
  if (!hasOpeningWrapper || !hasClosingWrapper) return null;

  const path = value.slice(2, -2);
  if (
    path.length === 0
    || path !== path.trim()
    || /[[\]|#^\u0000-\u001F\u007F]/u.test(path)
  ) {
    return null;
  }
  return normalizeNotesBaseFilePath(path);
}

export function notesBaseFilePathField(value: string, field: string) {
  const path = normalizeNotesBaseFilePath(value);
  if (path === null) return null;
  if (field === "path") return path;
  const separator = path.lastIndexOf("/");
  if (field === "folder") return separator < 0 ? "" : path.slice(0, separator);
  const name = path.slice(separator + 1);
  if (field === "name") return name;
  const extension = name.lastIndexOf(".");
  if (field === "basename") return extension <= 0 ? name : name.slice(0, extension);
  if (field === "ext") return extension <= 0 ? "" : name.slice(extension + 1);
  return null;
}

function notesBaseFilePathValue(value: unknown) {
  return typeof value === "string"
    ? normalizeNotesBaseFilePath(value)
    : notesBaseLinkPath(value);
}

function notesBaseFileInFolder(filePath: string, folder: string) {
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return null;
  const fileParts = normalizedPathParts(filePath);
  const folderParts = normalizedPathParts(folder);
  if (!fileParts || fileParts.length === 0 || !folderParts) return null;

  const normalizedFilePath = fileParts.join("/");
  const normalizedFolder = folderParts.join("/");
  return normalizedFolder === "" || normalizedFilePath.startsWith(`${normalizedFolder}/`);
}

export function evaluateNotesBaseFileInFolderCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  if (
    (
      call.receiver !== "file"
      && call.receiver !== "this.file"
      && !/^file\([\s\S]*\)$/u.test(call.receiver)
    )
    || !args
    || args.length !== 1
    || /,\s*$/u.test(call.args)
  ) {
    return { supported: false };
  }
  const folder = evaluateArg(args[0] ?? "", resolveProperty);
  const projectedFile = call.receiver === "file"
    ? { supported: true as const, value: resolveProperty("file.path") }
    : evaluateArg(call.receiver, resolveProperty);
  const filePath = projectedFile.supported ? projectedFile.value : undefined;
  if (!folder.supported || typeof folder.value !== "string" || typeof filePath !== "string") {
    return { supported: false };
  }
  const inFolder = notesBaseFileInFolder(filePath, folder.value);
  return inFolder === null
    ? { supported: false }
    : { supported: true, value: inFolder };
}

export function evaluateNotesBaseFileHasLinkCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  fileLinksContain: NotesBaseFileLinkTargetResolver | undefined,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  const projectedSourceArgs = call.receiver.startsWith("file(") && call.receiver.endsWith(")")
    ? splitArgs(call.receiver.slice("file(".length, -1))
    : null;
  if (
    (call.receiver !== "file" && call.receiver !== "this.file" && (
      !projectedSourceArgs
      || projectedSourceArgs.length !== 1
      || /,\s*\)$/u.test(call.receiver)
    ))
    || !args
    || args.length !== 1
    || /,\s*$/u.test(call.args)
  ) {
    return { supported: false };
  }

  const candidate = evaluateArg(args[0] ?? "", resolveProperty);
  const normalizedCandidate = candidate.supported
    ? notesBaseFilePathValue(candidate.value)
    : null;
  if (!normalizedCandidate) return { supported: false };
  // Link targets resolve like wikilinks: an extension-less candidate also
  // matches the vault's "<name>.md" file.
  const candidateVariants = normalizedCandidate.endsWith(".md")
    ? [normalizedCandidate]
    : [normalizedCandidate, `${normalizedCandidate}.md`];
  if (call.receiver === "file") {
    const links = resolveProperty("file.links");
    for (const variant of candidateVariants) {
      const matches = notesBaseFileLinksContain(links, variant);
      if (matches === null) return { supported: false };
      if (matches) return { supported: true, value: true };
    }
    return { supported: true, value: false };
  }

  const source = evaluateArg(call.receiver, resolveProperty);
  const sourcePath = source.supported ? notesBaseFilePathValue(source.value) : null;
  if (!sourcePath || !fileLinksContain) return { supported: false };
  try {
    for (const variant of candidateVariants) {
      const matches = fileLinksContain(sourcePath, variant);
      if (matches === null) return { supported: false };
      if (matches) return { supported: true, value: true };
    }
    return { supported: true, value: false };
  } catch {
    return { supported: false };
  }
}

export function evaluateNotesBaseLinkLinksToCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  fileLinksContain: NotesBaseFileLinkTargetResolver | undefined,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  if (!args || args.length !== 1 || /,\s*$/u.test(call.args) || !fileLinksContain) {
    return { supported: false };
  }

  const receiver = evaluateArg(call.receiver, resolveProperty);
  const sourcePath = receiver.supported ? notesBaseLinkPath(receiver.value) : null;
  const targetExpression = args[0]?.trim() ?? "";
  const target = targetExpression === "file"
    ? { supported: true as const, value: resolveProperty("file.path") }
    : evaluateArg(targetExpression, resolveProperty);
  const targetPath = target.supported ? notesBaseFilePathValue(target.value) : null;
  if (!sourcePath || !targetPath) return { supported: false };

  let matches: boolean | null;
  try {
    matches = fileLinksContain(sourcePath, targetPath);
  } catch {
    return { supported: false };
  }
  return matches === null
    ? { supported: false }
    : { supported: true, value: matches };
}

function visitNotesBaseFileLinkTargets(
  links: unknown,
  visit: (normalizedTarget: string) => void,
) {
  try {
    if (!Array.isArray(links) || links[Symbol.iterator] !== Array.prototype[Symbol.iterator]) {
      return false;
    }
    const linkCount = links.length;
    if (
      !Number.isSafeInteger(linkCount)
      || linkCount < 0
      || linkCount > MAX_NOTES_BASE_LINK_VALUES
    ) return false;

    let textLength = 0;
    for (let index = 0; index < linkCount; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(links, String(index));
      if (!descriptor || !("value" in descriptor)) return false;
      const link = descriptor.value;
      if (typeof link !== "string") return false;
      textLength += link.length;
      if (textLength > MAX_NOTES_BASE_LINK_TEXT_LENGTH) return false;
      const normalizedLink = normalizeNotesBaseFilePath(link);
      if (!normalizedLink) return false;
      visit(normalizedLink);
    }
    return true;
  } catch {
    return false;
  }
}

export function notesBaseFileLinkTargets(links: unknown) {
  const targets = new Set<string>();
  return visitNotesBaseFileLinkTargets(links, (target) => targets.add(target))
    ? targets
    : null;
}

export function notesBaseFileLinksSnapshot(links: unknown) {
  const snapshot: string[] = [];
  return visitNotesBaseFileLinkTargets(links, (target) => snapshot.push(target))
    ? snapshot
    : null;
}

export function notesBaseFileLinksContain(links: unknown, normalizedCandidate: string) {
  let matches = false;
  return visitNotesBaseFileLinkTargets(links, (target) => {
    if (target === normalizedCandidate) matches = true;
  })
    ? matches
    : null;
}
