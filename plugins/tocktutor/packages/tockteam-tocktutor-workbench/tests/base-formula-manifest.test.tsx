/** Tockbot NotesBaseFormulaFunctionsDocChecklist.test.ts vectors at af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba. */
import { describe, expect, it } from "vitest";

import { evaluateNotesBaseFormula } from '../src/NotesBaseFormula.ts'

/**
 * Disposition lock for every function documented on the Obsidian Bases Functions
 * page. Each row is either "implemented" (evaluates to the documented value) or a
 * "documented divergence" (the bounded evaluator fails closed). The supported
 * flags below are the audit truth; changing one without evidence breaks this lock.
 */
const CASES: Array<{
  doc: string;
  expression: string;
  value?: unknown;
  divergence?: string;
}> = [
  // Global
  { doc: "escapeHTML()", expression: `escapeHTML("<a>")`, value: "&lt;a&gt;" },
  { doc: "date()", expression: `date("2025-05-27 12:00:00")`, value: expect.anything() },
  { doc: "duration()", expression: `duration("1d")`, value: expect.anything() },
  { doc: "file()", expression: `file("Projects/Plan.md")`, value: expect.anything() },
  { doc: "html()", expression: `html("<strong>x</strong>")`, value: expect.anything() },
  { doc: "html() with non-allowlisted tag", expression: `html("<b>x</b>")`, divergence: "bounded HTML value accepts only strong/em/s/u/code tags" },
  { doc: "if()", expression: `if(true, "Modified", "Unmodified")`, value: "Modified" },
  { doc: "image()", expression: `image("https://obsidian.md/x.svg")`, value: expect.anything() },
  { doc: "icon()", expression: `icon("arrow-right")`, value: expect.anything() },
  { doc: "link()", expression: `link("[[filename]]")`, value: expect.anything() },
  { doc: "list()", expression: `list("value")`, value: ["value"] },
  { doc: "max()", expression: `max(1, 4, 2)`, value: 4 },
  { doc: "min()", expression: `min(1, 4, 2)`, value: 1 },
  { doc: "now()", expression: `now()`, value: expect.any(String) },
  { doc: "number()", expression: `number("3.4")`, value: 3.4 },
  { doc: "today()", expression: `today()`, value: expect.any(String) },
  { doc: "random()", expression: `random()`, value: expect.any(Number) },
  // Any type
  { doc: "any.isTruthy()", expression: `1.isTruthy()`, value: true },
  { doc: "any.isType()", expression: `"example".isType("string")`, value: true },
  { doc: "any.toString()", expression: `123.toString()`, value: "123" },
  // Date type
  { doc: "date.year field", expression: `date("2025-05-27").year`, value: 2025 },
  { doc: "date.month field", expression: `date("2025-05-27").month`, value: 5 },
  { doc: "date.day field", expression: `date("2025-05-27").day`, value: 27 },
  { doc: "date.date()", expression: `date("2025-05-27 08:30:00").date()`, value: expect.anything() },
  { doc: "date.format()", expression: `date("2025-05-27").format("YYYY-MM-DD")`, value: "2025-05-27" },
  { doc: "date.time()", expression: `date("2025-05-27 23:59:59").time()`, value: expect.any(String) },
  { doc: "date.relative()", expression: `date("2025-05-27").relative()`, value: expect.any(String) },
  { doc: "date.isEmpty()", expression: `date("2025-05-27").isEmpty()`, value: false },
  // String type
  { doc: "string.length field", expression: `"hello".length`, value: 5 },
  { doc: "string.contains()", expression: `"hello".contains("ell")`, value: true },
  { doc: "string.containsAll()", expression: `"hello".containsAll("h", "e")`, value: true },
  { doc: "string.containsAny()", expression: `"hello".containsAny("x", "y", "e")`, value: true },
  { doc: "string.endsWith()", expression: `"hello".endsWith("lo")`, value: true },
  { doc: "string.isEmpty()", expression: `"".isEmpty()`, value: true },
  { doc: "string.lower()", expression: `"HeLLo".lower()`, value: "hello" },
  { doc: "string.replace() with string", expression: `"a:b:c:d".replace(":", "-")`, value: "a-b-c-d" },
  { doc: "string.replace() with regexp", expression: `"John Smith".replace(/(\\w+) (\\w+)/, "$2, $1")`, value: "Smith, John" },
  { doc: "string.repeat()", expression: `"123".repeat(2)`, value: "123123" },
  { doc: "string.reverse()", expression: `"hello".reverse()`, value: "olleh" },
  { doc: "string.slice()", expression: `"hello".slice(1, 4)`, value: "ell" },
  { doc: "string.split()", expression: `"a,b,c,d".split(",", 3)`, value: ["a", "b", "c"] },
  { doc: "string.startsWith()", expression: `"hello".startsWith("he")`, value: true },
  { doc: "string.title()", expression: `"hello world".title()`, value: "Hello World" },
  { doc: "string.trim()", expression: `"  hi  ".trim()`, value: "hi" },
  // Number type
  { doc: "number.abs()", expression: `(-5).abs()`, value: 5 },
  { doc: "number.ceil()", expression: `(2.1).ceil()`, value: 3 },
  { doc: "number.floor()", expression: `(2.9).floor()`, value: 2 },
  { doc: "number.isEmpty()", expression: `5.isEmpty()`, value: false },
  { doc: "number.round()", expression: `(2.5).round()`, value: 3 },
  { doc: "number.round(digits)", expression: `(2.3333).round(2)`, value: 2.33 },
  { doc: "number.toFixed()", expression: `(3.14159).toFixed(2)`, value: "3.14" },
  // List type
  { doc: "list.length field", expression: `[1,2,3].length`, value: 3 },
  { doc: "list.contains()", expression: `[1,2,3].contains(2)`, value: true },
  { doc: "list.containsAll()", expression: `[1,2,3].containsAll(2,3)`, value: true },
  { doc: "list.containsAny()", expression: `[1,2,3].containsAny(3,4)`, value: true },
  { doc: "list.filter()", expression: `[1,2,3,4].filter(value > 2)`, value: [3, 4] },
  { doc: "list.flat()", expression: `[1,[2,3]].flat()`, value: [1, 2, 3] },
  { doc: "list.isEmpty()", expression: `[1,2,3].isEmpty()`, value: false },
  { doc: "list.join()", expression: `[1,2,3].join(",")`, value: "1,2,3" },
  { doc: "list.map()", expression: `[1,2,3,4].map(value + 1)`, value: [2, 3, 4, 5] },
  { doc: "list.reduce()", expression: `[1,2,3].reduce(acc + value, 0)`, value: 6 },
  { doc: "list.reverse()", expression: `[1,2,3].reverse()`, value: [3, 2, 1] },
  { doc: "list.slice()", expression: `[1,2,3,4].slice(1,3)`, value: [2, 3] },
  { doc: "list.sort()", expression: `[3, 1, 2].sort()`, value: [1, 2, 3] },
  { doc: "list.unique()", expression: `[1,2,2,3].unique()`, value: [1, 2, 3] },
  // Link type
  { doc: "link.asFile()", expression: `link("[[Projects/Plan]]").asFile()`, value: expect.anything() },
  { doc: "link.linksTo()", expression: `link("[[filename]]").linksTo(file("target"))`, divergence: "needs vault file context" },
  // Object type
  { doc: "object.isEmpty()", expression: `{}.isEmpty()`, value: true },
  { doc: "object.keys()", expression: `{"a": 1, "b": 2}.keys()`, value: ["a", "b"] },
  { doc: "object.values()", expression: `{"a": 1, "b": 2}.values()`, value: [1, 2] },
  // Regular expression type
  { doc: "regexp.matches()", expression: `/abc/.matches("abcde")`, value: true },
];

describe("Bases Functions doc disposition checklist", () => {
  it.each(CASES.map((entry) => [entry.doc, entry] as const))("%s", (_doc, entry) => {
    const result = evaluateNotesBaseFormula(entry.expression, () => undefined, {});
    if (entry.divergence) {
      expect(result, entry.divergence).toEqual({ supported: false });
      return;
    }
    expect(result.supported, `expected implemented: ${entry.expression}`).toBe(true);
    if (result.supported && entry.value !== undefined) {
      expect(result.value).toEqual(entry.value);
    }
  });

  it("locks the complete documented function count", () => {
    expect(CASES.length).toBe(71);
  });
});
