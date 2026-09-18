import { notesBaseIconName } from './NotesBaseFormulaIcon.ts'
import { notesBaseImageText } from './NotesBaseFormulaImage.ts'
import { notesBaseHtmlText } from './NotesBaseFormulaHtml.ts'
import { notesBaseLinkPath, notesBaseLinkText } from './NotesBaseFormulaLink.ts'

export function isNotesBaseRichValue(value: unknown) {
  return notesBaseIconName(value) !== null
    || notesBaseImageText(value) !== null
    || notesBaseHtmlText(value) !== null
    || notesBaseLinkPath(value) !== null;
}

function notesBaseScalarValueText(value: unknown) {
  if (value == null) return "";
  const iconName = notesBaseIconName(value);
  if (iconName !== null) return iconName;
  const imageText = notesBaseImageText(value);
  if (imageText !== null) return imageText;
  const htmlText = notesBaseHtmlText(value);
  if (htmlText !== null) return htmlText;
  const linkText = notesBaseLinkText(value);
  if (linkText !== null) return linkText;
  try {
    if (typeof value === "object") {
      const prototype = Object.getPrototypeOf(value);
      if (prototype === Object.prototype || prototype === null) return "[object Object]";
    }
    return String(value);
  } catch {
    return "";
  }
}

export function notesBaseValueText(value: unknown) {
  return Array.isArray(value)
    ? value.map(notesBaseScalarValueText).join(", ")
    : notesBaseScalarValueText(value);
}
