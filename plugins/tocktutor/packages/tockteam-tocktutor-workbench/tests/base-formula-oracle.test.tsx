/** Tockbot NotesBaseFormulaOracleExamples.test.ts vectors at af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba. */
import { describe, expect, it, vi } from "vitest";

import { evaluateNotesBaseFormula } from '../src/NotesBaseFormula.ts'
type Value = unknown

describe("linked Bases formula and function examples", () => {
  const values = {
    author: "Projects/Owner.md",
    authors: ["Projects/Owner.md", "Projects/Other.md"],
    date: "2025-05-27T12:00:00.000Z",
    description: "Plan",
    due_date: "2025-05-27T12:00:00.000Z",
    effort: 2,
    "file.ctime": "2025-05-26T12:00:00.000Z",
    "file.name": "Project.md",
    "file.mtime": "2025-05-27T12:00:00.000Z",
    first_name: "Ada",
    "formula.Owned": 4,
    "formula.price_per_unit": 4.5,
    impact: 2,
    important: true,
    isModified: true,
    last_name: "Lovelace",
    monthlyUses: 3,
    price: 3.4,
    quantity: 2,
    start_date: "2025-05-27T00:00:00.000Z",
    status: "Active",
    tags: ["urgent", "work"],
    tasks: ["Plan", "Review"],
    urgency: 3,
    values: [1, "two", 3],
  } satisfies Record<string, Value | undefined>;

  const context = {
    fileBacklinksFor: (path: string) => path === "Projects/Owner.md" ? ["Notes/Backlink.md"] : [],
    fileCreatedAtFor: (path: string) => path === "Projects/Plan.md" ? Date.UTC(2024, 1, 29) : null,
    fileEmbedsFor: (path: string) => path === "Projects/Owner.md" ? ["Projects/Plan.base"] : [],
    fileLinksContain: (source: string, target: string) => (
      (source === "Projects/Source.md" && target === "Projects/Owner.md")
      || (source === "Projects/Owner.md" && target === "Projects/Target.md")
    ),
    fileLinksFor: (path: string) => path === "Projects/Owner.md" ? ["Projects/Target.md"] : [],
    fileModifiedAtFor: (path: string) => path === "Projects/Plan.md" ? Date.UTC(2025, 6, 31) : null,
    filePropertiesFor: (path: string) => path === "Projects/Plan.md" ? { status: "Done" } : {},
    filePropertiesHas: (path: string, name: string) => path === "Projects/Plan.md" && name === "status",
    fileSizeFor: (path: string) => path === "Projects/Plan.md" ? 4_096 : null,
    fileTagsFor: (path: string) => path === "Projects/Owner.md" ? ["urgent", "project/review"] : [],
    thisFile: {
      relativePath: "Projects/Owner.md",
      sizeBytes: 4_096,
      createdAt: Date.UTC(2024, 1, 29),
      modifiedAt: Date.UTC(2025, 6, 31),
    },
  };

  const resolve = vi.fn((property: string) => {
    if (property === "file.path") return "Projects/Owner.md";
    if (property === "file.links") return ["Projects/Target.md"];
    if (property === "file.properties") return { status: "Done" };
    if (property === "file.tags") return ["urgent", "project/review"];
    return values[property];
  });

  function expectSupported(expression: string) {
    const result = evaluateNotesBaseFormula(expression, resolve, context);
    expect(result.supported, expression).toBe(true);
    return result;
  }

  it("executes the linked Formulas.md examples", () => {
    const expected = new Map<string, unknown>([
      ['start_date + "2w"', "2025-06-10T00:00:00.000Z"],
      ['if(due_date < now() && status != "Done", "Overdue", "")', "Overdue"],
      ['if(price, "$" + price.toFixed(2), "")', "$3.40"],
      ["tasks.length", 2],
      ["(impact * urgency) / effort", 3],
      ['first_name + " " + last_name', "Ada Lovelace"],
      ["monthlyUses * formula.Owned.round()", 12],
      ["formula.price_per_unit * 1.1", 4.95],
      ["file.name.lower()", "project.md"],
      ['tags.contains("urgent")', true],
      ['due_date.format("YYYY-MM-DD")', "2025-05-27"],
    ]);

    for (const [expression, value] of expected) {
      expect(expectSupported(expression)).toEqual({ supported: true, value });
    }
  });

  it("executes the linked Functions.md examples across every documented type", () => {
    const expressions = [
      'escapeHTML("<b>")',
      'date("2025-05-27 12:00:00")',
      'duration("5h") * 2',
      'file(link("[[filename]]"))',
      'file("Projects/Plan.md")',
      'html("<strong>Ready</strong>")',
      'if(isModified, "Modified", "Unmodified")',
      'if(true, "present")',
      'image("https://obsidian.md/images/obsidian-logo-gradient.svg")',
      'icon("arrow-right")',
      'link("filename", icon("plus"))',
      'list("value")',
      "max(1, 3, 2)",
      "min(1, 3, 2)",
      'number("3.4")',
      '1.isTruthy()',
      '"example".isType("string")',
      'true.isType("boolean")',
      "123.toString()",
      'date("2025-05-27").year',
      'date("2025-05-27 12:34:56").month',
      'date("2025-05-27 12:34:56").day',
      'date("2025-05-27 12:34:56").hour',
      'date("2025-05-27 12:34:56").minute',
      'date("2025-05-27 12:34:56").second',
      'date("2025-05-27 12:34:56").millisecond',
      'date("2025-05-27 12:34:56").date().format("YYYY-MM-DD HH:mm:ss")',
      'date("2025-05-27").format("YYYY-MM-DD")',
      "now().time()",
      "today()",
      "file.mtime.relative()",
      'date("2025-05-27").isEmpty()',
      '"hello".contains("ell")',
      '"hello".containsAll("h", "e")',
      '"hello".containsAny("x", "y", "e")',
      '"hello".endsWith("lo")',
      '"".isEmpty()',
      '"Hello world".lower()',
      '"a:b:c:d".replace(/:/, "-")',
      '"a:b:c:d".replace(/:/g, "-")',
      '"John Smith".replace(/(\\w+) (\\w+)/, "$2, $1")',
      '"123".repeat(2)',
      '"hello".reverse()',
      '"hello".slice(1, 4)',
      '"hello".length',
      '"a,b,c,d".split(",", 3)',
      '"a,b,c,d".split(/,/, 3)',
      '"hello".startsWith("he")',
      '"hello world".title()',
      '"  hi  ".trim()',
      "(-5).abs()",
      "(2.1).ceil()",
      "(2.9).floor()",
      "5.isEmpty()",
      "(2.5).round()",
      "(2.3333).round(2)",
      "(3.14159).toFixed(2)",
      "[1,2,3].contains(2)",
      "[1,2,3].containsAll(2,3)",
      "[1,2,3].containsAny(3,4)",
      "[1,2,3,4].filter(value > 2)",
      "[1,[2,3]].flat()",
      "[1,2,3].isEmpty()",
      "[1,2,3].length",
      '[1,2,3].join(",")',
      "[1,2,3,4].map(value + 1)",
      "[1,2,3].reduce(acc + value, 0)",
      'values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)',
      "[1,2,3].reverse()",
      "[1,2,3,4].slice(1,3)",
      "[3,1,2].sort()",
      '["c", "a", "b"].sort()',
      "[1,2,2,3].unique()",
      'link("Projects/Plan.md").asFile()',
      'link("[[filename]]").asFile()',
      'link("Projects/Source.md").linksTo(file)',
      "file.asLink()",
      'file.asLink("Owner")',
      "file.hasLink(otherFile)",
      'file.hasProperty("status")',
      'file.hasTag("project")',
      'file.hasTag("urgent", "project")',
      'file.inFolder("Projects")',
      "{}.isEmpty()",
      '{"a": 1}.keys()',
      '{"a": 1}.values()',
      "/abc/.matches(\"abcde\")",
    ];

    values.otherFile = "Projects/Target.md";
    for (const expression of expressions) expectSupported(expression);
    expect(expectSupported('"a:b:c:d".replace(/:/g, "-")')).toEqual({
      supported: true,
      value: "a-b-c-d",
    });
    expect(expectSupported('"John Smith".replace(/(\\w+) (\\w+)/, "$2, $1")')).toEqual({
      supported: true,
      value: "Smith, John",
    });
    expect(expectSupported('link("Projects/Source.md").linksTo(file)')).toEqual({
      supported: true,
      value: true,
    });

    const random = expectSupported("random()");
    expect(typeof random.value).toBe("number");
    if (typeof random.value === "number") {
      expect(random.value).toBeGreaterThanOrEqual(0);
      expect(random.value).toBeLessThan(1);
    }
  });

  it("executes the Bases syntax this/link examples while preserving bounded exceptions", () => {
    expect(expectSupported("link(file.ctime.date().toString())").supported).toBe(true);
    expect(expectSupported('link("filename", icon("plus"))').supported).toBe(true);
    expect(expectSupported("author == this")).toEqual({ supported: true, value: true });
    expect(expectSupported("authors.contains(this)")).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('link("https://obsidian.md")', resolve, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula("true || process.exit()", resolve, context).supported).toBe(false);
  });
});
