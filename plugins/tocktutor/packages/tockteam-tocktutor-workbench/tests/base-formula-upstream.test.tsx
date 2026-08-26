/** Tockbot NotesBaseFormula.test.ts vectors at af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba. */
import { describe, expect, it, vi } from "vitest";

import { evaluateNotesBaseFormula, evaluateNotesBaseSummary } from '../src/NotesBaseFormula.ts'
import { NOTES_BASE_ICON_NAMES, notesBaseIconName } from '../src/NotesBaseFormulaIcon.ts'
import { notesBaseImagePath, notesBaseImageUrl } from '../src/NotesBaseFormulaImage.ts'
import { notesBaseFileLinksContain } from '../src/NotesBaseFormulaPath.ts'
import { notesBaseValueText } from '../src/NotesBaseFormulaValue.ts'
type Value = unknown

function readFixtureProperty(target: readonly string[], property: PropertyKey): unknown {
  // SAFETY: hostile-fixture proxies wrap plain arrays; forwarding the key as an array index preserves fixture behavior.
  return target[property as keyof typeof target];
}

function expectedTimezoneOffset(date: Date, separator: string) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}${separator}${minutes}`;
}

describe("NotesBaseFormula", () => {
  const row = { status: "active", title: "Task", query: "act", tags: ["daily", "review"], points: 3, estimate: "4.5", done: false };

  it("evaluates the safe formula subset without eval", () => {
    expect(evaluateNotesBaseFormula("upper(note.status)", (property) => row[property.replace(/^note\./u, "")])).toEqual({ supported: true, value: "ACTIVE" });
    expect(evaluateNotesBaseFormula("concat(file.name, \" — \", lower(note.status))", (property) => property === "file.name" ? "Task" : row[property.replace(/^note\./u, "")])).toEqual({ supported: true, value: "Task — active" });
    expect(evaluateNotesBaseFormula("contains(note.tags, \"review\")", (property) => row[property.replace(/^note\./u, "")])).toEqual({ supported: true, value: true });
  });

  it("resolves bounded quoted Obsidian note-property references", () => {
    const values = {
      "note.owner.team": "platform",
      "note.project status": "active review",
      "note.score/value": 4,
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula('note["project status"]', resolve)).toEqual({ supported: true, value: "active review" });
    expect(evaluateNotesBaseFormula("note['owner.team']", resolve)).toEqual({ supported: true, value: "platform" });
    expect(evaluateNotesBaseFormula('note["project status"].title()', resolve)).toEqual({ supported: true, value: "Active Review" });
    expect(evaluateNotesBaseFormula('note["score/value"] + 2', resolve)).toEqual({ supported: true, value: 6 });

    for (const expression of [
      "note[status]",
      'note[""]',
      'note["project status"',
      'note["project status"]extra',
      'note["project\\status"]',
      `note["project\0status"]`,
      `note["${"x".repeat(100_001)}"]`,
      'note[process.exit()]',
      "process.exit",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("selects bounded list values with Obsidian zero-based indices", () => {
    const values = {
      "note.project tags": ["planned", "active"],
      "note.status": "in review",
      "note.tags": ["daily", "review"],
      "note.values": [false, 3, null],
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("note.tags[0]", resolve)).toEqual({ supported: true, value: "daily" });
    expect(evaluateNotesBaseFormula('note["project tags"][1]', resolve)).toEqual({ supported: true, value: "active" });
    expect(evaluateNotesBaseFormula("[1, 2, 3][1]", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("list(note.status)[0].title()", resolve)).toEqual({ supported: true, value: "In Review" });
    expect(evaluateNotesBaseFormula("note.values[1] + 4", resolve)).toEqual({ supported: true, value: 7 });
    expect(evaluateNotesBaseFormula("note.values[0]", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.values[2]", resolve)).toEqual({ supported: true, value: null });
  });

  it("rejects invalid, unsafe, or excessive Base list indices", () => {
    const accessorList = ["safe"];
    Object.defineProperty(accessorList, "0", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("list accessors must not run");
      },
    });
    const hostileList = new Proxy(["safe"], {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      },
    });
    const values = {
      "note.accessor": accessorList,
      "note.hostile": hostileList,
      "note.large": Array.from({ length: 10_001 }, () => "x"),
      "note.maximum": [...Array.from({ length: 9_999 }, () => "x"), "last"],
      "note.metadata": { first: "value" },
      "note.nested": [["first", "second"]],
      "note.nonFinite": [Number.POSITIVE_INFINITY],
      "note.oversized": ["x".repeat(100_001)],
      "note.sparse": Array(1),
      "note.status": "active",
      "note.tags": ["daily", "review"],
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("note.maximum[9999]", resolve)).toEqual({ supported: true, value: "last" });
    expect(evaluateNotesBaseFormula('note.metadata["first"]', resolve)).toEqual({ supported: true, value: "value" });

    for (const expression of [
      "note.tags[-1]",
      "note.tags[1.5]",
      "note.tags[01]",
      "note.tags[1e0]",
      "note.tags[note.index]",
      "note.tags[]",
      "note.tags[2]",
      "note.maximum[10000]",
      "note.tags[0][0]",
      "note.status[0]",
      "note.nested[0]",
      "note.nonFinite[0]",
      "note.oversized[0]",
      "note.sparse[0]",
      "note.large[0]",
      "note.accessor[0]",
      "note.hostile[0]",
      "process.exit()[0]",
      "note.tags[0]extra",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("evaluates Obsidian Bases global formula helpers", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("if(note.done, \"Done\", \"Open\")", resolve)).toEqual({ supported: true, value: "Open" });
    expect(evaluateNotesBaseFormula("if(contains(note.tags, \"review\"), \"Review\", \"Other\")", resolve)).toEqual({ supported: true, value: "Review" });
    expect(evaluateNotesBaseFormula("min(9, note.points, 2)", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("max(9, note.points, 2)", resolve)).toEqual({ supported: true, value: 9 });
    expect(evaluateNotesBaseFormula("number(note.estimate)", resolve)).toEqual({ supported: true, value: 4.5 });
    expect(evaluateNotesBaseFormula("number(note.done)", resolve)).toEqual({ supported: true, value: 0 });
  });

  it("constructs bounded Obsidian icon values", () => {
    const resolve = (property: string) => {
      if (property === "note.icon") return "calendar";
      if (property === "note.unknown") return "not-a-real-icon";
      if (property === "note.notText") return 7;
      return undefined;
    };

    const arrowDown = evaluateNotesBaseFormula('icon("arrow-down")', resolve);
    const check = evaluateNotesBaseFormula('icon("check")', resolve);
    const arrowLeft = evaluateNotesBaseFormula('icon("arrow-left")', resolve);
    const arrowRight = evaluateNotesBaseFormula('icon("arrow-right")', resolve);
    const arrowUp = evaluateNotesBaseFormula('icon("arrow-up")', resolve);
    const arrowUpDown = evaluateNotesBaseFormula('icon("arrow-up-down")', resolve);
    const bell = evaluateNotesBaseFormula('icon("bell")', resolve);
    const bookmark = evaluateNotesBaseFormula('icon("bookmark")', resolve);
    const bookOpen = evaluateNotesBaseFormula('icon("book-open")', resolve);
    const chevronDown = evaluateNotesBaseFormula('icon("chevron-down")', resolve);
    const chevronLeft = evaluateNotesBaseFormula('icon("chevron-left")', resolve);
    const chevronRight = evaluateNotesBaseFormula('icon("chevron-right")', resolve);
    const chevronUp = evaluateNotesBaseFormula('icon("chevron-up")', resolve);
    const circleCheck = evaluateNotesBaseFormula('icon("circle-check")', resolve);
    const circleX = evaluateNotesBaseFormula('icon("circle-x")', resolve);
    const clock = evaluateNotesBaseFormula('icon("clock")', resolve);
    const copy = evaluateNotesBaseFormula('icon("copy")', resolve);
    const fileText = evaluateNotesBaseFormula('icon("file-text")', resolve);
    const folder = evaluateNotesBaseFormula('icon("folder")', resolve);
    const heart = evaluateNotesBaseFormula('icon("heart")', resolve);
    const house = evaluateNotesBaseFormula('icon("house")', resolve);
    const info = evaluateNotesBaseFormula('icon("info")', resolve);
    const landmark = evaluateNotesBaseFormula('icon("landmark")', resolve);
    const link = evaluateNotesBaseFormula('icon("link")', resolve);
    const mail = evaluateNotesBaseFormula('icon("mail")', resolve);
    const map = evaluateNotesBaseFormula('icon("map")', resolve);
    const mapPin = evaluateNotesBaseFormula('icon("map-pin")', resolve);
    const navigation = evaluateNotesBaseFormula('icon("navigation")', resolve);
    const minus = evaluateNotesBaseFormula('icon("minus")', resolve);
    const pencil = evaluateNotesBaseFormula('icon("pencil")', resolve);
    const plus = evaluateNotesBaseFormula('icon("plus")', resolve);
    const search = evaluateNotesBaseFormula('icon("search")', resolve);
    const settings = evaluateNotesBaseFormula('icon("settings")', resolve);
    const table = evaluateNotesBaseFormula('icon("table")', resolve);
    const tag = evaluateNotesBaseFormula('icon("tag")', resolve);
    const trash2 = evaluateNotesBaseFormula('icon("trash-2")', resolve);
    const triangleAlert = evaluateNotesBaseFormula('icon("triangle-alert")', resolve);
    const user = evaluateNotesBaseFormula('icon("user")', resolve);
    const utensils = evaluateNotesBaseFormula('icon("utensils")', resolve);
    const calendar = evaluateNotesBaseFormula("icon(note.icon)", resolve);
    expect(arrowDown.supported && notesBaseIconName(arrowDown.value)).toBe("arrow-down");
    expect(check.supported && notesBaseIconName(check.value)).toBe("check");
    expect(arrowLeft.supported && notesBaseIconName(arrowLeft.value)).toBe("arrow-left");
    expect(arrowRight.supported && notesBaseIconName(arrowRight.value)).toBe("arrow-right");
    expect(arrowUp.supported && notesBaseIconName(arrowUp.value)).toBe("arrow-up");
    expect(arrowUpDown.supported && notesBaseIconName(arrowUpDown.value)).toBe("arrow-up-down");
    expect(bell.supported && notesBaseIconName(bell.value)).toBe("bell");
    expect(bookmark.supported && notesBaseIconName(bookmark.value)).toBe("bookmark");
    expect(bookOpen.supported && notesBaseIconName(bookOpen.value)).toBe("book-open");
    expect(chevronDown.supported && notesBaseIconName(chevronDown.value)).toBe("chevron-down");
    expect(chevronLeft.supported && notesBaseIconName(chevronLeft.value)).toBe("chevron-left");
    expect(chevronRight.supported && notesBaseIconName(chevronRight.value)).toBe("chevron-right");
    expect(chevronUp.supported && notesBaseIconName(chevronUp.value)).toBe("chevron-up");
    expect(circleCheck.supported && notesBaseIconName(circleCheck.value)).toBe("circle-check");
    expect(circleX.supported && notesBaseIconName(circleX.value)).toBe("circle-x");
    expect(clock.supported && notesBaseIconName(clock.value)).toBe("clock");
    expect(copy.supported && notesBaseIconName(copy.value)).toBe("copy");
    expect(fileText.supported && notesBaseIconName(fileText.value)).toBe("file-text");
    expect(folder.supported && notesBaseIconName(folder.value)).toBe("folder");
    expect(heart.supported && notesBaseIconName(heart.value)).toBe("heart");
    expect(house.supported && notesBaseIconName(house.value)).toBe("house");
    expect(info.supported && notesBaseIconName(info.value)).toBe("info");
    expect(landmark.supported && notesBaseIconName(landmark.value)).toBe("landmark");
    expect(link.supported && notesBaseIconName(link.value)).toBe("link");
    expect(mail.supported && notesBaseIconName(mail.value)).toBe("mail");
    expect(map.supported && notesBaseIconName(map.value)).toBe("map");
    expect(mapPin.supported && notesBaseIconName(mapPin.value)).toBe("map-pin");
    expect(navigation.supported && notesBaseIconName(navigation.value)).toBe("navigation");
    expect(minus.supported && notesBaseIconName(minus.value)).toBe("minus");
    expect(pencil.supported && notesBaseIconName(pencil.value)).toBe("pencil");
    expect(plus.supported && notesBaseIconName(plus.value)).toBe("plus");
    expect(search.supported && notesBaseIconName(search.value)).toBe("search");
    expect(settings.supported && notesBaseIconName(settings.value)).toBe("settings");
    expect(table.supported && notesBaseIconName(table.value)).toBe("table");
    expect(tag.supported && notesBaseIconName(tag.value)).toBe("tag");
    expect(trash2.supported && notesBaseIconName(trash2.value)).toBe("trash-2");
    expect(triangleAlert.supported && notesBaseIconName(triangleAlert.value)).toBe("triangle-alert");
    expect(user.supported && notesBaseIconName(user.value)).toBe("user");
    expect(utensils.supported && notesBaseIconName(utensils.value)).toBe("utensils");
    expect(calendar.supported && notesBaseIconName(calendar.value)).toBe("calendar");
    for (const name of NOTES_BASE_ICON_NAMES) {
      const result = evaluateNotesBaseFormula(`icon("${name}")`, resolve);
      expect(result.supported && notesBaseIconName(result.value)).toBe(name);
    }
    expect(evaluateNotesBaseFormula('icon("check").isEmpty()', resolve)).toEqual({ supported: true, value: false });
    expect(notesBaseIconName({ name: "check" })).toBeNull();
    expect(evaluateNotesBaseFormula(`icon("${"x".repeat(1_001)}")`, resolve).supported).toBe(false);

    for (const expression of [
      'icon("")',
      'icon("Arrow-Down")',
      'icon("Arrow-Left")',
      'icon("Arrow-Up")',
      'icon("Arrow-Up-Down")',
      'icon("Check")',
      'icon("Map")',
      'icon("Navigation")',
      'icon("Bell")',
      'icon("Bookmark")',
      'icon("Circle-Check")',
      'icon("Circle-X")',
      'icon("Chevron-Down")',
      'icon("Chevron-Left")',
      'icon("Chevron-Right")',
      'icon("Chevron-Up")',
      'icon("Clock")',
      'icon("Copy")',
      'icon("File-Text")',
      'icon("Folder")',
      'icon("Heart")',
      'icon("House")',
      'icon("Info")',
      'icon("Landmark")',
      'icon("Link")',
      'icon("Mail")',
      'icon("Map-Pin")',
      'icon("Minus")',
      'icon("Pencil")',
      'icon("Plus")',
      'icon("Search")',
      'icon("Settings")',
      'icon("Table")',
      'icon("Tag")',
      'icon("Trash-2")',
      'icon("Triangle-Alert")',
      'icon("User")',
      'icon("Utensils")',
      'icon("not-a-real-icon")',
      "icon(note.unknown)",
      "icon(note.notText)",
      "icon()",
      'icon("check", "calendar")',
      'icon("check",)',
      "icon(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("constructs the canonical Obsidian filter icon without broadening icon input", () => {
    const result = evaluateNotesBaseFormula('icon("filter")', () => undefined);

    expect(result.supported && notesBaseIconName(result.value)).toBe("filter");
    expect(evaluateNotesBaseFormula('icon("Filter")', () => undefined).supported).toBe(false);
    expect(notesBaseIconName({ name: "filter" })).toBeNull();
  });

  it("constructs bounded Obsidian HTML values with inert text projections", () => {
    const values = {
      "note.deep": `${"<strong>".repeat(65)}Ready${"</strong>".repeat(65)}`,
      "note.excessiveNodes": "<br>".repeat(1_001),
      "note.hostile": new Proxy({}, {
        getPrototypeOf() {
          throw new Error("prototype trap must not run");
        },
      }),
      "note.markup": "<strong>Ready</strong><br><em>now</em>",
      "note.oversized": "x".repeat(100_001),
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    const result = evaluateNotesBaseFormula("html(note.markup)", resolve);
    expect(result.supported).toBe(true);
    expect(result.supported && notesBaseValueText(result.value)).toBe("Ready\nnow");

    for (const expression of [
      'html("<script>alert(1)</script>")',
      'html("<!-- unsafe -->Ready")',
      'html("<img src=x>")',
      'html("<strong class=unsafe>Ready</strong>")',
      'html("<strong><em>Ready</strong></em>")',
      "html(note.deep)",
      "html(note.excessiveNodes)",
      "html(note.hostile)",
      "html(note.oversized)",
      "html(7)",
      "html()",
      "html(note.markup, note.markup)",
      "html(note.markup,)",
      "html(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("constructs bounded Obsidian image values with inert URL projections", () => {
    const values = {
      "note.cover": "https://Images.Example.test:443/covers/plan%20review.png?size=small",
      "note.controlled": "https://exa\tmple.test/cover.png",
      "note.credentials": "https://user:secret@example.test/cover.png",
      "note.fragment": "https://example.test/cover.png#section",
      "note.hostile": new Proxy({}, {
        getPrototypeOf() {
          throw new Error("prototype trap must not run");
        },
      }),
      "note.local": "Attachments/cover.png",
      "note.localBackslashes": "Attachments\\cover.webp",
      "note.nonImage": "Attachments/report.pdf",
      "note.unsafeLocal": "../cover.png",
      "note.fileUrl": "file:///Users/max/cover.png",
      "note.oversized": `https://example.test/${"x".repeat(4_097)}`,
      "note.spoofed": { url: "https://example.test/cover.png" },
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    const result = evaluateNotesBaseFormula("image(note.cover)", resolve);
    expect(result.supported).toBe(true);
    expect(result.supported && notesBaseValueText(result.value)).toBe(
      "https://images.example.test/covers/plan%20review.png?size=small",
    );
    expect(result.supported && notesBaseImageUrl(result.value)).toBe(
      "https://images.example.test/covers/plan%20review.png?size=small",
    );
    expect(notesBaseImageUrl({ url: "https://example.test/cover.png" })).toBeNull();

    const local = evaluateNotesBaseFormula("image(note.local)", resolve);
    expect(local.supported).toBe(true);
    expect(local.supported && notesBaseValueText(local.value)).toBe("Attachments/cover.png");
    expect(local.supported && notesBaseImagePath(local.value)).toBe("Attachments/cover.png");
    const localBackslashes = evaluateNotesBaseFormula("image(note.localBackslashes)", resolve);
    expect(localBackslashes.supported && notesBaseImagePath(localBackslashes.value)).toBe("Attachments/cover.webp");
    const localFile = evaluateNotesBaseFormula('image(file("Attachments/cover.png"))', resolve);
    expect(localFile.supported && notesBaseImagePath(localFile.value)).toBe("Attachments/cover.png");
    expect(notesBaseImagePath({ path: "Attachments/cover.png" })).toBeNull();

    expect(evaluateNotesBaseFormula("image(note.cover).isEmpty()", resolve)).toEqual({
      supported: true,
      value: false,
    });

    for (const expression of [
      "image(note.credentials)",
      "image(note.controlled)",
      "image(note.fragment)",
      "image(note.hostile)",
      "image(note.nonImage)",
      "image(note.unsafeLocal)",
      "image(note.fileUrl)",
      "image(note.oversized)",
      "image(note.spoofed)",
      'image(" http://example.test/cover.png ")',
      'image("http:/example.test/cover.png")',
      'image("https:example.test/cover.png")',
      'image("javascript:alert(1)")',
      'image("data:image/png;base64,AA==")',
      "image(7)",
      "image()",
      "image(note.cover, note.cover)",
      "image(note.cover,)",
      "image(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("constructs bounded Obsidian links for existing file consumers", () => {
    const resolve = (property: string) => {
      if (property === "file.links") return ["Projects/Plan.md", "Archive.md"];
      return row[property.replace(/^note\./u, "") as keyof typeof row];
    };

    expect(evaluateNotesBaseFormula('file(link("Projects/Plan.md", "Plan"))', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file.hasLink(link("Projects\\\\Plan.md", "Plan"))', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("parses documented wikilink paths into bounded Obsidian links", () => {
    const resolve = () => undefined;

    const link = evaluateNotesBaseFormula('link("[[Projects/Plan.md]]")', resolve);
    expect(link.supported, "documented wikilink path").toBe(true);
    expect(link.supported && notesBaseValueText(link.value)).toBe("Projects/Plan.md");
    expect(evaluateNotesBaseFormula('link("[[Projects/Plan.md]]").asFile()', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file(link("[[Projects/Plan.md]]"))', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });

    for (const expression of [
      'link("[[]]")',
      'link("![[Projects/Plan.md]]")',
      'link("[[Projects/Plan.md|Plan]]")',
      'link("[[Projects/Plan.md#Scope]]")',
      'link("[[Projects/Plan.md^block]]")',
      'link("[[Projects/../Secrets.md]]")',
      'link("[[Projects/[Plan].md]]")',
      'link("[[Projects\nPlan.md]]")',
      'link("[[Projects/Plan.md]")',
      'link("[Projects/Plan.md]]")',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("uses bounded primitive scalar display values for Obsidian links", () => {
    const hostileDisplay = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("prototype trap must not run");
      },
    });
    const values = {
      "note.count": 42,
      "note.done": false,
      "note.empty": null,
      "note.hostile": hostileDisplay,
      "note.infinity": Number.POSITIVE_INFINITY,
      "note.list": ["Plan"],
      "note.metadata": { label: "Plan" },
      "note.oversized": "x".repeat(100_001),
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    for (const [expression, label] of [
      ['link("Projects/Plan.md", note.count)', "42"],
      ['link("Projects/Plan.md", note.done)', "false"],
      ['link("Projects/Plan.md", note.empty)', "Projects/Plan.md"],
      ['link("Projects/Plan.md", note.missing)', "Projects/Plan.md"],
    ] as const) {
      const result = evaluateNotesBaseFormula(expression, resolve);
      expect(result.supported, expression).toBe(true);
      expect(result.supported && notesBaseValueText(result.value), expression).toBe(label);
      expect(evaluateNotesBaseFormula(`file(${expression})`, resolve), expression).toEqual({
        supported: true,
        value: "Projects/Plan.md",
      });
    }

    for (const expression of [
      'link("Projects/Plan.md", note.infinity)',
      'link("Projects/Plan.md", note.hostile)',
      'link("Projects/Plan.md", note.list)',
      'link("Projects/Plan.md", note.metadata)',
      'link("Projects/Plan.md", note.oversized)',
      'link("Projects/Plan.md", link("Other.md"))',
      'link("Projects/Plan.md", html("<strong>Plan</strong>"))',
      'link("Projects/Plan.md", process.exit())',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("uses evaluator-owned icons as Obsidian link display values", () => {
    const expression = 'link("Projects/Plan.md", icon("plus"))';
    const result = evaluateNotesBaseFormula(expression, () => undefined);

    expect(result.supported).toBe(true);
    expect(result.supported && notesBaseValueText(result.value)).toBe("plus");
    expect(evaluateNotesBaseFormula(`file(${expression})`, () => undefined)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
  });

  it("converts evaluator-owned Obsidian links to bounded file projections", () => {
    const hostileLinkLike = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("prototype trap must not run");
      },
    });
    const resolve = (property: string) => {
      if (property === "file.links") return ["Projects/Plan.md"];
      if (property === "note.linkLike") return { path: "Projects/Plan.md" };
      if (property === "note.hostileLinkLike") return hostileLinkLike;
      return row[property.replace(/^note\./u, "") as keyof typeof row];
    };

    expect(evaluateNotesBaseFormula('link("Projects/Plan.md", "Plan").asFile()', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula(
      'file.hasLink(link("Projects/Plan.md", "Plan").asFile())',
      resolve,
    )).toEqual({ supported: true, value: true });

    for (const expression of [
      'link("Plan.md").asFile(1)',
      'link("Plan.md").asFile(,)',
      'link("Plan.md").asFile(process.exit())',
      'link("Plan.md").asFile().asFile()',
      "note.linkLike.asFile()",
      "note.hostileLinkLike.asFile()",
      'file("Plan.md").asFile()',
      "process.exit().asFile()",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("projects the active Obsidian file as an evaluator-owned link", () => {
    const resolve = (property: string) => {
      if (property === "file.path") return "Projects/Plan.md";
      if (property === "file.links") return ["Projects/Plan.md"];
      if (property === "note.label") return "Project plan";
      return undefined;
    };

    expect(evaluateNotesBaseFormula("file.asLink().asFile()", resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula("file(file.asLink(note.label))", resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula("file.hasLink(file.asLink())", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file("Archive/Plan.md").asLink(note.label).asFile()', resolve)).toEqual({
      supported: true,
      value: "Archive/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file(link("Archive/Plan.md")).asLink().asFile()', resolve)).toEqual({
      supported: true,
      value: "Archive/Plan.md",
    });

    for (const expression of [
      "file.asLink(1)",
      'file.asLink("Plan",)',
      'file.asLink("Plan", "Extra")',
      `file.asLink("${"x".repeat(100_001)}")`,
      "file.asLink(process.exit())",
      'file.asLink(icon("plus"))',
      "note.file.asLink()",
      '"Archive/Plan.md".asLink()',
      'file("../Plan.md").asLink()',
      'file("Plan.md",).asLink()',
      'file("Plan.md").asLink(false)',
      "process.exit().asLink()",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }

    for (const path of [undefined, 1, "", "../Plan.md", "/Plan.md", "https://example.com/Plan.md", "Plan\0.md"]) {
      expect(evaluateNotesBaseFormula("file.asLink()", (property) => (
        property === "file.path" ? path : undefined
      )).supported, String(path)).toBe(false);
    }
  });

  it("checks loaded note relationships with the Obsidian link linksTo helper", () => {
    const resolve = (property: string) => {
      if (property === "file.path") return "Target.md";
      return undefined;
    };
    const linksByPath = {
      "Projects/Source.md": ["Target.md", "Archive.md"],
      "Target.md": [],
    } satisfies Record<string, Value | undefined>;
    const fileLinksContain = vi.fn((sourcePath: string, targetPath: string) => (
      notesBaseFileLinksContain(linksByPath[sourcePath], targetPath)
    ));
    const context = { fileLinksContain };

    expect(evaluateNotesBaseFormula(
      'link("Projects/Source.md", "Source").linksTo(file)',
      resolve,
      context,
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'link("Projects/Source.md").linksTo(file("Missing.md"))',
      resolve,
      context,
    )).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula(
      'if(link("Projects/Source.md").linksTo(file), "linked", "missing")',
      resolve,
      context,
    )).toEqual({ supported: true, value: "linked" });
    expect(evaluateNotesBaseFormula(
      'list(link("Projects/Source.md").linksTo(file)).contains(true)',
      resolve,
      context,
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'number(link("Projects/Source.md").linksTo(file)).toFixed(0)',
      resolve,
      context,
    )).toEqual({ supported: true, value: "1" });
    expect(evaluateNotesBaseFormula(
      'min(if(link("Projects/Source.md").linksTo(file), 1, 0), 2)',
      resolve,
      context,
    )).toEqual({ supported: true, value: 1 });
    expect(fileLinksContain).toHaveBeenCalledWith("Projects/Source.md", "Target.md");
  });

  it("rejects unsafe link linksTo receivers, targets, contexts, and link-list shapes", () => {
    const hostileLinks = new Proxy([], {
      get() {
        throw new Error("hostile link list must fail closed");
      },
    });
    const resolve = (property: string) => {
      if (property === "file.path") return "Target.md";
      if (property === "note.linkLike") return { path: "Source.md" };
      return undefined;
    };
    const supportedContext = { fileLinksContain: (_sourcePath: string, targetPath: string) => (
      notesBaseFileLinksContain(["Target.md"], targetPath)
    ) };

    for (const expression of [
      'link("Source.md").linksTo()',
      'link("Source.md").linksTo(file,)',
      'link("Source.md").linksTo(file, file("Other.md"))',
      'link("Source.md").linksTo("../Target.md")',
      'link("Source.md").linksTo("https://example.com/Target.md")',
      'file("Source.md").linksTo(file)',
      "note.linkLike.linksTo(file)",
      "process.exit().linksTo(file)",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve, supportedContext).supported, expression).toBe(false);
    }

    expect(evaluateNotesBaseFormula('link("Source.md").linksTo(file)', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'link("Missing.md").linksTo(file)',
      resolve,
      { fileLinksContain: () => null },
    ).supported).toBe(false);
    expect(() => evaluateNotesBaseFormula(
      'link("Source.md").linksTo(file)',
      resolve,
      { fileLinksContain: () => { throw new Error("resolver must fail closed"); } },
    )).not.toThrow();

    const invalidLinkLists = [
      "Target.md",
      ["Target.md", 1],
      ["Projects/../Target.md"],
      Array.from({ length: 10_001 }, (_, index) => `Note-${index}.md`),
      Array.from({ length: 26 }, (_, index) => `${index}-${"x".repeat(3_995)}.md`),
      hostileLinks,
    ];
    for (const [index, links] of invalidLinkLists.entries()) {
      let result: ReturnType<typeof evaluateNotesBaseFormula> | undefined;
      expect(() => {
        result = evaluateNotesBaseFormula(
          'link("Source.md").linksTo(file)',
          resolve,
          { fileLinksContain: (_sourcePath, targetPath) => notesBaseFileLinksContain(links, targetPath) },
        );
      }).not.toThrow();
      expect(result?.supported, `invalid link list ${index}`).toBe(false);
    }
  });

  it("rejects malformed, unsafe, or excessive Obsidian links", () => {
    const hostileLinkLike = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("prototype trap must not run");
      },
    });
    const resolve = (property: string) => {
      if (property === "note.linkLike") return { path: "Projects/Plan.md", display: "Plan" };
      if (property === "note.hostileLinkLike") return hostileLinkLike;
      return row[property.replace(/^note\./u, "") as keyof typeof row];
    };
    const unsupported = [
      "link()",
      'link("Plan.md",)',
      'link("Plan.md", "Plan", "Extra")',
      'link("../Plan.md")',
      'link("/Plan.md")',
      'link("https://example.com/Plan.md")',
      `link("Plan.md", "${"x".repeat(100_001)}")`,
      "link(process.exit())",
      "file(note.linkLike)",
      "file.hasLink(note.linkLike)",
      "file(note.hostileLinkLike)",
      "file.hasLink(note.hostileLinkLike)",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("evaluates only the selected Obsidian if branch", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const resolveCondition = vi.fn((property: string) => property === "note.done" ? false : undefined);

    expect(evaluateNotesBaseFormula("if(true, note.points + 1, process.exit())", resolve)).toEqual({
      supported: true,
      value: 4,
    });
    expect(evaluateNotesBaseFormula("if(false, process.exit(), note.points * 2)", resolve)).toEqual({
      supported: true,
      value: 6,
    });
    expect(evaluateNotesBaseFormula("if(false, process.exit())", resolve)).toEqual({
      supported: true,
      value: null,
    });
    expect(evaluateNotesBaseFormula('if(true, if(false, process.exit(), "Open"), process.exit())', resolve)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(evaluateNotesBaseFormula('if(note.done, process.exit(), "Open")', resolveCondition)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(resolveCondition).toHaveBeenCalledOnce();
    expect(resolveCondition).toHaveBeenCalledWith("note.done");
  });

  it("rejects malformed conditionals and unsupported selected expressions", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const unsupported = [
      "if()",
      "if(true)",
      "if(true, 1, 2, 3)",
      "if(true, 1,)",
      "if(process.exit(), 1, 2)",
      "if(true, process.exit(), 2)",
      "if(false, 1, process.exit())",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("converts Obsidian date values to Unix epoch milliseconds with number", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 27, 12, 34, 56, 789));
    try {
      const dateRow = { ...row, meeting: "2025-05-27 12:34:56" };
      const resolve = (property: string) => dateRow[property.replace(/^note\./u, "") as keyof typeof dateRow];

      expect(evaluateNotesBaseFormula('number(date("2025-05-27 12:34:56"))', resolve)).toEqual({
        supported: true,
        value: new Date(2025, 4, 27, 12, 34, 56).getTime(),
      });
      expect(evaluateNotesBaseFormula("number(note.meeting)", resolve)).toEqual({
        supported: true,
        value: new Date(2025, 4, 27, 12, 34, 56).getTime(),
      });
      expect(evaluateNotesBaseFormula("number(today())", resolve)).toEqual({
        supported: true,
        value: new Date(2025, 4, 27).getTime(),
      });
      expect(evaluateNotesBaseFormula("number(now())", resolve)).toEqual({
        supported: true,
        value: new Date(2025, 4, 27, 12, 34, 56, 789).getTime(),
      });
      expect(evaluateNotesBaseFormula("number(note.estimate)", resolve)).toEqual({ supported: true, value: 4.5 });
      expect(evaluateNotesBaseFormula("number(note.done)", resolve)).toEqual({ supported: true, value: 0 });
      expect(evaluateNotesBaseFormula('number("2025-05-27")', resolve).supported).toBe(false);
      expect(evaluateNotesBaseFormula('number(date("2025-02-29"))', resolve).supported).toBe(false);
      expect(evaluateNotesBaseFormula("number(now(), 1)", resolve).supported).toBe(false);
      expect(evaluateNotesBaseFormula("number(process.exit())", resolve).supported).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("groups supported expressions with parentheses to preserve Obsidian formula precedence", () => {
    const groupedRow = {
      ...row,
      part: 1,
      whole: 4,
      adjustment: 2,
    };
    const resolve = (property: string) => groupedRow[property.replace(/^note\./u, "") as keyof typeof groupedRow];

    expect(evaluateNotesBaseFormula("(note.part / note.whole) * 100", resolve)).toEqual({
      supported: true,
      value: 25,
    });
    expect(evaluateNotesBaseFormula("note.points + (note.adjustment * 2)", resolve)).toEqual({
      supported: true,
      value: 7,
    });
    expect(evaluateNotesBaseFormula("((note.points + note.adjustment) * 2)", resolve)).toEqual({
      supported: true,
      value: 10,
    });
    expect(evaluateNotesBaseFormula('(note.points > 2) && (note.status == "active")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('concat("(status): ", upper((note.status)))', resolve)).toEqual({
      supported: true,
      value: "(status): ACTIVE",
    });
    expect(evaluateNotesBaseFormula("(note.points - 5).abs()", resolve)).toEqual({
      supported: true,
      value: 2,
    });
  });

  it("applies unary plus to bounded numeric expressions without coercion", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("+(-0)", resolve);

    expect(evaluateNotesBaseFormula("+note.points", resolve)).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula("+ note.points", resolve)).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula("+(note.points * 2)", resolve)).toEqual({
      supported: true,
      value: 6,
    });
    expect(evaluateNotesBaseFormula("1 + +note.points", resolve)).toEqual({
      supported: true,
      value: 4,
    });
    expect(evaluateNotesBaseFormula("note.points - +2", resolve)).toEqual({
      supported: true,
      value: 1,
    });
    expect(evaluateNotesBaseFormula("+note.points + \" points\"", resolve)).toEqual({
      supported: true,
      value: "3 points",
    });
    expect(evaluateNotesBaseFormula("+note.points > 2", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("+number(note.estimate)", resolve)).toEqual({
      supported: true,
      value: 4.5,
    });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects coercive, malformed, excessive, or arbitrary unary plus operands", () => {
    const values = {
      "note.infinity": Number.POSITIVE_INFINITY,
      "note.metadata": { owner: "Ada" },
      "note.missing": undefined,
      "note.status": "3",
      "note.tags": [3],
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];
    const excessive = `+${" ".repeat(100_001)}1`;

    for (const expression of [
      "+",
      "++1",
      "+ +1",
      '+"3"',
      "+true",
      "+null",
      "+note.status",
      "+note.missing",
      "+note.tags",
      "+note.metadata",
      "+note.infinity",
      '+link("Projects/Plan.md")',
      "+process.exit()",
      excessive,
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("rejects malformed, excessive, or unsupported parenthesized expressions", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const maximum = `${"(".repeat(64)}note.points${")".repeat(64)}`;
    const excessive = `${"(".repeat(65)}note.points${")".repeat(65)}`;
    const oversized = `(${" ".repeat(200_001)}note.points)`;

    expect(evaluateNotesBaseFormula(maximum, resolve)).toEqual({ supported: true, value: 3 });
    for (const expression of [
      "()",
      "( )",
      "((note.points)",
      "(note.points))",
      excessive,
      oversized,
      "(note.points ** 2)",
      "(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("normalizes scalar and list properties with the Obsidian list helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("list(note.tags)", resolve)).toEqual({ supported: true, value: ["daily", "review"] });
    expect(evaluateNotesBaseFormula("list(note.status)", resolve)).toEqual({ supported: true, value: ["active"] });
    expect(evaluateNotesBaseFormula("list(note.done)", resolve)).toEqual({ supported: true, value: [false] });
    expect(evaluateNotesBaseFormula("list(null)", resolve)).toEqual({ supported: true, value: [null] });
    expect(evaluateNotesBaseFormula("length(list(note.status))", resolve)).toEqual({ supported: true, value: 1 });
    expect(evaluateNotesBaseFormula("list()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("list(note.status, note.title)", resolve).supported).toBe(false);
  });

  it("evaluates bounded Obsidian scalar list literals", () => {
    const values = {
      "note.infinite": Number.POSITIVE_INFINITY,
      "note.missing": undefined,
      "note.status": "active",
      "note.title": "Task",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("[]", resolve)).toEqual({ supported: true, value: [] });
    expect(evaluateNotesBaseFormula(
      '["daily", 2, false, null, note.missing, note.status, lower(note.title)]',
      resolve,
    )).toEqual({
      supported: true,
      value: ["daily", 2, false, null, undefined, "active", "task"],
    });
    expect(evaluateNotesBaseFormula('[note.status, "review"].join(" / ")', resolve)).toEqual({
      supported: true,
      value: "active / review",
    });
    expect(evaluateNotesBaseFormula("if(true, [1, 2], [])", resolve)).toEqual({
      supported: true,
      value: [1, 2],
    });
    expect(evaluateNotesBaseFormula("list([1, 2])", resolve)).toEqual({ supported: true, value: [1, 2] });

    const excessiveElements = `[${Array.from({ length: 10_001 }, () => "0").join(",")}]`;
    for (const expression of [
      "[1,]",
      "[1,,2]",
      '[link("Plan.md")]',
      "[note.infinite]",
      `["${"x".repeat(60_000)}","${"y".repeat(40_001)}"]`,
      excessiveElements,
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression.slice(0, 80)).toBe(false);
    }
  });

  it("evaluates bounded nested Base list literals", () => {
    const resolve = (property: string) => property === "note.points" ? 3 : undefined;

    expect(evaluateNotesBaseFormula("[1, [2, note.points]]", resolve)).toEqual({
      supported: true,
      value: [1, [2, 3]],
    });
    expect(evaluateNotesBaseFormula("[1, [2, note.points]].flat()", resolve)).toEqual({
      supported: true,
      value: [1, 2, 3],
    });
    expect(evaluateNotesBaseFormula("[1, [2, note.points]][1].flat()", resolve)).toEqual({
      supported: true,
      value: [2, 3],
    });
  });

  it("rejects unsafe or excessive nested Base list literals", () => {
    const values = {
      "note.first": "x".repeat(50_000),
      "note.exactSecond": "y".repeat(50_000),
      "note.excessiveSecond": "y".repeat(50_001),
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];
    const exactDepth = `${"[".repeat(64)}1${"]".repeat(64)}`;
    const excessiveDepth = `[${exactDepth}]`;
    const exactElements = `[[${Array.from({ length: 9_999 }, () => "0").join(",")}]]`;
    const excessiveElements = `[[${Array.from({ length: 10_000 }, () => "0").join(",")}]]`;

    expect(evaluateNotesBaseFormula(exactDepth, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula(exactElements, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula("[[note.first, note.exactSecond]]", resolve).supported).toBe(true);
    for (const expression of [
      excessiveDepth,
      excessiveElements,
      "[[note.first, note.excessiveSecond]]",
      '[[link("Plan.md")]]',
      "[[1],]",
      "[[1],,[2]]",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression.slice(0, 80)).toBe(false);
    }
  });

  it("evaluates bounded Obsidian scalar object literals", () => {
    const values = {
      "note.infinite": Number.POSITIVE_INFINITY,
      "note.missing": undefined,
      "note.status": "active",
      "note.title": "Task",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("{}.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      '{"status": note.status, "count": 2, "done": false, "missing": note.missing}.keys()',
      resolve,
    )).toEqual({
      supported: true,
      value: ["status", "count", "done", "missing"],
    });
    expect(evaluateNotesBaseFormula(
      '{"status": note.status, "count": 2, "done": false, "missing": note.missing}.values()',
      resolve,
    )).toEqual({
      supported: true,
      value: ["active", 2, false, undefined],
    });
    expect(evaluateNotesBaseFormula(
      'if(true, {"status": lower(note.title), "count": 2}, {}).values().join(" / ")',
      resolve,
    )).toEqual({ supported: true, value: "task / 2" });
    expect(evaluateNotesBaseFormula('{"__proto__": "safe"}.keys()', resolve)).toEqual({
      supported: true,
      value: ["__proto__"],
    });
    expect(evaluateNotesBaseFormula('{"1": "one", "0": "zero"}.keys()', resolve)).toEqual({
      supported: true,
      value: ["0", "1"],
    });
    expect(notesBaseValueText(new Proxy({}, {
      getPrototypeOf() {
        throw new Error("prototype trap must not escape value projection");
      },
    }))).toBe("");

    const excessiveEntries = `{${Array.from({ length: 10_001 }, (_, index) => `"key-${index}":0`).join(",")}}`;
    for (const expression of [
      '{status:"active"}',
      '{"":"active"}',
      '{"status":}',
      '{"status":"active",}',
      '{"status":"active","status":"review"}',
      '{"status":"active"',
      '{"status":"active}',
      '{"status":1:2}',
      String.raw`{"sta\tus":"active"}`,
      '{"link":link("Plan.md")}',
      '{"value":note.infinite}',
      '{"value":process.exit()}',
      `{"${"x".repeat(100_001)}":0}`,
      `{"first":"${"x".repeat(60_000)}","second":"${"y".repeat(40_001)}"}`,
      excessiveEntries,
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression.slice(0, 80)).toBe(false);
    }
  });

  it("evaluates bounded list literals nested in Obsidian object values", () => {
    const values = {
      "note.computed": ["computed"],
      "note.status": "active",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      '{"tags":["daily",["review",note.status]]}.values().flat().join(" / ")',
      resolve,
    )).toEqual({ supported: true, value: "daily / review / active" });

    const exactDepth = `{"tags":${"[".repeat(63)}1${"]".repeat(63)}}`;
    const excessiveDepth = `{"tags":${"[".repeat(64)}1${"]".repeat(64)}}`;
    const exactElements = `{"tags":[${Array.from({ length: 9_999 }, () => "0").join(",")}]}`;
    const excessiveElements = `{"tags":[${Array.from({ length: 10_000 }, () => "0").join(",")}]}`;
    const exactStrings = `{"tags":["${"x".repeat(99_996)}"]}`;
    const excessiveStrings = `{"tags":["${"x".repeat(99_997)}"]}`;

    expect(evaluateNotesBaseFormula(exactDepth, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula(exactElements, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula(exactStrings, resolve).supported).toBe(true);
    for (const expression of [
      excessiveDepth,
      excessiveElements,
      excessiveStrings,
      '{"tags":note.computed}',
      '{"tags":[link("Plan.md")]}',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression.slice(0, 80)).toBe(false);
    }
  });

  it("evaluates bounded explicitly authored nested Obsidian object literals", () => {
    const computed = { name: "computed" };
    const resolve = (property: string) => property === "note.computed" ? computed : undefined;

    expect(evaluateNotesBaseFormula(
      '{"profile":{"name":"Ada","preferences":[true,{"level":2}]}}',
      resolve,
    )).toEqual({
      supported: true,
      value: {
        profile: {
          name: "Ada",
          preferences: [true, { level: 2 }],
        },
      },
    });
    expect(evaluateNotesBaseFormula(
      '[{"name":"Ada"},[{"name":"Lin"}]].toString()',
      resolve,
    )).toEqual({ supported: true, value: "[object Object],[object Object]" });

    const exactDepth = `${'{"value":'.repeat(64)}1${"}".repeat(64)}`;
    const excessiveDepth = `{"value":${exactDepth}}`;
    const exactEntries = `{"profile":{${Array.from({ length: 9_999 }, (_, index) => `"${index}":0`).join(",")}}}`;
    const excessiveEntries = `{"profile":{${Array.from({ length: 10_000 }, (_, index) => `"${index}":0`).join(",")}}}`;
    const exactStrings = `{"a":{"b":"${"x".repeat(99_998)}"}}`;
    const excessiveStrings = `{"a":{"b":"${"x".repeat(99_999)}"}}`;

    expect(evaluateNotesBaseFormula(exactDepth, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula(exactEntries, resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula(exactStrings, resolve).supported).toBe(true);
    for (const expression of [
      excessiveDepth,
      excessiveEntries,
      excessiveStrings,
      '{"profile":note.computed}',
      '[note.computed]',
      '{"profile":{"link":link("Plan.md")}}',
      '[{"link":link("Plan.md")}]',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression.slice(0, 80)).toBe(false);
    }
  });

  it("escapes HTML-sensitive property text with the Obsidian escapeHTML helper", () => {
    const markup = `<b class="callout">Tom & Jerry's</b>`;
    const resolve = (property: string) => property === "note.markup" ? markup : undefined;

    expect(evaluateNotesBaseFormula("escapeHTML(note.markup)", resolve)).toEqual({
      supported: true,
      value: "&lt;b class=&quot;callout&quot;&gt;Tom &amp; Jerry's&lt;/b&gt;",
    });
    expect(evaluateNotesBaseFormula("escapeHTML()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("escapeHTML(note.markup, note.markup)", resolve).supported).toBe(false);
  });

  it("matches strings with bounded Obsidian regular expression literals", () => {
    const values = {
      "note.code": "b/4",
      "note.multiline": "start\nfinish",
      "note.number": 42,
      "note.oversized": "a".repeat(100_001),
      "note.title": "ABC",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula('/abc/.matches("abcde")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^abc$/.matches(note.title)', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('/^abc$/i.matches(note.title)', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^finish$/m.matches(note.multiline)', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^.$/u.matches("😀")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^.$/.matches("😀")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('/^start.finish$/s.matches(note.multiline)', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^[A-C]\\/[0-9]$/i.matches(note.code)', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^missing$/.matches(note.title)', resolve)).toEqual({ supported: true, value: false });
  });

  it("rejects unsafe, malformed, unsupported, or excessive regular expression formulas", () => {
    const values = {
      "note.number": 42,
      "note.oversized": "a".repeat(100_001),
      "note.tags": ["abc"],
      "note.workHeavy": "a".repeat(10_001),
      "note.title": "abc",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];
    const unsupported = [
      '/abc/.matches()',
      '/abc/.matches(note.title, note.title)',
      '/abc/.matches(note.number)',
      '/abc/.matches(note.oversized)',
      '/(a+)+$/.matches(note.title)',
      '/a|b/.matches(note.title)',
      '/a*/.matches(note.title)',
      '/a{1,3}/.matches(note.title)',
      '/\\1/.matches(note.title)',
      '/abc/ii.matches(note.title)',
      '/[abc/.matches(note.title)',
      '/abc.matches(note.title)',
      'note.pattern.matches(note.title)',
      'note.tags.filter(/abc/.matches(value))',
      'process.exit().matches(note.title)',
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }

    const oversizedPattern = `/${"a".repeat(1_001)}/.matches(note.title)`;
    expect(evaluateNotesBaseFormula(oversizedPattern, resolve).supported).toBe(false);
    const excessiveWork = `/${"a".repeat(100)}/.matches(note.workHeavy)`;
    expect(evaluateNotesBaseFormula(excessiveWork, resolve).supported).toBe(false);
  });

  it("evaluates the zero-argument Obsidian random helper", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    try {
      expect(evaluateNotesBaseFormula("random()", () => undefined)).toEqual({ supported: true, value: 0.25 });
      expect(evaluateNotesBaseFormula("random(1)", () => undefined).supported).toBe(false);
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
    }
  });

  it("evaluates the zero-argument Obsidian today helper as a local calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 13, 45));
    try {
      expect(evaluateNotesBaseFormula("today()", () => undefined)).toEqual({
        supported: true,
        value: "2026-07-19",
      });
      expect(evaluateNotesBaseFormula("today(1)", () => undefined).supported).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluates the zero-argument Obsidian now helper as the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T20:45:30.123Z"));
    try {
      expect(evaluateNotesBaseFormula("now()", () => undefined)).toEqual({
        supported: true,
        value: "2026-07-19T20:45:30.123Z",
      });
      expect(evaluateNotesBaseFormula("now(1)", () => undefined).supported).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses Obsidian date helper values as canonical local instants", () => {
    const due = "2026-07-19";
    const expectedDue = new Date(2026, 6, 19).toISOString();
    const expectedMeeting = new Date(2026, 6, 19, 13, 45, 30).toISOString();
    const expectedMinute = new Date(2026, 6, 19, 13, 45).toISOString();
    const resolve = (property: string) => property === "note.due" ? due : undefined;

    expect(evaluateNotesBaseFormula("date(note.due)", resolve)).toEqual({
      supported: true,
      value: expectedDue,
    });
    expect(evaluateNotesBaseFormula('date("2026-07-19 13:45:30")', resolve)).toEqual({
      supported: true,
      value: expectedMeeting,
    });
    expect(evaluateNotesBaseFormula('date("2026-07-19T13:45")', resolve)).toEqual({
      supported: true,
      value: expectedMinute,
    });
  });

  it("rejects invalid or unsafe Obsidian date helper inputs", () => {
    const unsupported = [
      'date("2026-02-30")',
      'date("2026-13-01")',
      'date("2026-07-19 24:00:00")',
      'date("2026-07-19 13:60:00")',
      'date("July 19, 2026")',
      'date("2026-07-19",)',
      "date()",
      "date(20260719)",
      'date("2026-07-19", "2026-07-20")',
      "date(process.exit())",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, () => undefined).supported, expression).toBe(false);
    }
  });

  it("parses bounded Obsidian fixed durations as milliseconds", () => {
    const resolve = (property: string) => {
      if (property === "note.wait") return " 1.5h ";
      if (property === "note.wordWait") return " 1.5 hours ";
      if (property === "note.amount") return "2";
      if (property === "note.unit") return "d";
      return undefined;
    };

    expect(evaluateNotesBaseFormula('duration("250ms")', resolve)).toEqual({ supported: true, value: 250 });
    expect(evaluateNotesBaseFormula('duration("-30s")', resolve)).toEqual({ supported: true, value: -30_000 });
    expect(evaluateNotesBaseFormula('duration("2m")', resolve)).toEqual({ supported: true, value: 120_000 });
    expect(evaluateNotesBaseFormula("duration(note.wait)", resolve)).toEqual({ supported: true, value: 5_400_000 });
    expect(evaluateNotesBaseFormula('duration(concat(note.amount, note.unit))', resolve)).toEqual({
      supported: true,
      value: 172_800_000,
    });
    expect(evaluateNotesBaseFormula('duration("5h") * 2', resolve)).toEqual({
      supported: true,
      value: 36_000_000,
    });
    expect(evaluateNotesBaseFormula('duration("1w") / 7', resolve)).toEqual({
      supported: true,
      value: 86_400_000,
    });
    for (const [expression, value] of [
      ['duration("1 day")', 86_400_000],
      ['duration("2 days")', 172_800_000],
      ['duration("1 week")', 604_800_000],
      ['duration("2 weeks")', 1_209_600_000],
      ['duration("1 hour")', 3_600_000],
      ['duration("2 hours")', 7_200_000],
      ['duration("1 minute")', 60_000],
      ['duration("2 minutes")', 120_000],
      ['duration("1 second")', 1_000],
      ['duration("2 seconds")', 2_000],
      ["duration(note.wordWait)", 5_400_000],
      ['duration(concat(note.amount, " days"))', 172_800_000],
      ['duration("5 hours") * 2', 36_000_000],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, resolve), expression).toEqual({ supported: true, value });
    }
  });

  it("rejects invalid, calendar-relative, excessive, or unsafe duration values", () => {
    const resolve = (property: string) => property === "note.points" ? 3 : undefined;

    for (const expression of [
      "duration()",
      'duration("1h", "2h")',
      'duration("1h",)',
      "duration(note.points)",
      'duration("1M")',
      'duration("1y")',
      'duration("1 Hour")',
      'duration("1 hrs")',
      'duration("1 millisecond")',
      'duration("1e3s")',
      'duration("0.1ms")',
      'duration("9007199254740992ms")',
      "duration(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("coerces bounded vault paths with the Obsidian file helper", () => {
    const resolve = (property: string) => {
      if (property === "note.path") return "Projects\\Plan.md";
      if (property === "note.folder") return "Projects";
      if (property === "note.name") return "Plan.md";
      if (property === "file.links") return ["Projects/Plan.md", "Archive.md"];
      return undefined;
    };

    expect(evaluateNotesBaseFormula('file("Projects/Plan.md")', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula("file(note.path)", resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file(concat(note.folder, "/", note.name))', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file.hasLink(file("Projects/Plan.md"))', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("composes the active-row Obsidian file.file value with File helpers", () => {
    const resolve = (property: string) => property === "file.file" ? "Projects/Plan.md" : undefined;

    expect(evaluateNotesBaseFormula("file(file.file).path", resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula('file.file.asLink("Current note").asFile()', resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.md",
    });
    expect(evaluateNotesBaseFormula("file.file.asLink()", () => "../Outside.md").supported).toBe(false);
  });

  it("derives Obsidian File path fields from bounded file helper values", () => {
    const resolve = (property: string) => property === "note.target" ? "Projects\\Plan.v2.md" : undefined;

    expect(evaluateNotesBaseFormula("file(note.target).path", resolve)).toEqual({
      supported: true,
      value: "Projects/Plan.v2.md",
    });
    expect(evaluateNotesBaseFormula("file(note.target).name", resolve)).toEqual({
      supported: true,
      value: "Plan.v2.md",
    });
    expect(evaluateNotesBaseFormula("file(note.target).basename", resolve)).toEqual({
      supported: true,
      value: "Plan.v2",
    });
    expect(evaluateNotesBaseFormula("file(note.target).folder", resolve)).toEqual({
      supported: true,
      value: "Projects",
    });
    expect(evaluateNotesBaseFormula("file(note.target).ext", resolve)).toEqual({
      supported: true,
      value: "md",
    });
    expect(evaluateNotesBaseFormula('file("Root").folder', resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula('file("Root").ext', resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula('file(".env").basename', resolve)).toEqual({ supported: true, value: ".env" });
    expect(evaluateNotesBaseFormula('file(".env").ext', resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula('file(link("Archive/Plan.md")).ext', resolve)).toEqual({
      supported: true,
      value: "md",
    });

    for (const expression of [
      '"Projects/Plan.md".ext',
      'concat("Projects/", "Plan.md").ext',
      'file("../Plan.md").ext',
      'file("Plan.md").ext()',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("resolves projected loaded-file sizes through the bounded formula context", () => {
    const fileSizeFor = vi.fn((path: string) => {
      if (path === "Metadata.md") return 42;
      if (path === "Empty.md") return 0;
      if (path === "Unicode.md") return 7;
      return null;
    });
    const context = { fileSizeFor };

    expect(evaluateNotesBaseFormula('file("Metadata.md").size', () => undefined, context)).toEqual({
      supported: true,
      value: 42,
    });
    expect(evaluateNotesBaseFormula('file("Empty.md").size', () => undefined, context)).toEqual({
      supported: true,
      value: 0,
    });
    expect(evaluateNotesBaseFormula('file("Unicode.md").size.toFixed(2)', () => undefined, context)).toEqual({
      supported: true,
      value: "7.00",
    });
    expect(fileSizeFor).toHaveBeenCalledWith("Metadata.md");
  });

  it("rejects unsafe projected file-size lookups", () => {
    const context = { fileSizeFor: () => null };
    const throwingContext = { fileSizeFor: () => { throw new Error("untrusted lookup"); } };

    expect(evaluateNotesBaseFormula('file("Missing.md").size', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Plan.md").size', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('"Plan.md".size', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").size', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").size', () => undefined, throwingContext).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").size',
      () => undefined,
      { fileSizeFor: () => Number.POSITIVE_INFINITY },
    ).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").size',
      () => undefined,
      { fileSizeFor: () => -1 },
    ).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").size',
      () => undefined,
      { fileSizeFor: () => 1.5 },
    ).supported).toBe(false);
  });

  it("resolves projected loaded-file creation times through the bounded formula context", () => {
    const createdAt = Date.UTC(2023, 2, 4, 5, 6, 7);
    const fileCreatedAtFor = vi.fn((path: string) => path === "Created.md" ? createdAt : null);
    const context = { fileCreatedAtFor };

    expect(evaluateNotesBaseFormula('file("Created.md").ctime', () => undefined, context)).toEqual({
      supported: true,
      value: "2023-03-04T05:06:07.000Z",
    });
    expect(evaluateNotesBaseFormula('file("Created.md").ctime.year', () => undefined, context)).toEqual({
      supported: true,
      value: 2023,
    });
    expect(fileCreatedAtFor).toHaveBeenCalledWith("Created.md");
  });

  it("rejects unsafe projected file-creation-time lookups", () => {
    const missingContext = { fileCreatedAtFor: () => null };
    const throwingContext = { fileCreatedAtFor: () => { throw new Error("untrusted lookup"); } };

    for (const [expression, context] of [
      ['file("Missing.md").ctime', missingContext],
      ['file("../Created.md").ctime', missingContext],
      ['"Created.md".ctime', missingContext],
      ['file("Created.md").ctime', undefined],
      ['file("Created.md").ctime', throwingContext],
      ['file("Created.md").ctime', { fileCreatedAtFor: () => "0" as never }],
      ['file("Created.md").ctime', { fileCreatedAtFor: () => Number.POSITIVE_INFINITY }],
      ['file("Created.md").ctime', { fileCreatedAtFor: () => 8.64e15 + 1 }],
      ['file("Created.md").ctime()', { fileCreatedAtFor: () => 0 }],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
  });

  it("resolves projected loaded-file modification times through the bounded formula context", () => {
    const modifiedAt = Date.UTC(2024, 4, 6, 7, 8, 9);
    const fileModifiedAtFor = vi.fn((path: string) => path === "Modified.md" ? modifiedAt : null);
    const context = { fileModifiedAtFor };

    expect(evaluateNotesBaseFormula('file("Modified.md").mtime', () => undefined, context)).toEqual({
      supported: true,
      value: "2024-05-06T07:08:09.000Z",
    });
    expect(evaluateNotesBaseFormula('file("Modified.md").mtime.year', () => undefined, context)).toEqual({
      supported: true,
      value: 2024,
    });
    expect(fileModifiedAtFor).toHaveBeenCalledWith("Modified.md");
  });

  it("rejects unsafe projected file-modification-time lookups", () => {
    const missingContext = { fileModifiedAtFor: () => null };
    const throwingContext = { fileModifiedAtFor: () => { throw new Error("untrusted lookup"); } };

    for (const [expression, context] of [
      ['file("Missing.md").mtime', missingContext],
      ['file("../Modified.md").mtime', missingContext],
      ['"Modified.md".mtime', missingContext],
      ['file("Modified.md").mtime', undefined],
      ['file("Modified.md").mtime', throwingContext],
      ['file("Modified.md").mtime', { fileModifiedAtFor: () => "0" as never }],
      ['file("Modified.md").mtime', { fileModifiedAtFor: () => Number.POSITIVE_INFINITY }],
      ['file("Modified.md").mtime', { fileModifiedAtFor: () => 8.64e15 + 1 }],
      ['file("Modified.md").mtime()', { fileModifiedAtFor: () => 0 }],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
  });

  it("rejects unsafe or malformed Obsidian file helper values", () => {
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.url") return "https://example.com/Plan.md";
      if (property === "note.absolute") return "/Projects/Plan.md";
      if (property === "note.drive") return "C:\\Projects\\Plan.md";
      if (property === "note.parent") return "Projects/../Plan.md";
      if (property === "note.nul") return "Projects/Plan\0.md";
      if (property === "note.oversized") return `${"x".repeat(4_097)}.md`;
      return undefined;
    };

    for (const expression of [
      "file()",
      'file("Plan.md",)',
      'file("Plan.md", "Other.md")',
      "file(note.points)",
      "file(note.url)",
      "file(note.absolute)",
      "file(note.drive)",
      "file(note.parent)",
      "file(note.nul)",
      "file(note.oversized)",
      'file("")',
      "file(process.exit())",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("offsets Obsidian date values with bounded fixed duration strings", () => {
    const started = "2026-07-21 10:15:00";
    const resolve = (property: string) => {
      if (property === "note.started") return started;
      if (property === "note.offset") return "90 minutes";
      return undefined;
    };
    const startTime = new Date(2026, 6, 21, 10, 15).getTime();

    expect(evaluateNotesBaseFormula('date(note.started) + "1 day"', resolve)).toEqual({
      supported: true,
      value: new Date(startTime + 86_400_000).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.started) - note.offset', resolve)).toEqual({
      supported: true,
      value: new Date(startTime - 5_400_000).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.started) + duration("2h")', resolve)).toEqual({
      supported: true,
      value: new Date(startTime + 7_200_000).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.started) + duration("90 minutes")', resolve)).toEqual({
      supported: true,
      value: new Date(startTime + 5_400_000).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.started) + "1d" + "2h" - "30m"', resolve)).toEqual({
      supported: true,
      value: new Date(startTime + 91_800_000).toISOString(),
    });
    expect(evaluateNotesBaseFormula('(date(note.started) + "1 week").day', resolve)).toEqual({
      supported: true,
      value: 28,
    });
    expect(evaluateNotesBaseFormula('"Due: " + note.started', resolve)).toEqual({
      supported: true,
      value: `Due: ${started}`,
    });
  });

  it("offsets Obsidian date values with bounded calendar month and year durations", () => {
    const resolve = (property: string) => {
      if (property === "note.monthEnd") return "2024-01-31 10:15:00";
      if (property === "note.leapDay") return "2024-02-29 10:15:00";
      if (property === "note.offset") return "2 months";
      return undefined;
    };

    expect(evaluateNotesBaseFormula('date(note.monthEnd) + "1M"', resolve)).toEqual({
      supported: true,
      value: new Date(2024, 1, 29, 10, 15).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.leapDay) + "1 year"', resolve)).toEqual({
      supported: true,
      value: new Date(2025, 1, 28, 10, 15).toISOString(),
    });
    expect(evaluateNotesBaseFormula('date(note.monthEnd) - "1 month"', resolve)).toEqual({
      supported: true,
      value: new Date(2023, 11, 31, 10, 15).toISOString(),
    });
    expect(evaluateNotesBaseFormula("date(note.monthEnd) + note.offset", resolve)).toEqual({
      supported: true,
      value: new Date(2024, 2, 31, 10, 15).toISOString(),
    });
    expect(evaluateNotesBaseFormula('(date(note.monthEnd) + "1M" + "1 day").day', resolve)).toEqual({
      supported: true,
      value: 1,
    });
    expect(evaluateNotesBaseFormula('date(note.monthEnd) - "-1y"', resolve)).toEqual({
      supported: true,
      value: new Date(2025, 0, 31, 10, 15).toISOString(),
    });
  });

  it("offsets Obsidian date values with duration-led scalar arithmetic", () => {
    const resolve = (property: string) => property === "note.started"
      ? "2026-07-21 10:15:00"
      : undefined;

    expect(evaluateNotesBaseFormula(
      'date(note.started) + (duration("1d") * 2)',
      resolve,
    )).toEqual({
      supported: true,
      value: new Date(2026, 6, 23, 10, 15).toISOString(),
    });
    expect(evaluateNotesBaseFormula(
      'date(note.started) - duration("12h") / 2',
      resolve,
    )).toEqual({
      supported: true,
      value: new Date(2026, 6, 21, 4, 15).toISOString(),
    });
  });

  it("rejects unsafe, malformed, or non-duration date offsets", () => {
    const resolve = (property: string) => {
      if (property === "note.started") return "2026-07-21 10:15:00";
      if (property === "note.number") return 3;
      if (property === "note.otherDate") return "2026-07-22 10:15:00";
      return undefined;
    };
    const excessiveDurationScale = `date(note.started) + (duration("1ms")${" * 1".repeat(10_000)})`;

    for (const expression of [
      'date(note.started) + "1.5M"',
      'date(note.started) + "1.5 years"',
      'date(note.started) + "1month extra"',
      'date(note.started) + "9007199254740992M"',
      'date(note.started) + "0.1ms"',
      'date(note.started) + "100000000d"',
      'date(note.started) + "9007199254740992d"',
      "date(note.started) + note.number",
      "date(note.started) + (note.number * 2)",
      'date(note.started) + (2 * duration("1d"))',
      'date(note.started) + (duration("1d") * duration("1d"))',
      'date(note.started) + (duration("1d") % 2)',
      'date(note.started) + (duration("1ms") / 2)',
      'date(note.started) + (duration("9007199254740991ms") * 2)',
      'date(note.started) + (duration("1d") / 0)',
      "date(note.started) + (duration(process.exit()) * 2)",
      excessiveDurationScale,
      "date(note.started) + date(note.otherDate)",
      "date(note.started) + process.exit()",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("exposes Obsidian date fields as local calendar values", () => {
    const meeting = "2026-07-19 13:45:30";
    const resolve = (property: string) => property === "note.meeting"
      ? meeting
      : property === "note.due"
        ? "2026-07-20"
        : undefined;
    const expectedFields = {
      year: 2026,
      month: 7,
      day: 19,
      hour: 13,
      minute: 45,
      second: 30,
      millisecond: 0,
    };

    for (const [field, value] of Object.entries(expectedFields)) {
      expect(
        evaluateNotesBaseFormula(`date(note.meeting).${field}`, resolve),
        field,
      ).toEqual({ supported: true, value });
    }
    expect(evaluateNotesBaseFormula("note.due.year", resolve)).toEqual({
      supported: true,
      value: 2026,
    });
    expect(evaluateNotesBaseFormula("date(note.meeting).year.toString()", resolve)).toEqual({
      supported: true,
      value: "2026",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 13, 45, 30, 123));
    try {
      expect(evaluateNotesBaseFormula("today().day", resolve)).toEqual({
        supported: true,
        value: 19,
      });
      expect(evaluateNotesBaseFormula("now().millisecond", resolve)).toEqual({
        supported: true,
        value: 123,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid, non-date, unknown, or unsafe date fields", () => {
    const unsupported = [
      "note.missing.year",
      "note.label.year",
      "note.points.year",
      "note.done.year",
      "note.tags.year",
      "date(\"2026-02-30\").year",
      "date(\"2026-07-19\").timezone",
      "date(\"2026-07-19\").year.constructor",
      "today(1).year",
      "process.exit().year",
    ];
    const resolve = (property: string) => {
      if (property === "note.label") return "not a date";
      if (property === "note.points") return 2026;
      if (property === "note.done") return true;
      if (property === "note.tags") return ["2026-07-19"];
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("removes the time portion from Obsidian date values", () => {
    const resolve = (property: string) => property === "note.meeting"
      ? "2026-07-19 13:45:30"
      : undefined;

    expect(evaluateNotesBaseFormula("date(note.meeting).date()", resolve)).toEqual({
      supported: true,
      value: "2026-07-19",
    });
    expect(evaluateNotesBaseFormula("note.meeting.date()", resolve)).toEqual({
      supported: true,
      value: "2026-07-19",
    });
    expect(evaluateNotesBaseFormula("date(note.meeting).date().year", resolve)).toEqual({
      supported: true,
      value: 2026,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 23, 45, 30, 123));
    try {
      expect(evaluateNotesBaseFormula("now().date()", resolve)).toEqual({
        supported: true,
        value: "2026-07-19",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid, wrong-arity, non-date, or unsafe date.date calls", () => {
    const unsupported = [
      "date(note.meeting).date(1)",
      "date(note.missing).date()",
      "note.label.date()",
      "note.points.date()",
      "note.done.date()",
      "note.tags.date()",
      "date(\"2026-02-30\").date()",
      "process.exit().date()",
    ];
    const resolve = (property: string) => {
      if (property === "note.meeting") return "2026-07-19 13:45:30";
      if (property === "note.label") return "not a date";
      if (property === "note.points") return 2026;
      if (property === "note.done") return true;
      if (property === "note.tags") return ["2026-07-19"];
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("extracts the local time from Obsidian date values", () => {
    const resolve = (property: string) => {
      if (property === "note.meeting") return "2026-07-19 13:45:30";
      if (property === "note.due") return "2026-07-20";
      return undefined;
    };

    expect(evaluateNotesBaseFormula("date(note.meeting).time()", resolve)).toEqual({
      supported: true,
      value: "13:45:30",
    });
    expect(evaluateNotesBaseFormula("note.meeting.time()", resolve)).toEqual({
      supported: true,
      value: "13:45:30",
    });
    expect(evaluateNotesBaseFormula("note.due.time()", resolve)).toEqual({
      supported: true,
      value: "00:00:00",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 23, 45, 30, 123));
    try {
      expect(evaluateNotesBaseFormula("now().time()", resolve)).toEqual({
        supported: true,
        value: "23:45:30",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid, wrong-arity, non-date, or unsafe date.time calls", () => {
    const unsupported = [
      "date(note.meeting).time(1)",
      "date(note.missing).time()",
      "note.label.time()",
      "note.points.time()",
      "note.done.time()",
      "note.tags.time()",
      "date(\"2026-02-30\").time()",
      "process.exit().time()",
    ];
    const resolve = (property: string) => {
      if (property === "note.meeting") return "2026-07-19 13:45:30";
      if (property === "note.label") return "not a date";
      if (property === "note.points") return 2026;
      if (property === "note.done") return true;
      if (property === "note.tags") return ["2026-07-19"];
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("formats Obsidian date values with the supported Moment-style token subset", () => {
    const meeting = new Date(2026, 6, 19, 13, 45, 30);
    const resolve = (property: string) => property === "note.meeting"
      ? "2026-07-19 13:45:30"
      : undefined;

    expect(
      evaluateNotesBaseFormula(
        'date(note.meeting).format("dddd, MMMM D, YYYY [at] h:mm:ss A")',
        resolve,
      ),
    ).toEqual({
      supported: true,
      value: "Sunday, July 19, 2026 at 1:45:30 PM",
    });
    expect(evaluateNotesBaseFormula('note.meeting.format("YY/MM/DD HH:mm")', resolve)).toEqual({
      supported: true,
      value: "26/07/19 13:45",
    });
    expect(evaluateNotesBaseFormula("date(note.meeting).format(note.pattern)", (property) => (
      property === "note.meeting" ? "2026-07-19 13:45:30" : "YYYY-MM-DD"
    ))).toEqual({
      supported: true,
      value: "2026-07-19",
    });
    expect(evaluateNotesBaseFormula('date(note.meeting).format("Z ZZ [Z] [ZZ]")', resolve)).toEqual({
      supported: true,
      value: `${expectedTimezoneOffset(meeting, ":")} ${expectedTimezoneOffset(meeting, "")} Z ZZ`,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 23, 45, 30, 123));
    try {
      expect(evaluateNotesBaseFormula('now().format("YYYY-MM-DD HH:mm:ss.SSS")', resolve)).toEqual({
        supported: true,
        value: "2026-07-19 23:45:30.123",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats Obsidian dates with default-English localized date and time tokens", () => {
    const resolve = (property: string) => property === "note.meeting"
      ? "2026-01-05 20:09:10"
      : undefined;

    expect(
      evaluateNotesBaseFormula(
        'date(note.meeting).format("L l LL ll LLL lll LLLL llll LT LTS [L] [l] [LL] [ll] [LLL] [lll] [LLLL] [llll] [LT] [LTS]")',
        resolve,
      ),
    ).toEqual({
      supported: true,
      value: "01/05/2026 1/5/2026 January 5, 2026 Jan 5, 2026 January 5, 2026 8:09 PM Jan 5, 2026 8:09 PM Monday, January 5, 2026 8:09 PM Mon, Jan 5, 2026 8:09 PM 8:09 PM 8:09:10 PM L l LL ll LLL lll LLLL llll LT LTS",
    });
  });

  it("rejects invalid, wrong-arity, unsafe, or oversized date.format calls", () => {
    const resolve = (property: string) => {
      if (property === "note.meeting") return "2026-09-19 13:45:30";
      if (property === "note.label") return "not a date";
      if (property === "note.pattern") return "YYYY-MM-DD";
      return undefined;
    };
    const unsupported = [
      "date(note.meeting).format()",
      "date(note.meeting).format(1)",
      'date(note.meeting).format("YYYY", "MM")',
      'date(note.meeting).format("YYYY",)',
      'date(note.missing).format("YYYY")',
      'note.label.format("YYYY")',
      'date("2026-02-30").format("YYYY")',
      'process.exit().format("YYYY")',
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }

    const expandingPattern = "MMMM".repeat(20_001);
    expect(
      evaluateNotesBaseFormula(`date(note.meeting).format("${expandingPattern}")`, resolve).supported,
    ).toBe(false);
  });

  it("renders Obsidian date values relative to the current instant", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-19T12:00:00.000Z");
    vi.setSystemTime(now);
    try {
      const cases = [
        { difference: -30_000, value: "a few seconds ago" },
        { difference: -45_000, value: "a minute ago" },
        { difference: -2 * 60_000, value: "2 minutes ago" },
        { difference: -45 * 60_000, value: "an hour ago" },
        { difference: 2 * 3_600_000, value: "in 2 hours" },
        { difference: -22 * 3_600_000, value: "a day ago" },
        { difference: -3 * 86_400_000, value: "3 days ago" },
        { difference: -26 * 86_400_000, value: "a month ago" },
        { difference: -60 * 86_400_000, value: "2 months ago" },
        { difference: -335 * 86_400_000, value: "a year ago" },
        { difference: -730 * 86_400_000, value: "2 years ago" },
      ];

      for (const { difference, value } of cases) {
        const receiver = new Date(now.getTime() + difference).toISOString();
        expect(
          evaluateNotesBaseFormula("note.value.relative()", () => receiver),
          value,
        ).toEqual({ supported: true, value });
      }
      expect(evaluateNotesBaseFormula("now().relative()", () => undefined)).toEqual({
        supported: true,
        value: "a few seconds ago",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid, wrong-arity, non-date, or unsafe date.relative calls", () => {
    const unsupported = [
      "date(note.past).relative(1)",
      "date(note.missing).relative()",
      "note.label.relative()",
      "note.points.relative()",
      "note.done.relative()",
      "note.tags.relative()",
      "date(\"2026-02-30\").relative()",
      "process.exit().relative()",
    ];
    const resolve = (property: string) => {
      if (property === "note.past") return "2026-07-16 12:00:00";
      if (property === "note.label") return "not a date";
      if (property === "note.points") return 2026;
      if (property === "note.done") return true;
      if (property === "note.tags") return ["2026-07-19"];
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("returns the greatest finite number with the Obsidian max helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("max(-0, -0)", resolve);

    expect(evaluateNotesBaseFormula("max(-4, note.points, (-9).abs())", resolve)).toEqual({
      supported: true,
      value: 9,
    });
    expect(evaluateNotesBaseFormula("max(-0, 0)", resolve)).toEqual({
      supported: true,
      value: 0,
    });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("adds finite numeric operands with the Obsidian addition operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("-0 + -0", resolve);
    const maximumOperands = Array.from({ length: 10_000 }, () => "1").join(" + ");

    expect(evaluateNotesBaseFormula("note.points + 4", resolve)).toEqual({
      supported: true,
      value: 7,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) + note.points", resolve)).toEqual({
      supported: true,
      value: 7.5,
    });
    expect(evaluateNotesBaseFormula("2 + note.points + (-4).abs()", resolve)).toEqual({
      supported: true,
      value: 9,
    });
    expect(evaluateNotesBaseFormula("note.points + -4", resolve)).toEqual({
      supported: true,
      value: -1,
    });
    expect(evaluateNotesBaseFormula("2 + note.points * 4", resolve)).toEqual({
      supported: true,
      value: 14,
    });
    expect(evaluateNotesBaseFormula("max(note.points + 4, 10)", resolve)).toEqual({
      supported: true,
      value: 10,
    });
    expect(evaluateNotesBaseFormula('"+" .contains("+")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula(maximumOperands, resolve)).toEqual({
      supported: true,
      value: 10_000,
    });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("concatenates bounded string operands with the Obsidian addition operator", () => {
    const maximumLeft = "a".repeat(60_000);
    const maximumRight = "b".repeat(40_000);
    const resolve = (property: string) => {
      if (property === "file.name") return "Task";
      if (property === "note.done") return row.done;
      if (property === "note.points") return row.points;
      if (property === "note.status") return row.status;
      if (property === "note.title") return row.title;
      if (property === "note.maximumLeft") return maximumLeft;
      if (property === "note.maximumRight") return maximumRight;
      if (property === "note.oversizedRight") return `${maximumRight}b`;
      return undefined;
    };

    expect(evaluateNotesBaseFormula('file.name + " - " + note.status', resolve)).toEqual({
      supported: true,
      value: "Task - active",
    });
    expect(evaluateNotesBaseFormula('upper(note.status) + ": " + note.title', resolve)).toEqual({
      supported: true,
      value: "ACTIVE: Task",
    });
    expect(evaluateNotesBaseFormula('"Points: " + note.points', resolve)).toEqual({
      supported: true,
      value: "Points: 3",
    });
    expect(evaluateNotesBaseFormula('note.points + 1 + " points"', resolve)).toEqual({
      supported: true,
      value: "4 points",
    });
    expect(evaluateNotesBaseFormula('"Done: " + note.done', resolve)).toEqual({
      supported: true,
      value: "Done: false",
    });
    expect(evaluateNotesBaseFormula('note.done + " done"', resolve)).toEqual({
      supported: true,
      value: "false done",
    });
    expect(evaluateNotesBaseFormula('null + " owner"', resolve)).toEqual({
      supported: true,
      value: "null owner",
    });
    expect(evaluateNotesBaseFormula('note.missing + " owner"', resolve)).toEqual({
      supported: true,
      value: "null owner",
    });
    expect(evaluateNotesBaseFormula('"" + note.title', resolve)).toEqual({
      supported: true,
      value: "Task",
    });
    const maximum = evaluateNotesBaseFormula("note.maximumLeft + note.maximumRight", resolve);
    expect(maximum.supported && typeof maximum.value === "string" && maximum.value.length).toBe(100_000);
    expect(evaluateNotesBaseFormula("note.maximumLeft + note.oversizedRight", resolve).supported).toBe(false);
  });

  it("rejects malformed, coercive, unsafe, oversized, or overflowing sums", () => {
    const tooManyOperands = Array.from({ length: 10_001 }, () => "1").join(" + ");
    const unsupported = [
      "note.points +",
      "note.points ++ 2",
      "note.points + note.missing",
      "note.points + note.infinity",
      "note.points + note.metadata",
      '"Value: " + note.coercive',
      '"Value: " + note.infinity',
      "note.points + process.exit()",
      "note.points + \"2",
      "note.points + (2",
      "note.status - note.title",
      "note.huge + note.huge",
      'note.maximum + "1"',
      tooManyOperands,
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.status") return "4";
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      if (property === "note.coercive") return {
        [Symbol.toPrimitive]() {
          throw new Error("object conversion hooks must not run");
        },
      };
      if (property === "note.huge") return 1e308;
      if (property === "note.maximum") return "x".repeat(100_000);
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("subtracts finite numeric operands with the Obsidian subtraction operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("-0 - 0", resolve);
    const maximumOperands = Array.from({ length: 10_000 }, () => "1").join(" - ");

    expect(evaluateNotesBaseFormula("note.points - 4", resolve)).toEqual({
      supported: true,
      value: -1,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) - note.points", resolve)).toEqual({
      supported: true,
      value: 1.5,
    });
    expect(evaluateNotesBaseFormula("10 - note.points + 2", resolve)).toEqual({
      supported: true,
      value: 9,
    });
    expect(evaluateNotesBaseFormula("10 + note.points - 2", resolve)).toEqual({
      supported: true,
      value: 11,
    });
    expect(evaluateNotesBaseFormula("10 - note.points * 2", resolve)).toEqual({
      supported: true,
      value: 4,
    });
    expect(evaluateNotesBaseFormula("10 - note.points * -2", resolve)).toEqual({
      supported: true,
      value: 16,
    });
    expect(evaluateNotesBaseFormula("note.points - -4", resolve)).toEqual({
      supported: true,
      value: 7,
    });
    expect(evaluateNotesBaseFormula("max(note.points - 4, 0)", resolve)).toEqual({
      supported: true,
      value: 0,
    });
    expect(evaluateNotesBaseFormula('"-".contains("-")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula(maximumOperands, resolve)).toEqual({
      supported: true,
      value: -9_998,
    });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects malformed, coercive, unsafe, oversized, or overflowing differences", () => {
    const tooManyOperands = Array.from({ length: 10_001 }, () => "1").join(" - ");
    const unsupported = [
      "note.points -",
      "note.points--2",
      "note.points -- 2",
      "note.points - note.status",
      "note.points - note.missing",
      "note.points - note.infinity",
      "note.points - note.metadata",
      "note.points - process.exit()",
      "note.points - \"2",
      "note.points - (2",
      '"one" - "two"',
      "note.negativeHuge - note.huge",
      tooManyOperands,
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.status") return "4";
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      if (property === "note.negativeHuge") return -1e308;
      if (property === "note.huge") return 1e308;
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("subtracts two Obsidian date values as a millisecond difference", () => {
    const resolve = (property: string) => {
      if (property === "note.started") return "2026-07-21 10:15:00";
      if (property === "note.finished") return "2026-07-21 11:45:00";
      return undefined;
    };

    expect(evaluateNotesBaseFormula("note.finished - note.started", resolve)).toEqual({
      supported: true,
      value: 5_400_000,
    });
    expect(
      evaluateNotesBaseFormula(
        'date("2026-07-21 11:45:00") - date("2026-07-21 10:15:00")',
        resolve,
      ),
    ).toEqual({ supported: true, value: 5_400_000 });
    expect(evaluateNotesBaseFormula("(note.finished - note.started) / 1000", resolve)).toEqual({
      supported: true,
      value: 5_400,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 12));
    try {
      expect(evaluateNotesBaseFormula('now() - date("2026-07-21 11:00:00")', resolve)).toEqual({
        supported: true,
        value: 3_600_000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects mixed, malformed, chained, or unsafe date differences", () => {
    const resolve = (property: string) => {
      if (property === "note.started") return "2026-07-21 10:15:00";
      if (property === "note.finished") return "2026-07-21 11:45:00";
      if (property === "note.label") return "not a date";
      if (property === "note.points") return 3;
      return undefined;
    };

    for (const expression of [
      "note.finished - note.label",
      "note.points - note.started",
      "note.finished - note.started - note.started",
      '"2026-07-21" - "2026-07-20"',
      '("2026-07-21") - ("2026-07-20")',
      'concat("2026-07-", "21") - date("2026-07-20")',
      'date("2026-02-30") - note.started',
      "process.exit() - note.started",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("multiplies finite numeric operands with the Obsidian product operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("-0 * note.points", resolve);
    const maximumOperands = Array.from({ length: 10_000 }, () => "1").join(" * ");

    expect(evaluateNotesBaseFormula("note.points * 4", resolve)).toEqual({
      supported: true,
      value: 12,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) * note.points", resolve)).toEqual({
      supported: true,
      value: 13.5,
    });
    expect(evaluateNotesBaseFormula("2 * note.points * (-4).abs()", resolve)).toEqual({
      supported: true,
      value: 24,
    });
    expect(evaluateNotesBaseFormula("max(note.points * 4, 10)", resolve)).toEqual({
      supported: true,
      value: 12,
    });
    expect(evaluateNotesBaseFormula('"*".contains("*")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula(maximumOperands, resolve)).toEqual({ supported: true, value: 1 });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects malformed, coercive, unsafe, oversized, or overflowing products", () => {
    const tooManyOperands = Array.from({ length: 10_001 }, () => "1").join(" * ");
    const unsupported = [
      "note.points *",
      "* note.points",
      "note.points ** 2",
      "note.points * note.status",
      "note.points * note.missing",
      "note.points * note.infinity",
      "note.points * note.metadata",
      "note.points * process.exit()",
      "note.points * \"2",
      "note.points * (2",
      "note.huge * 2",
      tooManyOperands,
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.status") return "4";
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      if (property === "note.huge") return 1e308;
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("divides finite numeric operands with the Obsidian division operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("-0 / note.points", resolve);
    const maximumOperands = Array.from({ length: 10_000 }, () => "1").join(" / ");

    expect(evaluateNotesBaseFormula("note.points / 4", resolve)).toEqual({
      supported: true,
      value: 0.75,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) / note.points", resolve)).toEqual({
      supported: true,
      value: 1.5,
    });
    expect(evaluateNotesBaseFormula("24 / note.points * 2", resolve)).toEqual({
      supported: true,
      value: 16,
    });
    expect(evaluateNotesBaseFormula("24 * 2 / note.points", resolve)).toEqual({
      supported: true,
      value: 16,
    });
    expect(evaluateNotesBaseFormula("12 + 24 / note.points * 2", resolve)).toEqual({
      supported: true,
      value: 28,
    });
    expect(evaluateNotesBaseFormula("12 / -2", resolve)).toEqual({
      supported: true,
      value: -6,
    });
    expect(evaluateNotesBaseFormula("max(12 / note.points, 5)", resolve)).toEqual({
      supported: true,
      value: 5,
    });
    expect(evaluateNotesBaseFormula('"/".contains("/")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula(maximumOperands, resolve)).toEqual({ supported: true, value: 1 });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects malformed, coercive, unsafe, oversized, or non-finite quotients", () => {
    const tooManyOperands = Array.from({ length: 10_001 }, () => "1").join(" / ");
    const unsupported = [
      "note.points /",
      "/ note.points",
      "note.points // 2",
      "note.points / /2",
      "note.points / +2",
      "note.points / note.zero",
      "note.zero / note.zero",
      "note.points / note.status",
      "note.points / note.missing",
      "note.points / note.infinity",
      "note.points / note.metadata",
      "note.points / process.exit()",
      "note.points / \"2",
      "note.points / (2",
      '"one" / "two"',
      "note.huge / note.tiny",
      tooManyOperands,
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.zero") return 0;
      if (property === "note.status") return "4";
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      if (property === "note.huge") return 1e308;
      if (property === "note.tiny") return 1e-308;
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("returns finite numeric remainders with multiplicative precedence", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("-0 % note.points", resolve);
    const maximumOperands = Array.from({ length: 10_000 }, () => "1").join(" % ");

    expect(evaluateNotesBaseFormula("note.points % 2", resolve)).toEqual({
      supported: true,
      value: 1,
    });
    expect(evaluateNotesBaseFormula("20 % 6 * 2", resolve)).toEqual({
      supported: true,
      value: 4,
    });
    expect(evaluateNotesBaseFormula("20 % 6 / 2", resolve)).toEqual({
      supported: true,
      value: 1,
    });
    expect(evaluateNotesBaseFormula("12 + 11 % 4 * 2", resolve)).toEqual({
      supported: true,
      value: 18,
    });
    expect(evaluateNotesBaseFormula("12 % -5", resolve)).toEqual({
      supported: true,
      value: 2,
    });
    expect(evaluateNotesBaseFormula("-11 % 4", resolve)).toEqual({
      supported: true,
      value: -3,
    });
    expect(evaluateNotesBaseFormula("(11 % 4) * 2", resolve)).toEqual({
      supported: true,
      value: 6,
    });
    expect(evaluateNotesBaseFormula("max(10 % 4, 1)", resolve)).toEqual({
      supported: true,
      value: 2,
    });
    expect(evaluateNotesBaseFormula('"%".contains("%")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula(maximumOperands, resolve)).toEqual({ supported: true, value: 0 });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects malformed, coercive, unsafe, excessive, or zero-divisor remainders", () => {
    const tooManyOperands = Array.from({ length: 10_001 }, () => "1").join(" % ");
    const unsupported = [
      "note.points %",
      "% note.points",
      "note.points %% 2",
      "note.points % %2",
      "note.points % +2",
      "note.points % note.zero",
      "note.zero % note.zero",
      "note.points % note.status",
      "note.points % note.missing",
      "note.points % note.infinity",
      "note.points % note.metadata",
      "note.points % process.exit()",
      "note.points % \"2",
      "note.points % (2",
      '"one" % "two"',
      "note.points % 2e1",
      tooManyOperands,
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.zero") return 0;
      if (property === "note.status") return "4";
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("compares finite numeric operands with the Obsidian greater-than operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.points > 2", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points > 4", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) > note.points", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 + 1 > 6", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("if(note.points > 2, \"High\", \"Low\")", resolve)).toEqual({
      supported: true,
      value: "High",
    });
    expect(evaluateNotesBaseFormula('"a > b".contains(">")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects malformed, coercive, non-finite, or unsafe greater-than comparisons", () => {
    const unsupported = [
      "note.points >",
      "> note.points",
      "note.points >> 2",
      "note.points > 2 > 1",
      'note.points > "2"',
      "note.points > true",
      "note.points > null",
      "note.points > note.missing",
      "note.points > note.infinity",
      "note.points > note.metadata",
      "note.points > process.exit()",
      'note.points > "2',
      "note.points > (2",
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 2 };
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("compares finite numeric operands with the Obsidian less-than operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.points < 4", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points < 2", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points < number(note.estimate)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 - 1 < 6", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("if(note.points < 4, \"Low\", \"High\")", resolve)).toEqual({
      supported: true,
      value: "Low",
    });
    expect(evaluateNotesBaseFormula('"a < b".contains("<")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects malformed, mixed, coercive, non-finite, or unsafe less-than comparisons", () => {
    const unsupported = [
      "note.points <",
      "< note.points",
      "note.points << 4",
      "note.points < 4 < 5",
      "note.points < 4 > 2",
      'note.points < "4"',
      "note.points < true",
      "note.points < null",
      "note.points < note.missing",
      "note.points < note.infinity",
      "note.points < note.metadata",
      "note.points < process.exit()",
      'note.points < "4',
      "note.points < (4",
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 4 };
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("compares finite numeric operands with the Obsidian greater-than-or-equal operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.points >= 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points >= 2", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points >= 4", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("number(note.estimate) >= note.points", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 + 1 >= 7", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("if(note.points >= 3, \"Enough\", \"Low\")", resolve)).toEqual({
      supported: true,
      value: "Enough",
    });
    expect(evaluateNotesBaseFormula('"a >= b".contains(">=")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects malformed, mixed, coercive, non-finite, or unsafe greater-than-or-equal comparisons", () => {
    const unsupported = [
      "note.points >=",
      ">= note.points",
      "note.points >== 3",
      "note.points >= 3 >= 2",
      "note.points >= 3 > 2",
      "note.points > 2 >= 1",
      "note.points >= 3 < 4",
      "note.points >= 3 <= 4",
      'note.points >= "3"',
      "note.points >= true",
      "note.points >= null",
      "note.points >= note.missing",
      "note.points >= note.infinity",
      "note.points >= note.metadata",
      "note.points >= process.exit()",
      'note.points >= "3',
      "note.points >= (3",
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 3 };
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("compares finite numeric operands with the Obsidian less-than-or-equal operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.points <= 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points <= 4", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points <= 2", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points <= number(note.estimate)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 - 1 <= 5", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("if(note.points <= 3, \"Within\", \"High\")", resolve)).toEqual({
      supported: true,
      value: "Within",
    });
    expect(evaluateNotesBaseFormula('"a <= b".contains("<=")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects malformed, mixed, coercive, non-finite, or unsafe less-than-or-equal comparisons", () => {
    const unsupported = [
      "note.points <=",
      "<= note.points",
      "note.points <== 3",
      "note.points <= 3 <= 4",
      "note.points <= 3 < 4",
      "note.points < 4 <= 5",
      "note.points <= 3 > 2",
      "note.points <= 3 >= 2",
      'note.points <= "3"',
      "note.points <= true",
      "note.points <= null",
      "note.points <= note.missing",
      "note.points <= note.infinity",
      "note.points <= note.metadata",
      "note.points <= process.exit()",
      'note.points <= "3',
      "note.points <= (3",
    ];
    const resolve = (property: string) => {
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.metadata") return { value: 3 };
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("orders direct recognized Obsidian date operands", () => {
    const dateRow = {
      started: "2026-07-01",
      due: "2026-07-21 09:30:00",
      invalid: "2026-02-29",
    };
    const resolve = (property: string) => dateRow[property.replace(/^note\./u, "") as keyof typeof dateRow];

    expect(evaluateNotesBaseFormula("note.started < note.due", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.due > note.started", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('note.started <= date("2026-07-01")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('(date("2026-07-21 09:30:00")) >= (note.due)', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("orders recognized dates after bounded duration offsets", () => {
    const now = Date.now();
    const resolve = (property: string) => {
      if (property === "file.recent") return new Date(now - 6 * 86_400_000).toISOString();
      if (property === "file.old") return new Date(now - 8 * 86_400_000).toISOString();
      return undefined;
    };

    expect(evaluateNotesBaseFormula('file.recent > now() - "7d"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('(now() - "7d") <= file.recent', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('if(file.recent > now() - "7d", "Recent", "Old")', resolve)).toEqual({
      supported: true,
      value: "Recent",
    });
    expect(evaluateNotesBaseFormula('file.old < now() - "7d"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('date("2026-01-31") + "1M" >= date("2026-02-28")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('date("2026-01-31") + (duration("1d") * 2) < date("2026-02-03")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects coercive, mixed, invalid, or unsafe date ordering", () => {
    const resolve = (property: string) => {
      if (property === "note.started") return "2026-07-01";
      if (property === "note.invalid") return "2026-02-29";
      return undefined;
    };
    const unsupported = [
      '"2026-07-01" < "2026-07-02"',
      'note.started < "2026-07-02"',
      "note.started < 1",
      'note.invalid < date("2026-07-01")',
      'date("2026-02-29") < note.started',
      'date("2026-07-01") + "bogus" < date("2026-07-03")',
      'date("2026-07-01") + 1 < date("2026-07-03")',
      '"2026-07-01" + "1d" < date("2026-07-03")',
      'date("2026-07-01") < date("2026-07-02") < date("2026-07-03")',
      "note.started < process.exit()",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("compares bounded scalar operands with the Obsidian equality operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula('note.status == "active"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('note.status == "done"', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points == 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points == note.estimate", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.done == false", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.missing == null", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 - 3 == 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('upper(note.status) == "ACTIVE"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('if(note.status == "active", "Open", "Closed")', resolve)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(evaluateNotesBaseFormula('"a == b".contains("==")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects malformed, structured, non-finite, excessive, or unsafe equality comparisons", () => {
    const unsupported = [
      "note.status ==",
      "== note.status",
      "note.status === \"active\"",
      'note.status == "active" == true',
      "note.points == 3 >= 2",
      "note.points >= 3 == true",
      "note.points == note.infinity",
      "note.tags == note.tags",
      "note.metadata == note.metadata",
      "note.status == process.exit()",
      'note.status == "active',
      "note.points == (3",
    ];
    const oversized = "a".repeat(100_001);
    const resolve = (property: string) => {
      if (property === "note.status") return "active";
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.tags") return ["daily"];
      if (property === "note.metadata") return { value: "active" };
      if (property === "note.oversized") return oversized;
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
    expect(evaluateNotesBaseFormula("note.oversized == note.oversized", resolve).supported).toBe(false);
  });

  it("compares bounded scalar operands with the Obsidian inequality operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula('note.status != "done"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('note.status != "active"', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points != 3", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points != note.estimate", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('note.points != "3"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.done != true", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.missing != null", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.points * 2 - 3 != 4", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('upper(note.status) != "DONE"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('if(note.status != "done", "Open", "Closed")', resolve)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(evaluateNotesBaseFormula('"a != b".contains("!=")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("negates one supported operand with the Obsidian boolean NOT operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("!note.done", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("!note.status", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("!null", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("!upper(note.status)", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("!note.done == true", resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("combines bounded supported operands with the Obsidian boolean AND operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.status && note.points", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.done && note.status", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("null && true", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('note.points > 2 && note.status == "active"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("!note.done && note.points >= 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('if(note.points > 2 && !note.done, "Open", "Closed")', resolve)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(evaluateNotesBaseFormula("note.status && note.points && !note.done", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("true && note.done && true", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('true && "a && b".contains("&&") && (true && true)', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('"a && b".contains("&&")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("combines bounded supported operands with the Obsidian boolean OR operator", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("note.done || note.status", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.done || false", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("null || true", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("!note.done || false", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('note.points < 2 || note.status == "active"', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.done || !note.done && note.points >= 3", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("true && false || false && true", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('if(note.done || note.points > 2, "Open", "Closed")', resolve)).toEqual({
      supported: true,
      value: "Open",
    });
    expect(evaluateNotesBaseFormula("note.done || false || note.status", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("false || note.done || null", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('false || "a || b".contains("||") || (false || true)', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('"a || b".contains("||")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("short-circuits safe boolean branches without allowing unsafe syntax to hide", () => {
    const reads = new Map<string, number>();
    const resolve = (property: string) => {
      const name = property.replace(/^note\./u, "");
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return name === "guard";
    };

    expect(evaluateNotesBaseFormula("note.guard || note.points > null", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(reads).toEqual(new Map([["guard", 1]]));
    reads.clear();

    expect(evaluateNotesBaseFormula("!note.guard && note.points > null", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(reads).toEqual(new Map([["guard", 1]]));
    expect(evaluateNotesBaseFormula("true || process.exit()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("false && process.exit()", resolve).supported).toBe(false);
  });

  it("evaluates boolean-chain operands once until short-circuit", () => {
    const values = { first: true, second: true, third: false } satisfies Record<string, boolean>;
    const reads = new Map<string, number>();
    const resolve = (property: string) => {
      const name = property.replace(/^note\./u, "");
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return values[name];
    };

    expect(evaluateNotesBaseFormula("note.first && note.second && note.third", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(reads).toEqual(new Map([
      ["first", 1],
      ["second", 1],
      ["third", 1],
    ]));

    reads.clear();
    expect(evaluateNotesBaseFormula("note.third || note.first || note.second", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(reads).toEqual(new Map([
      ["third", 1],
      ["first", 1],
    ]));
  });

  it("bounds same-operator boolean chains at 10,000 operands", () => {
    const maximum = Array.from({ length: 10_000 }, () => "true").join(" && ");
    const excessive = `${maximum} && true`;

    expect(evaluateNotesBaseFormula(maximum, () => undefined)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(excessive, () => undefined).supported).toBe(false);
  });

  it("rejects empty, malformed, or unsafe boolean OR operands", () => {
    const unsupported = [
      "|| true",
      "true ||",
      "true || process.exit()",
      "true | false",
      'true || "unterminated',
      "true || (false",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, () => undefined).supported, expression).toBe(false);
    }
  });

  it("rejects empty, malformed, or unsafe boolean AND operands", () => {
    const unsupported = [
      "&& true",
      "true &&",
      "true && process.exit()",
      "true & false",
      'true && "unterminated',
      "true && (false",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, () => undefined).supported, expression).toBe(false);
    }
  });

  it("rejects empty, repeated, malformed, or unsafe boolean NOT operands", () => {
    const unsupported = [
      "!",
      "!!note.done",
      "! !note.done",
      "!process.exit()",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, () => false).supported, expression).toBe(false);
    }
  });

  it("rejects malformed, structured, non-finite, excessive, or unsafe inequality comparisons", () => {
    const unsupported = [
      "note.status !=",
      "!= note.status",
      'note.status !== "active"',
      'note.status != "active" != false',
      "note.points != 3 >= 2",
      "note.points >= 3 != true",
      "note.points != note.infinity",
      "note.tags != note.tags",
      "note.metadata != note.metadata",
      "note.status != process.exit()",
      'note.status != "active',
      "note.points != (3",
    ];
    const oversized = "a".repeat(100_001);
    const resolve = (property: string) => {
      if (property === "note.status") return "active";
      if (property === "note.points") return 3;
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.tags") return ["daily"];
      if (property === "note.metadata") return { value: "active" };
      if (property === "note.oversized") return oversized;
      return undefined;
    };

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
    expect(evaluateNotesBaseFormula("note.oversized != note.oversized", resolve).supported).toBe(false);
  });

  it("rejects coercive, malformed, unsafe, or oversized max calls", () => {
    const tooManyArguments = `max(${Array.from({ length: 10_001 }, () => "1").join(",")})`;
    const unsupported = [
      "max()",
      'max(1, "2")',
      "max(1, true)",
      "max(1, null)",
      "max(1, note.missing)",
      "max(1, note.infinity)",
      "max(1, 2,)",
      "max(process.exit(), 2)",
      tooManyArguments,
    ];
    const resolve = (property: string) => property === "note.infinity"
      ? Number.POSITIVE_INFINITY
      : undefined;

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("returns the smallest finite number with the Obsidian min helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];
    const negativeZero = evaluateNotesBaseFormula("min(-0, 0)", resolve);
    const maximumArguments = `min(${Array.from({ length: 10_000 }, () => "1").join(",")})`;

    expect(evaluateNotesBaseFormula("min(4, note.points, (-9).abs())", resolve)).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula("min(0, 0)", resolve)).toEqual({
      supported: true,
      value: 0,
    });
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
    expect(evaluateNotesBaseFormula(maximumArguments, resolve)).toEqual({
      supported: true,
      value: 1,
    });
  });

  it("rejects coercive, malformed, unsafe, or oversized min calls", () => {
    const tooManyArguments = `min(${Array.from({ length: 10_001 }, () => "1").join(",")})`;
    const unsupported = [
      "min()",
      'min(1, "2")',
      "min(1, true)",
      "min(1, null)",
      "min(1, note.missing)",
      "min(1, note.infinity)",
      "min(1, 2,)",
      "min(process.exit(), 2)",
      tooManyArguments,
    ];
    const resolve = (property: string) => property === "note.infinity"
      ? Number.POSITIVE_INFINITY
      : undefined;

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("reads Obsidian string and list length fields", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"hello\".length", resolve)).toEqual({
      supported: true,
      value: 5,
    });
    expect(evaluateNotesBaseFormula("\"😀\".length", resolve)).toEqual({
      supported: true,
      value: 2,
    });
    expect(evaluateNotesBaseFormula("note.status.length", resolve)).toEqual({
      supported: true,
      value: 6,
    });
    expect(evaluateNotesBaseFormula("note.tags.length", resolve)).toEqual({
      supported: true,
      value: 2,
    });
    expect(evaluateNotesBaseFormula("list(note.status).length", resolve)).toEqual({
      supported: true,
      value: 1,
    });
  });

  it("rejects unsupported or unsafe length field receivers", () => {
    const resolve = (property: string) => {
      if (property === "note.metadata") return { length: 2 };
      if (property === "note.missing") return undefined;
      if (property === "note.points") return 3;
      if (property === "note.done") return false;
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.metadata.length", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.length", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.length", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.length", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.length()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.length.extra", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("\"unterminated.length", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().length", resolve).supported).toBe(false);
  });

  it("checks string substrings with the Obsidian contains helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"active\".contains(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.contains(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.contains(note.query)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("upper(note.status).contains(\"ACT\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.contains(\"Act\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.contains(\"\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.contains(\"act\"), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("rejects unsafe string contains argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.contains()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.contains(\"act\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.contains(\"a\", \"b\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.contains(note.points)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().contains(\"active\")", () => undefined).supported).toBe(false);
  });

  it("checks exact scalar list membership with the Obsidian contains helper", () => {
    const listRow = {
      ...row,
      numbers: [1, 2, 3],
      flags: [true, false],
      nullable: [null, "set"],
      bounded: [...Array.from({ length: 9_999 }, () => "other"), "daily"],
    };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.tags.contains(\"daily\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.tags.contains(\"Daily\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.numbers.contains(2)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.numbers.contains(\"2\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.flags.contains(false)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.nullable.contains(null)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.missing).contains(note.missing)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.bounded.contains(\"daily\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.status).contains(\"active\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.tags.contains(\"review\"), \"Review\", \"Other\")", resolve)).toEqual({
      supported: true,
      value: "Review",
    });
  });

  it("rejects unsafe or excessive list contains argument and receiver shapes", () => {
    const resolve = (property: string) => {
      if (property === "note.tags") return ["daily"];
      if (property === "note.metadata") return { label: "daily" };
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.large") return Array.from({ length: 10_001 }, () => "daily");
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.tags.contains()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.contains(\"daily\",)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.contains(\"daily\", \"review\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.contains(list(note.status))", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.contains(note.metadata)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.contains(note.infinity)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.contains(\"daily\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().contains(\"daily\")", resolve).supported).toBe(false);
  });

  it("checks that strings contain every query with the Obsidian containsAll helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"active\".containsAll(\"act\", \"ive\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAll(note.query, \"ive\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("upper(note.status).containsAll(\"ACT\", \"IVE\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"act\", \"open\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"Act\", \"ive\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"\", \"active\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.containsAll(\"act\", \"ive\"), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("rejects unsafe string containsAll argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.containsAll()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"act\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.containsAll(\"act\", note.points)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().containsAll(\"active\")", () => undefined).supported).toBe(false);
  });

  it("checks exact scalar list all-membership with the Obsidian containsAll helper", () => {
    const listRow = {
      ...row,
      numbers: [1, 2, 3],
      flags: [true, false],
      nullable: [null, "set"],
      bounded: [...Array.from({ length: 9_998 }, () => "other"), "daily", "review"],
    };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.tags.containsAll(\"daily\", \"review\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.tags.containsAll(\"daily\", \"missing\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.tags.containsAll(\"Daily\", \"review\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.numbers.containsAll(1, 3)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.numbers.containsAll(1, \"3\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.flags.containsAll(true, false)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.nullable.containsAll(null, \"set\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.missing).containsAll(note.missing)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.bounded.containsAll(\"daily\", \"review\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.status).containsAll(\"active\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.tags.containsAll(\"daily\", \"review\"), \"Review\", \"Other\")", resolve)).toEqual({
      supported: true,
      value: "Review",
    });
  });

  it("rejects unsafe or excessive list containsAll argument and receiver shapes", () => {
    const resolve = (property: string) => {
      if (property === "note.tags") return ["daily", "review"];
      if (property === "note.metadata") return { label: "daily" };
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.large") return Array.from({ length: 10_001 }, () => "daily");
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.tags.containsAll()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAll(\"daily\",)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAll(list(note.status))", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAll(note.metadata)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAll(note.infinity)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.containsAll(\"daily\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula(`note.tags.containsAll(${Array.from({ length: 10_001 }, () => "\"daily\"").join(",")})`, resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().containsAll(\"daily\")", resolve).supported).toBe(false);
  });

  it("checks that strings contain any query with the Obsidian containsAny helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"active\".containsAny(\"open\", \"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"open\", note.query)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("upper(note.status).containsAny(\"OPEN\", \"ACT\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"open\", \"closed\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"Act\", \"IVE\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"missing\", \"\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.containsAny(\"open\", \"act\"), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("rejects unsafe string containsAny argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.containsAny()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"act\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.containsAny(\"act\", note.points)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().containsAny(\"active\")", () => undefined).supported).toBe(false);
  });

  it("checks exact scalar list any-membership with the Obsidian containsAny helper", () => {
    const listRow = {
      ...row,
      numbers: [1, 2, 3],
      flags: [true, false],
      nullable: [null, "set"],
      bounded: [...Array.from({ length: 9_999 }, () => "other"), "daily"],
    };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.tags.containsAny(\"missing\", \"review\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.tags.containsAny(\"missing\", \"other\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.tags.containsAny(\"Daily\", \"Review\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.numbers.containsAny(0, 3)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.numbers.containsAny(0, \"3\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.flags.containsAny(true)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.nullable.containsAny(null)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.missing).containsAny(note.missing)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.bounded.containsAny(\"missing\", \"daily\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.status).containsAny(\"active\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.tags.containsAny(\"missing\", \"review\"), \"Review\", \"Other\")", resolve)).toEqual({
      supported: true,
      value: "Review",
    });
  });

  it("rejects unsafe or excessive list containsAny argument and receiver shapes", () => {
    const resolve = (property: string) => {
      if (property === "note.tags") return ["daily", "review"];
      if (property === "note.metadata") return { label: "daily" };
      if (property === "note.infinity") return Number.POSITIVE_INFINITY;
      if (property === "note.large") return Array.from({ length: 10_001 }, () => "daily");
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.tags.containsAny()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAny(\"daily\",)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAny(list(note.status))", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAny(note.metadata)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.containsAny(note.infinity)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.containsAny(\"daily\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula(`note.tags.containsAny(${Array.from({ length: 10_001 }, () => "\"daily\"").join(",")})`, resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().containsAny(\"daily\")", resolve).supported).toBe(false);
  });

  it("joins bounded scalar lists with the Obsidian join helper", () => {
    const listRow = {
      ...row,
      empty: [],
      mixed: ["daily", 2, true, null, undefined, "review"],
      separator: " | ",
      bounded: Array.from({ length: 10_000 }, () => ""),
    };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.tags.join(\", \")", resolve)).toEqual({
      supported: true,
      value: "daily, review",
    });
    expect(evaluateNotesBaseFormula("note.mixed.join(note.separator)", resolve)).toEqual({
      supported: true,
      value: "daily | 2 | true |  |  | review",
    });
    expect(evaluateNotesBaseFormula("note.empty.join(\",\")", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("list(note.status).join(\" / \")", resolve)).toEqual({
      supported: true,
      value: "active",
    });
    expect(evaluateNotesBaseFormula("note.bounded.join(\"\")", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.tags.join(\" / \"), \"!\")", resolve)).toEqual({
      supported: true,
      value: "daily / review!",
    });
  });

  it("rejects unsafe or excessive list join argument and receiver shapes", () => {
    const resolve = (property: string) => {
      if (property === "note.tags") return ["daily", "review"];
      if (property === "note.nested") return [["daily"], "review"];
      if (property === "note.metadata") return [{ label: "daily" }];
      if (property === "note.infinity") return [Number.POSITIVE_INFINITY];
      if (property === "note.large") return Array.from({ length: 10_001 }, () => "");
      if (property === "note.exact") return ["x".repeat(100_000)];
      if (property === "note.excessive") return ["x".repeat(100_001)];
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.tags.join()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.join(\",\",)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.join(\",\", \";\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.join(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.join(\",\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nested.join(\",\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.join(\",\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.join(\",\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.join(\"\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.exact.join(\"\")", resolve).supported).toBe(true);
    expect(evaluateNotesBaseFormula("note.excessive.join(\"\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().join(\",\")", resolve).supported).toBe(false);
  });

  it("deduplicates bounded scalar lists with the Obsidian unique helper", () => {
    const listRow = {
      ...row,
      empty: [],
      repeated: ["daily", 2, "2", true, null, undefined, "daily", 2, true, null, undefined, "review"],
      bounded: [...Array.from({ length: 9_999 }, () => "daily"), "review"],
    };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.repeated.unique()", resolve)).toEqual({
      supported: true,
      value: ["daily", 2, "2", true, null, undefined, "review"],
    });
    expect(evaluateNotesBaseFormula("note.empty.unique()", resolve)).toEqual({ supported: true, value: [] });
    expect(evaluateNotesBaseFormula("note.bounded.unique()", resolve)).toEqual({
      supported: true,
      value: ["daily", "review"],
    });
    expect(evaluateNotesBaseFormula("list(note.status).unique()", resolve)).toEqual({
      supported: true,
      value: ["active"],
    });
    expect(evaluateNotesBaseFormula("concat(note.tags.unique(), \"!\")", resolve)).toEqual({
      supported: true,
      value: "daily, review!",
    });
  });

  it("rejects unsafe or excessive list unique argument and receiver shapes", () => {
    const resolve = (property: string) => {
      if (property === "note.tags") return ["daily", "daily"];
      if (property === "note.nested") return [["daily"], "review"];
      if (property === "note.metadata") return [{ label: "daily" }];
      if (property === "note.infinity") return [Number.POSITIVE_INFINITY];
      if (property === "note.large") return Array.from({ length: 10_001 }, () => "daily");
      return "active";
    };

    expect(evaluateNotesBaseFormula("note.tags.unique(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.unique(,)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.unique()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nested.unique()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.unique()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.unique()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.unique()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().unique()", resolve).supported).toBe(false);
  });

  it("recursively flattens nested scalar lists with the Obsidian flat helper without mutating the source", () => {
    const groups = [["daily", ["review", 3]], [], [false, [null, undefined]], "ready"];
    const flatRow = { ...row, groups };
    const resolve = (property: string) => flatRow[property.replace(/^note\./u, "") as keyof typeof flatRow];

    expect(evaluateNotesBaseFormula("note.groups.flat()", resolve)).toEqual({
      supported: true,
      value: ["daily", "review", 3, false, null, undefined, "ready"],
    });
    expect(evaluateNotesBaseFormula("list(note.groups).flat()", resolve)).toEqual({
      supported: true,
      value: ["daily", "review", 3, false, null, undefined, "ready"],
    });
    expect(evaluateNotesBaseFormula("length(note.groups.flat())", resolve)).toEqual({
      supported: true,
      value: 7,
    });
    expect(groups).toEqual([["daily", ["review", 3]], [], [false, [null, undefined]], "ready"]);
  });

  it("supports shared nested lists and rejects unsafe or excessive flat receiver shapes", () => {
    const shared = ["daily", ["review"]];
    const cyclic: unknown[] = ["daily"];
    cyclic.push(cyclic);
    let deeplyNested = "daily" satisfies unknown;
    for (let depth = 0; depth < 10_000; depth += 1) deeplyNested = [deeplyNested];
    const flatRow = {
      shared: [shared, shared],
      cyclic,
      deeplyNested,
      bounded: Array.from({ length: 10_000 }, (_, index) => index),
      excessive: Array.from({ length: 10_001 }, () => "daily"),
      nestedExcessive: [Array.from({ length: 10_001 }, () => "daily")],
      excessiveEmptyNesting: Array.from({ length: 10_001 }, () => []),
      metadata: [["daily"], { kind: "review" }],
      infinity: [["daily"], Number.POSITIVE_INFINITY],
      callable: [["daily"], () => "review"],
    };
    const resolve = (property: string) => flatRow[property.replace(/^note\./u, "") as keyof typeof flatRow];

    expect(evaluateNotesBaseFormula("note.shared.flat()", resolve)).toEqual({
      supported: true,
      value: ["daily", "review", "daily", "review"],
    });
    expect(evaluateNotesBaseFormula("note.deeplyNested.flat()", resolve)).toEqual({
      supported: true,
      value: ["daily"],
    });
    const bounded = evaluateNotesBaseFormula("note.bounded.flat()", resolve);
    expect(bounded.supported && Array.isArray(bounded.value) ? bounded.value.length : 0).toBe(10_000);
    expect(evaluateNotesBaseFormula("note.tags.flat(1)", () => ["daily"]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.flat(,)", () => ["daily"]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.flat()", () => "daily").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.cyclic.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.excessive.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nestedExcessive.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.excessiveEmptyNesting.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.callable.flat()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().flat()", resolve).supported).toBe(false);
  });

  it("maps bounded scalar lists with contextual value and index without mutating the source", () => {
    const values = [1, 2, 3];
    const labels = ["daily", "review"];
    const mapRow = { ...row, values, labels, empty: [], increment: 4 };
    const resolve = (property: string) => mapRow[property.replace(/^note\./u, "") as keyof typeof mapRow];

    expect(evaluateNotesBaseFormula("note.values.map(value + 1)", resolve)).toEqual({
      supported: true,
      value: [2, 3, 4],
    });
    expect(evaluateNotesBaseFormula("note.values.map(value * index)", resolve)).toEqual({
      supported: true,
      value: [0, 2, 6],
    });
    expect(evaluateNotesBaseFormula("note.values.map(value + note.increment)", resolve)).toEqual({
      supported: true,
      value: [5, 6, 7],
    });
    expect(evaluateNotesBaseFormula("note.labels.map(upper(value))", resolve)).toEqual({
      supported: true,
      value: ["DAILY", "REVIEW"],
    });
    expect(evaluateNotesBaseFormula('note.labels.map(value + ".map(.filter(")', resolve)).toEqual({
      supported: true,
      value: ["daily.map(.filter(", "review.map(.filter("],
    });
    expect(evaluateNotesBaseFormula("note.empty.map(value)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(values).toEqual([1, 2, 3]);
    expect(labels).toEqual(["daily", "review"]);
  });

  it("rejects unsafe or excessive list map argument, receiver, expression, and result shapes", () => {
    const mapRow = {
      status: "active",
      values: [1, 2],
      nested: [[1]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      callable: [() => 1],
      large: Array.from({ length: 10_001 }, () => 1),
      bounded: Array.from({ length: 10_000 }, () => 1),
      excessiveSourceText: ["x".repeat(60_000), "y".repeat(40_001)],
      resultList: ["daily"],
      resultObject: { kind: "review" },
      oversizedString: "x".repeat(100_001),
      resultChunk: "x".repeat(60_000),
    };
    const resolve = (property: string) => mapRow[property.replace(/^note\./u, "") as keyof typeof mapRow];

    const unsupported = [
      "note.values.map()",
      "note.values.map(value,)",
      "note.values.map(value, index)",
      "note.status.map(value)",
      "note.nested.map(value)",
      "note.metadata.map(value)",
      "note.infinity.map(value)",
      "note.callable.map(value)",
      "note.large.map(value)",
      "note.excessiveSourceText.map(value)",
      `note.bounded.map(value${" + 0".repeat(25)})`,
      "note.values.map(note.resultList)",
      "note.values.map(note.resultObject)",
      "note.values.map(note.oversizedString)",
      "note.values.map(note.resultChunk)",
      "note.values.map(note.values.map(value).join(\",\"))",
      "note.values.map(note.values.reduce(acc + value, 0))",
      "note.values.map(value +)",
      "note.values.map(process.exit())",
      "process.exit().map(value)",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("filters bounded scalar lists with contextual value and index without mutating the source", () => {
    const values = [1, 2, 3, 4];
    const labels = ["daily", "review", "archive"];
    const flags = [true, false, true];
    const markers = [".filter(", ".map(", "plain"];
    const filterRow = { ...row, values, labels, flags, markers, empty: [], minimum: 2 };
    const resolve = (property: string) => filterRow[property.replace(/^note\./u, "") as keyof typeof filterRow];

    expect(evaluateNotesBaseFormula("note.values.filter(value > 2)", resolve)).toEqual({
      supported: true,
      value: [3, 4],
    });
    expect(evaluateNotesBaseFormula("note.values.filter(index != 1)", resolve)).toEqual({
      supported: true,
      value: [1, 3, 4],
    });
    expect(evaluateNotesBaseFormula("note.values.filter(value >= note.minimum)", resolve)).toEqual({
      supported: true,
      value: [2, 3, 4],
    });
    expect(evaluateNotesBaseFormula("note.labels.filter(value.contains(\"a\"))", resolve)).toEqual({
      supported: true,
      value: ["daily", "archive"],
    });
    expect(evaluateNotesBaseFormula("note.flags.filter(!value)", resolve)).toEqual({
      supported: true,
      value: [false],
    });
    expect(evaluateNotesBaseFormula('note.markers.filter(value == ".filter(")', resolve)).toEqual({
      supported: true,
      value: [".filter("],
    });
    expect(evaluateNotesBaseFormula("note.empty.filter(value == 1)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(values).toEqual([1, 2, 3, 4]);
    expect(labels).toEqual(["daily", "review", "archive"]);
    expect(flags).toEqual([true, false, true]);
    expect(markers).toEqual([".filter(", ".map(", "plain"]);
  });

  it("rejects unsafe or excessive list filter argument, receiver, expression, and predicate shapes", () => {
    const filterRow = {
      status: "active",
      values: [1, 2],
      nested: [[1]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      callable: [() => true],
      large: Array.from({ length: 10_001 }, () => 1),
      bounded: Array.from({ length: 10_000 }, () => 1),
      excessiveSourceText: ["x".repeat(60_000), "y".repeat(40_001)],
    };
    const resolve = (property: string) => filterRow[property.replace(/^note\./u, "") as keyof typeof filterRow];

    const unsupported = [
      "note.values.filter()",
      "note.values.filter(value > 0,)",
      "note.values.filter(value > 0, index > 0)",
      "note.status.filter(value == 1)",
      "note.nested.filter(value == 1)",
      "note.metadata.filter(value == 1)",
      "note.infinity.filter(value == 1)",
      "note.callable.filter(value == 1)",
      "note.large.filter(value == 1)",
      "note.excessiveSourceText.filter(value.isTruthy())",
      `note.bounded.filter(value${" == 1 || value".repeat(8)} == 1)`,
      "note.values.filter(value)",
      "note.values.filter(1)",
      "note.values.filter(note.status)",
      "note.values.filter(note.values.filter(value > 0).isEmpty())",
      "note.values.filter(note.values.map(value).isEmpty())",
      "note.values.filter(note.values.reduce(acc + value, 0) > 0)",
      "note.values.filter(value >)",
      "note.values.filter(process.exit())",
      "process.exit().filter(value > 0)",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("reduces bounded scalar lists with contextual value, index, and acc without mutating the source", () => {
    const values = [1, 2, 3];
    const labels = ["daily", "review"];
    const reduceRow = { ...row, values, labels, empty: [], offset: 4 };
    const resolve = (property: string) => reduceRow[property.replace(/^note\./u, "") as keyof typeof reduceRow];

    expect(evaluateNotesBaseFormula("note.values.reduce(acc + value, 0)", resolve)).toEqual({
      supported: true,
      value: 6,
    });
    expect(evaluateNotesBaseFormula("note.values.reduce(acc + value + index, note.offset)", resolve)).toEqual({
      supported: true,
      value: 13,
    });
    expect(evaluateNotesBaseFormula('note.labels.reduce(acc + value, "")', resolve)).toEqual({
      supported: true,
      value: "dailyreview",
    });
    expect(evaluateNotesBaseFormula("note.values.reduce(if(value > acc, value, acc), 0)", resolve)).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula(
      'note.values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)',
      resolve,
    )).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula("note.values.map(value + 1).reduce(acc + value, 0)", resolve)).toEqual({
      supported: true,
      value: 9,
    });
    expect(evaluateNotesBaseFormula("note.empty.reduce(acc + value, note.offset)", resolve)).toEqual({
      supported: true,
      value: 4,
    });
    expect(evaluateNotesBaseFormula('note.labels.reduce(acc + value, ".reduce(.map(.filter(")', resolve)).toEqual({
      supported: true,
      value: ".reduce(.map(.filter(dailyreview",
    });
    expect(values).toEqual([1, 2, 3]);
    expect(labels).toEqual(["daily", "review"]);
  });

  it("rejects unsafe or excessive list reduce argument, receiver, expression, accumulator, and result shapes", () => {
    const reduceRow = {
      status: "active",
      values: [1, 2],
      nested: [[1]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      callable: [() => 1],
      large: Array.from({ length: 10_001 }, () => 1),
      bounded: Array.from({ length: 10_000 }, () => 1),
      excessiveSourceText: ["x".repeat(60_000), "y".repeat(40_001)],
      initialList: [0],
      initialObject: { value: 0 },
      initialInfinity: Number.POSITIVE_INFINITY,
      initialCallable: () => 0,
      oversizedString: "x".repeat(100_001),
      resultList: [1],
      resultObject: { value: 1 },
      resultInfinity: Number.POSITIVE_INFINITY,
      textChunks: ["x".repeat(60_000), "y".repeat(60_000)],
      progressiveText: Array.from({ length: 1_500 }, () => "x"),
    };
    const resolve = (property: string) => reduceRow[property.replace(/^note\./u, "") as keyof typeof reduceRow];

    const unsupported = [
      "note.values.reduce()",
      "note.values.reduce(acc + value)",
      "note.values.reduce(acc + value,)",
      "note.values.reduce(acc + value, 0, index)",
      "note.status.reduce(acc + value, 0)",
      "note.nested.reduce(acc + value, 0)",
      "note.metadata.reduce(acc + value, 0)",
      "note.infinity.reduce(acc + value, 0)",
      "note.callable.reduce(acc + value, 0)",
      "note.large.reduce(acc + value, 0)",
      "note.excessiveSourceText.reduce(acc, 0)",
      `note.bounded.reduce(acc${" + 0".repeat(25)}, 0)`,
      "note.values.reduce(acc + value, note.initialList)",
      "note.values.reduce(acc + value, note.initialObject)",
      "note.values.reduce(acc + value, note.initialInfinity)",
      "note.values.reduce(acc + value, note.initialCallable)",
      "note.values.reduce(acc + value, note.oversizedString)",
      "note.values.reduce(note.resultList, 0)",
      "note.values.reduce(note.resultObject, 0)",
      "note.values.reduce(note.resultInfinity, 0)",
      "note.values.reduce(note.oversizedString, 0)",
      "note.textChunks.reduce(acc + value, \"\")",
      "note.progressiveText.reduce(acc + value, \"\")",
      "note.values.reduce(acc + note.values.map(value).length, 0)",
      "note.values.reduce(acc + note.values.filter(value > 0).length, 0)",
      "note.values.reduce(acc + value, note.values.reduce(acc + value, 0))",
      "note.values.reduce(acc +, 0)",
      "note.values.reduce(process.exit(), 0)",
      "process.exit().reduce(acc + value, 0)",
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });

  it("sorts numeric and natural string lists with the Obsidian sort helper without mutating the source", () => {
    const priorities = [10, 2, -1, 2];
    const labels = ["Task 10", "task 2", "Alpha"];
    const sortRow = { ...row, priorities, labels };
    const resolve = (property: string) => sortRow[property.replace(/^note\./u, "") as keyof typeof sortRow];

    expect(evaluateNotesBaseFormula("note.priorities.sort()", resolve)).toEqual({
      supported: true,
      value: [-1, 2, 2, 10],
    });
    expect(evaluateNotesBaseFormula("note.labels.sort()", resolve)).toEqual({
      supported: true,
      value: ["Alpha", "task 2", "Task 10"],
    });
    expect(priorities).toEqual([10, 2, -1, 2]);
    expect(labels).toEqual(["Task 10", "task 2", "Alpha"]);
  });

  it("sorts bounded scalar and allowlisted computed lists while preserving stable ties", () => {
    const stable = ["beta", "Beta", "BETA"];
    const sortRow = {
      ...row,
      empty: [],
      stable,
      mixed: [10, "2", true, false, null, undefined],
      bounded: Array.from({ length: 10_000 }, (_, index) => 9_999 - index),
    };
    const resolve = (property: string) => sortRow[property.replace(/^note\./u, "") as keyof typeof sortRow];

    expect(evaluateNotesBaseFormula("note.empty.sort()", resolve)).toEqual({ supported: true, value: [] });
    expect(evaluateNotesBaseFormula("note.stable.sort()", resolve)).toEqual({
      supported: true,
      value: ["beta", "Beta", "BETA"],
    });
    expect(evaluateNotesBaseFormula("note.mixed.sort()", resolve)).toEqual({
      supported: true,
      value: ["2", 10, false, null, true, undefined],
    });
    expect(evaluateNotesBaseFormula("list(note.status).sort()", resolve)).toEqual({
      supported: true,
      value: ["active"],
    });
    const bounded = evaluateNotesBaseFormula("note.bounded.sort()", resolve);
    const boundedValue = bounded.supported && Array.isArray(bounded.value) ? bounded.value : [];
    expect(boundedValue).toHaveLength(10_000);
    expect(boundedValue[0]).toBe(0);
    expect(boundedValue[9_999]).toBe(9_999);
    expect(stable).toEqual(["beta", "Beta", "BETA"]);
  });

  it("rejects unsafe or excessive list sort argument and receiver shapes", () => {
    const sortRow = {
      status: "active",
      nested: [["daily"]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      callable: [() => "review"],
      large: Array.from({ length: 10_001 }, () => "daily"),
    };
    const resolve = (property: string) => sortRow[property.replace(/^note\./u, "") as keyof typeof sortRow];

    expect(evaluateNotesBaseFormula("note.tags.sort(1)", () => ["daily"]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.sort(,)", () => ["daily"]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nested.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.callable.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.sort()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().sort()", resolve).supported).toBe(false);
  });

  it("checks string suffixes with the Obsidian endsWith helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"active\".endsWith(\"ive\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"ive\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.endsWith(note.query)", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("upper(note.status).endsWith(\"IVE\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"act\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"IVE\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.endsWith(\"ive\"), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("rejects unsafe string endsWith argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.endsWith()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"ive\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.endsWith(\"ive\", \"active\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.endsWith(note.points)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.endsWith(\"review\")", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().endsWith(\"active\")", () => undefined).supported).toBe(false);
  });

  it("checks string prefixes with the Obsidian startsWith helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"active\".startsWith(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"act\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.startsWith(note.query)", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("upper(note.status).startsWith(\"ACT\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"ive\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"ACT\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.startsWith(\"act\"), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("rejects unsafe string startsWith argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.startsWith()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"act\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.startsWith(\"act\", \"active\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.startsWith(note.points)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.startsWith(\"daily\")", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().startsWith(\"active\")", () => undefined).supported).toBe(false);
  });

  it("lowercases strings with the Obsidian lower helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"ACTIVE\".lower()", resolve)).toEqual({ supported: true, value: "active" });
    expect(evaluateNotesBaseFormula("\"ÄBC\".lower()", resolve)).toEqual({ supported: true, value: "äbc" });
    expect(evaluateNotesBaseFormula("note.title.lower()", resolve)).toEqual({ supported: true, value: "task" });
    expect(evaluateNotesBaseFormula("upper(note.status).lower()", resolve)).toEqual({ supported: true, value: "active" });
    expect(evaluateNotesBaseFormula("note.status.lower()", resolve)).toEqual({ supported: true, value: "active" });
    expect(evaluateNotesBaseFormula("concat(note.title.lower(), \" item\")", resolve)).toEqual({ supported: true, value: "task item" });
  });

  it("rejects unsafe string lower argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.lower(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.lower(,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.lower()", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.lower()", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("null.lower()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().lower()", () => undefined).supported).toBe(false);
  });

  it("repeats strings with the Obsidian repeat helper", () => {
    const repeatedRow = { ...row, count: 3, fractionalCount: 2.9, negativeFractionalCount: -0.5 };
    const resolve = (property: string) => repeatedRow[property.replace(/^note\./u, "") as keyof typeof repeatedRow];

    expect(evaluateNotesBaseFormula("\"ab\".repeat(3)", resolve)).toEqual({ supported: true, value: "ababab" });
    expect(evaluateNotesBaseFormula("note.title.repeat(note.count)", resolve)).toEqual({ supported: true, value: "TaskTaskTask" });
    expect(evaluateNotesBaseFormula("upper(note.status).repeat(2)", resolve)).toEqual({ supported: true, value: "ACTIVEACTIVE" });
    expect(evaluateNotesBaseFormula("note.status.repeat(0)", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("note.status.repeat(note.fractionalCount)", resolve)).toEqual({ supported: true, value: "activeactive" });
    expect(evaluateNotesBaseFormula("note.status.repeat(note.negativeFractionalCount)", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.status.repeat(2), \"!\")", resolve)).toEqual({ supported: true, value: "activeactive!" });
  });

  it("rejects unsafe string repeat argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.repeat()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.repeat(2,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.repeat(2, 3)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.repeat(-1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.repeat(\"2\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.repeat(note.count)", (property) => property === "note.count" ? Number.POSITIVE_INFINITY : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("\"ab\".repeat(50001)", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.repeat(2)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().repeat(2)", () => undefined).supported).toBe(false);
  });

  it("reverses strings with the Obsidian reverse helper", () => {
    const reversedRow = { ...row, unicode: "A😀B" };
    const resolve = (property: string) => reversedRow[property.replace(/^note\./u, "") as keyof typeof reversedRow];

    expect(evaluateNotesBaseFormula("\"hello\".reverse()", resolve)).toEqual({ supported: true, value: "olleh" });
    expect(evaluateNotesBaseFormula("note.title.reverse()", resolve)).toEqual({ supported: true, value: "ksaT" });
    expect(evaluateNotesBaseFormula("upper(note.status).reverse()", resolve)).toEqual({ supported: true, value: "EVITCA" });
    expect(evaluateNotesBaseFormula("note.unicode.reverse()", resolve)).toEqual({ supported: true, value: "B😀A" });
    expect(evaluateNotesBaseFormula("\"\".reverse()", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.status.reverse(), \"!\")", resolve)).toEqual({ supported: true, value: "evitca!" });
  });

  it("reverses scalar lists with the Obsidian reverse helper without mutating the source", () => {
    const tags = ["daily", 2, false, null, undefined];
    const reversedRow = {
      ...row,
      tags,
      bounded: Array.from({ length: 10_000 }, (_, index) => index),
    };
    const resolve = (property: string) => reversedRow[property.replace(/^note\./u, "") as keyof typeof reversedRow];

    expect(evaluateNotesBaseFormula("note.tags.reverse()", resolve)).toEqual({
      supported: true,
      value: [undefined, null, false, 2, "daily"],
    });
    expect(evaluateNotesBaseFormula("list(note.status).reverse()", resolve)).toEqual({
      supported: true,
      value: ["active"],
    });
    expect(evaluateNotesBaseFormula("length(note.tags.reverse())", resolve)).toEqual({
      supported: true,
      value: 5,
    });
    const bounded = evaluateNotesBaseFormula("note.bounded.reverse()", resolve);
    const boundedValue = bounded.supported && Array.isArray(bounded.value) ? bounded.value : [];
    expect(boundedValue).toHaveLength(10_000);
    expect(boundedValue[0]).toBe(9_999);
    expect(boundedValue[9_999]).toBe(0);
    expect(tags).toEqual(["daily", 2, false, null, undefined]);
  });

  it("slices scalar lists with the Obsidian slice helper without mutating the source", () => {
    const tags = ["daily", "review", 3, false, null, undefined];
    const slicedRow = {
      ...row,
      tags,
      start: 1.8,
      end: 4.9,
      bounded: Array.from({ length: 10_000 }, (_, index) => index),
    };
    const resolve = (property: string) => slicedRow[property.replace(/^note\./u, "") as keyof typeof slicedRow];

    expect(evaluateNotesBaseFormula("note.tags.slice(1, 4)", resolve)).toEqual({
      supported: true,
      value: ["review", 3, false],
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(2)", resolve)).toEqual({
      supported: true,
      value: [3, false, null, undefined],
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(note.start, note.end)", resolve)).toEqual({
      supported: true,
      value: ["review", 3, false],
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(number(note.start), number(note.end))", resolve)).toEqual({
      supported: true,
      value: ["review", 3, false],
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(-3, -1)", resolve)).toEqual({
      supported: true,
      value: [false, null],
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(-99, 99)", resolve)).toEqual({
      supported: true,
      value: tags,
    });
    expect(evaluateNotesBaseFormula("note.tags.slice(4, 2)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("list(note.status).slice(0)", resolve)).toEqual({
      supported: true,
      value: ["active"],
    });
    const bounded = evaluateNotesBaseFormula("note.bounded.slice(9998)", resolve);
    expect(bounded).toEqual({ supported: true, value: [9_998, 9_999] });
    expect(tags).toEqual(["daily", "review", 3, false, null, undefined]);
  });

  it("rejects unsafe or excessive list slice argument and receiver shapes", () => {
    const sliceRow = {
      tags: ["daily", "review"],
      nested: [["daily"]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      nonFiniteIndex: Number.NEGATIVE_INFINITY,
      large: Array.from({ length: 10_001 }, () => "daily"),
    };
    const resolve = (property: string) => sliceRow[property.replace(/^note\./u, "") as keyof typeof sliceRow];

    expect(evaluateNotesBaseFormula("note.tags.slice()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.slice(1,)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.slice(1, 2, 3)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.slice(\"1\")", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.slice(note.nonFiniteIndex)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.slice(1)", () => 3).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nested.slice(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.slice(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.slice(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.slice(1)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("null.slice(1)", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().slice(1)", () => undefined).supported).toBe(false);
  });

  it("rejects unsafe or excessive reverse argument and receiver shapes", () => {
    const reverseRow = {
      status: "active",
      nested: [["daily"]],
      metadata: [{ kind: "review" }],
      infinity: [Number.POSITIVE_INFINITY],
      large: Array.from({ length: 10_001 }, () => "daily"),
    };
    const resolve = (property: string) => reverseRow[property.replace(/^note\./u, "") as keyof typeof reverseRow];

    expect(evaluateNotesBaseFormula("note.status.reverse(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.reverse(,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.reverse()", () => 3).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.nested.reverse()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.reverse()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.infinity.reverse()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.reverse()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("null.reverse()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().reverse()", () => undefined).supported).toBe(false);
  });

  it("trims strings with the Obsidian trim helper", () => {
    const trimmedRow = { ...row, padded: "  Task  ", unicodeWhitespace: "\u00A0Review\u2003" };
    const resolve = (property: string) => trimmedRow[property.replace(/^note\./u, "") as keyof typeof trimmedRow];

    expect(evaluateNotesBaseFormula("\"  hello  \".trim()", resolve)).toEqual({ supported: true, value: "hello" });
    expect(evaluateNotesBaseFormula("note.padded.trim()", resolve)).toEqual({ supported: true, value: "Task" });
    expect(evaluateNotesBaseFormula("note.unicodeWhitespace.trim()", resolve)).toEqual({ supported: true, value: "Review" });
    expect(evaluateNotesBaseFormula("upper(note.padded).trim()", resolve)).toEqual({ supported: true, value: "TASK" });
    expect(evaluateNotesBaseFormula("\"   \".trim()", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.padded.trim(), \" item\")", resolve)).toEqual({ supported: true, value: "Task item" });
  });

  it("rejects unsafe string trim argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.trim(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.trim(,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.trim()", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.trim()", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("null.trim()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().trim()", () => undefined).supported).toBe(false);
  });

  it("slices strings with the Obsidian slice helper", () => {
    const slicedRow = { ...row, start: 1, end: 4, fractionalStart: 1.9, fractionalEnd: 4.8 };
    const resolve = (property: string) => slicedRow[property.replace(/^note\./u, "") as keyof typeof slicedRow];

    expect(evaluateNotesBaseFormula("\"hello\".slice(1, 4)", resolve)).toEqual({ supported: true, value: "ell" });
    expect(evaluateNotesBaseFormula("note.title.slice(note.start)", resolve)).toEqual({ supported: true, value: "ask" });
    expect(evaluateNotesBaseFormula("upper(note.status).slice(note.start, note.end)", resolve)).toEqual({ supported: true, value: "CTI" });
    expect(evaluateNotesBaseFormula("\"hello\".slice(-4, -1)", resolve)).toEqual({ supported: true, value: "ell" });
    expect(evaluateNotesBaseFormula("\"hello\".slice(note.fractionalStart, note.fractionalEnd)", resolve)).toEqual({ supported: true, value: "ell" });
    expect(evaluateNotesBaseFormula("\"hello\".slice(20)", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("\"hello\".slice(4, 1)", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.title.slice(1, 3), \"!\")", resolve)).toEqual({ supported: true, value: "as!" });
  });

  it("rejects unsafe string slice argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.slice()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.slice(1,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.slice(1, 2, 3)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.slice(\"1\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.slice(note.start)", (property) => property === "note.start" ? Number.POSITIVE_INFINITY : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.slice(1, note.end)", (property) => property === "note.end" ? Number.NEGATIVE_INFINITY : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.slice(1)", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().slice(1)", () => undefined).supported).toBe(false);
  });

  it("splits strings with the Obsidian split helper", () => {
    const splitRow = {
      ...row,
      csv: "alpha,beta,gamma",
      mixed: "Alpha,beta;Gamma",
      separator: ",",
      limit: 2.9,
    };
    const resolve = (property: string) => splitRow[property.replace(/^note\./u, "") as keyof typeof splitRow];

    expect(evaluateNotesBaseFormula("\"a,b,c,d\".split(\",\", 3)", resolve)).toEqual({
      supported: true,
      value: ["a", "b", "c"],
    });
    expect(evaluateNotesBaseFormula("note.csv.split(note.separator)", resolve)).toEqual({
      supported: true,
      value: ["alpha", "beta", "gamma"],
    });
    expect(evaluateNotesBaseFormula("upper(note.csv).split(\",\", note.limit)", resolve)).toEqual({
      supported: true,
      value: ["ALPHA", "BETA"],
    });
    expect(evaluateNotesBaseFormula("\"abc\".split(\"\")", resolve)).toEqual({
      supported: true,
      value: ["a", "b", "c"],
    });
    expect(evaluateNotesBaseFormula("note.csv.split(\",\", 0)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("\"a,b\".split(\",\", -0.5)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("\"a,b\".split(\",\", -1)", resolve)).toEqual({
      supported: true,
      value: ["a", "b"],
    });
    expect(evaluateNotesBaseFormula("\"a,b\".split(\",\", 4294967296)", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("length(note.csv.split(\",\"))", resolve)).toEqual({
      supported: true,
      value: 3,
    });
    expect(evaluateNotesBaseFormula("note.mixed.split(/[,;]/)", resolve)).toEqual({
      supported: true,
      value: ["Alpha", "beta", "Gamma"],
    });
    expect(evaluateNotesBaseFormula("note.mixed.split(/[,;]/, note.limit)", resolve)).toEqual({
      supported: true,
      value: ["Alpha", "beta"],
    });
    expect(evaluateNotesBaseFormula('"AlphaXbeta".split(/x/i)', resolve)).toEqual({
      supported: true,
      value: ["Alpha", "beta"],
    });
  });

  it("rejects unsafe or excessive string split argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.split()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(\",\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(\",\", 2, 3)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(\",\", \"2\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(\",\", note.limit)", (property) => property === "note.limit" ? Number.POSITIVE_INFINITY : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.split(\",\")", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.split(\",\")", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(/,+/)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(/,/ii)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(/,/ ,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.split(/,/, 2, 3)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      "note.status.split(note.pattern)",
      (property) => property === "note.pattern" ? /,/u : "active",
    ).supported).toBe(false);
    expect(evaluateNotesBaseFormula(`note.large.split(/${"a".repeat(100)}/)`, () => "a".repeat(10_001)).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().split(\",\")", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.split(\"\", 10000)", () => "a".repeat(10001)).supported).toBe(true);
    expect(evaluateNotesBaseFormula("note.large.split(\"\")", () => "a".repeat(10001)).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.split(//, 10000)", () => "a".repeat(10001)).supported).toBe(true);
    expect(evaluateNotesBaseFormula("note.large.split(//)", () => "a".repeat(10001)).supported).toBe(false);
  });

  it("replaces every literal string match with the Obsidian replace helper", () => {
    const replacementRow = {
      ...row,
      pattern: ":",
      replacement: " / ",
      status: "active:active",
      shout: "ACTIVE ACTIVE",
    };
    const resolve = (property: string) => replacementRow[property.replace(/^note\./u, "") as keyof typeof replacementRow];

    expect(evaluateNotesBaseFormula("\"a:b:c\".replace(\":\", \"-\")", resolve)).toEqual({
      supported: true,
      value: "a-b-c",
    });
    expect(evaluateNotesBaseFormula("note.status.replace(note.pattern, note.replacement)", resolve)).toEqual({
      supported: true,
      value: "active / active",
    });
    expect(evaluateNotesBaseFormula("lower(note.shout).replace(\"active\", \"ready\")", resolve)).toEqual({
      supported: true,
      value: "ready ready",
    });
    expect(evaluateNotesBaseFormula("\"unchanged\".replace(\"missing\", \"ready\")", resolve)).toEqual({
      supported: true,
      value: "unchanged",
    });
    expect(evaluateNotesBaseFormula("\"unchanged\".replace(\"\", \"-\")", resolve)).toEqual({
      supported: true,
      value: "-u-n-c-h-a-n-g-e-d-",
    });
    expect(evaluateNotesBaseFormula("\"\".replace(\"\", \"-\")", resolve)).toEqual({
      supported: true,
      value: "-",
    });
    expect(evaluateNotesBaseFormula("\"😀\".replace(\"\", \"-\")", resolve)).toEqual({
      supported: true,
      value: "-\uD83D-\uDE00-",
    });
    expect(evaluateNotesBaseFormula('"a".replace("", "$$")', resolve)).toEqual({
      supported: true,
      value: "$$a$$",
    });
    expect(evaluateNotesBaseFormula("\"a:b\".replace(\":\", \"$1\")", resolve)).toEqual({
      supported: true,
      value: "a$1b",
    });
    expect(evaluateNotesBaseFormula("concat(note.status.replace(\":\", \"-\"), \"!\")", resolve)).toEqual({
      supported: true,
      value: "active-active!",
    });
  });

  it("replaces the first or every safe regular-expression match with literal text", () => {
    const replacementRow = {
      ...row,
      replacement: "$1-ready",
      status: "active:ACTIVE,queued",
    };
    const resolve = (property: string) => replacementRow[property.replace(/^note\./u, "") as keyof typeof replacementRow];

    expect(evaluateNotesBaseFormula('"a:b:c".replace(/:/, "-")', resolve)).toEqual({
      supported: true,
      value: "a-b:c",
    });
    expect(evaluateNotesBaseFormula('"a:b:c".replace(/:/g, "-")', resolve)).toEqual({
      supported: true,
      value: "a-b-c",
    });
    expect(evaluateNotesBaseFormula('note.status.replace(/active/gi, note.replacement)', resolve)).toEqual({
      supported: true,
      value: "$1-ready:$1-ready,queued",
    });
    expect(evaluateNotesBaseFormula('note.status.replace(/[:,]/g, " / ")', resolve)).toEqual({
      supported: true,
      value: "active / ACTIVE / queued",
    });
    expect(evaluateNotesBaseFormula('"review".replace(/^/, "ready: ")', resolve)).toEqual({
      supported: true,
      value: "ready: review",
    });
    expect(evaluateNotesBaseFormula('concat(note.status.replace(/[:,]/g, "-"), "!")', resolve)).toEqual({
      supported: true,
      value: "active-ACTIVE-queued!",
    });
  });

  it("expands bounded regular-expression capture references", () => {
    const replacementRow = {
      replacement: "$2/$1",
      status: "A1 B2 C3",
    };
    const resolve = (property: string) => replacementRow[property.replace(/^note\./u, "") as keyof typeof replacementRow];

    expect(evaluateNotesBaseFormula('"Ada Lovelace".replace(/([A-Za-z][A-Za-z][A-Za-z]) ([A-Za-z][A-Za-z][A-Za-z][A-Za-z][A-Za-z][A-Za-z][A-Za-z][A-Za-z])/, "$2, $1")', resolve)).toEqual({
      supported: true,
      value: "Lovelace, Ada",
    });
    expect(evaluateNotesBaseFormula('note.status.replace(/([A-C])([0-9])/g, note.replacement)', resolve)).toEqual({
      supported: true,
      value: "1/A 2/B 3/C",
    });
    expect(evaluateNotesBaseFormula('"A1".replace(/([A-C])([0-9])/, "$0-$&-$$-$3-$2-$1")', resolve)).toEqual({
      supported: true,
      value: "$0-$&-$$-$3-1-A",
    });
    expect(evaluateNotesBaseFormula('"A1".replace(/([A-C])([0-9])/, "$10-$01-$2")', resolve)).toEqual({
      supported: true,
      value: "$10-$01-1",
    });
    expect(evaluateNotesBaseFormula(
      '"abcdefghi".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)/, "$9$8$7$6$5$4$3$2$1")',
      resolve,
    )).toEqual({
      supported: true,
      value: "ihgfedcba",
    });
  });

  it("rejects unsafe or excessive regular-expression capture replacement", () => {
    const unsupported = [
      '"ab".replace(/(a(b))/, "$1")',
      '"ab".replace(/()/, "$1")',
      '"abcdefghij".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)/, "$1")',
      '"aa".replace(/(a)\\1/, "$1")',
      '"ab".replace(/(ab/, "$1")',
      '"ab".replace(/ab)/, "$1")',
    ];

    for (const expression of unsupported) {
      expect(evaluateNotesBaseFormula(expression, () => undefined).supported, expression).toBe(false);
    }
    expect(evaluateNotesBaseFormula(
      'note.large.replace(/(a)/g, "$1$1")',
      (property) => property === "note.large" ? "a".repeat(50_001) : undefined,
    ).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'note.boundaries.replace(/(\\b)/g, note.captureHeavy)',
      (property) => {
        if (property === "note.boundaries") return "a ".repeat(11);
        if (property === "note.captureHeavy") return "$1".repeat(50_000);
        return undefined;
      },
    ).supported).toBe(false);
  });

  it("rejects unsafe or excessive string replace argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.replace()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(\":\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(\":\", \"-\", \"!\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(\":\",)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(1, \"-\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(\":\", 1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.replace(\":\", \"-\")", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(/:+/g, \"-\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(/:/gg, \"-\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(//g, \"-\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(/:/g,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(/:/g, 1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.replace(note.pattern, \"-\")", (property) => property === "note.pattern" ? /:/gu : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().replace(\":\", \"-\")", () => undefined).supported).toBe(false);
    const exactEmptyPatternLimit = evaluateNotesBaseFormula("note.source.replace(\"\", note.exact)", (property) => {
      if (property === "note.source") return "a".repeat(10);
      if (property === "note.exact") return "x".repeat(9_090);
      return undefined;
    });
    expect(exactEmptyPatternLimit.supported).toBe(true);
    if (exactEmptyPatternLimit.supported) {
      expect(exactEmptyPatternLimit.value).toBeTypeOf("string");
      expect(exactEmptyPatternLimit.value).toHaveLength(100_000);
    }
    expect(evaluateNotesBaseFormula("note.source.replace(\"\", note.excessive)", (property) => {
      if (property === "note.source") return "a";
      if (property === "note.excessive") return "x".repeat(50_000);
      return undefined;
    }).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.large.replace(\"aa\", \"\")", (property) => {
      if (property === "note.large") return "aa".repeat(50_001);
      return undefined;
    })).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("note.large.replace(\"a\", note.exact)", (property) => {
      if (property === "note.large") return "aa";
      if (property === "note.exact") return "x".repeat(50_000);
      return undefined;
    }).supported).toBe(true);
    expect(evaluateNotesBaseFormula("note.large.replace(\"a\", note.excessive)", (property) => {
      if (property === "note.large") return "aa";
      if (property === "note.excessive") return "x".repeat(50_001);
      return undefined;
    }).supported).toBe(false);
    const exactLimit = evaluateNotesBaseFormula('note.large.replace(/a/g, "xx")', () => "a".repeat(50_000));
    expect(exactLimit.supported).toBe(true);
    if (exactLimit.supported) {
      expect(exactLimit.value).toBeTypeOf("string");
      expect(exactLimit.value).toHaveLength(100_000);
      expect((exactLimit.value as string).startsWith("xxxx")).toBe(true);
    }
    expect(evaluateNotesBaseFormula('note.large.replace(/a/g, "xx")', () => "a".repeat(50_001)).supported).toBe(false);
    expect(evaluateNotesBaseFormula(`note.large.replace(/${"a".repeat(100)}/g, "x")`, () => "a".repeat(10_001)).supported).toBe(false);
  });

  it("title-cases strings with the Obsidian title helper", () => {
    const titledRow = { ...row, heading: "project alpha", unicode: "e\u0301clair déjà-vu café", numbered: "42nd street" };
    const resolve = (property: string) => titledRow[property.replace(/^note\./u, "") as keyof typeof titledRow];

    expect(evaluateNotesBaseFormula("\"hello world\".title()", resolve)).toEqual({ supported: true, value: "Hello World" });
    expect(evaluateNotesBaseFormula("note.heading.title()", resolve)).toEqual({ supported: true, value: "Project Alpha" });
    expect(evaluateNotesBaseFormula("lower(note.status).title()", resolve)).toEqual({ supported: true, value: "Active" });
    expect(evaluateNotesBaseFormula("note.unicode.title()", resolve)).toEqual({ supported: true, value: "E\u0301clair Déjà-Vu Café" });
    expect(evaluateNotesBaseFormula("note.numbered.title()", resolve)).toEqual({ supported: true, value: "42Nd Street" });
    expect(evaluateNotesBaseFormula("\"\".title()", resolve)).toEqual({ supported: true, value: "" });
    expect(evaluateNotesBaseFormula("concat(note.heading.title(), \"!\")", resolve)).toEqual({ supported: true, value: "Project Alpha!" });
  });

  it("rejects unsafe string title argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.title(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.title(,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.title()", (property) => property === "note.points" ? 3 : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.title()", (property) => property === "note.tags" ? ["daily", "review"] : undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("null.title()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().title()", () => undefined).supported).toBe(false);
  });

  it("checks empty and missing strings with the Obsidian isEmpty helper", () => {
    const emptinessRow = { ...row, empty: "", whitespace: " ", missing: undefined, nullable: null };
    const resolve = (property: string) => emptinessRow[property.replace(/^note\./u, "") as keyof typeof emptinessRow];

    expect(evaluateNotesBaseFormula("\"\".isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("\"text\".isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.empty.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.whitespace.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.missing.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.nullable.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("null.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("lower(note.status).isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("if(note.missing.isEmpty(), \"Empty\", \"Set\")", resolve)).toEqual({ supported: true, value: "Empty" });
  });

  it("checks empty and populated lists with the Obsidian isEmpty helper", () => {
    const listRow = { ...row, emptyTags: [] };
    const resolve = (property: string) => listRow[property.replace(/^note\./u, "") as keyof typeof listRow];

    expect(evaluateNotesBaseFormula("note.emptyTags.isEmpty()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.tags.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("list(note.status).isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("if(note.emptyTags.isEmpty(), \"Empty\", \"Set\")", resolve)).toEqual({
      supported: true,
      value: "Empty",
    });
  });

  it("checks present finite numbers with the Obsidian isEmpty helper", () => {
    const numericRow = { ...row, positive: 5, negative: -2.5, zero: 0 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("5.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("(-2.5).isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.positive.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.negative.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.zero.isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("number(\"7\").isEmpty()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("if(note.positive.isEmpty(), \"Empty\", \"Set\")", resolve)).toEqual({
      supported: true,
      value: "Set",
    });
  });

  it("checks empty and populated plain objects with the Obsidian isEmpty helper", () => {
    let getterRuns = 0;
    const accessor = Object.defineProperty(Object.create(null) as Record<string, Value | undefined>, "owner", {
      enumerable: true,
      get() {
        getterRuns += 1;
        return "Ada";
      },
    });
    const hiddenOnly = Object.defineProperty({}, "owner", {
      enumerable: false,
      value: "Ada",
    });
    const objectRow = {
      ...row,
      accessor,
      emptyMetadata: Object.create(null) as Record<string, Value | undefined>,
      hiddenOnly,
      metadata: { owner: "Ada", reviewed: true },
    };
    const resolve = (property: string) => objectRow[property.replace(/^note\./u, "") as keyof typeof objectRow];

    expect(evaluateNotesBaseFormula("note.emptyMetadata.isEmpty()", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("note.metadata.isEmpty()", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.accessor.isEmpty()", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(getterRuns).toBe(0);
    expect(evaluateNotesBaseFormula("note.hiddenOnly.isEmpty()", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("if(note.emptyMetadata.isEmpty(), \"Empty\", \"Set\")", resolve)).toEqual({
      supported: true,
      value: "Empty",
    });
  });

  it("rejects unsafe isEmpty argument and receiver shapes", () => {
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted ownKeys trap");
      },
    });
    const bounded = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversized = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]),
    );
    const values = {
      "note.bounded": bounded,
      "note.instance": new (class Metadata { owner = "Ada"; })(),
      "note.oversized": oversized,
      "note.throwing": throwingKeys,
    } satisfies Record<string, Value | undefined>;

    expect(evaluateNotesBaseFormula("note.bounded.isEmpty()", (property) => values[property])).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("note.status.isEmpty(1)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.isEmpty(,)", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.isEmpty()", (property) => property === "note.done" ? false : "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.instance.isEmpty()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.oversized.isEmpty()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.throwing.isEmpty()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.isEmpty()", () => Number.POSITIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().isEmpty()", () => undefined).supported).toBe(false);
  });

  it("checks frontmatter property presence with the Obsidian file hasProperty helper", () => {
    const properties = {
      empty: "",
      reviewed: false,
      status: "active",
    } satisfies Record<string, Value | undefined>;
    Object.defineProperty(properties, "hidden", { enumerable: false, value: true });
    const values = {
      "file.properties": properties,
      "note.propertyName": "reviewed",
      "note.uppercaseName": "STATUS",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula('file.hasProperty("status")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty("reviewed")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty("empty")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty("missing")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty("hidden")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty(note.propertyName)', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file.hasProperty(lower(note.uppercaseName))", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasProperty("")', resolve)).toEqual({
      supported: true,
      value: false,
    });
  });

  it("projects frontmatter properties from loaded files", () => {
    const filePropertiesFor = vi.fn((path: string) => (
      path === "Archive/Plan.md" ? { reviewed: false, status: "active" } : null
    ));
    const values = {
      "note.path": String.raw`Archive\Plan.md`,
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").properties.keys().join(" / ")',
      resolve,
      { filePropertiesFor },
    )).toEqual({ supported: true, value: "reviewed / status" });
    expect(evaluateNotesBaseFormula(
      "file(note.path).properties.values().join(\" / \")",
      resolve,
      { filePropertiesFor },
    )).toEqual({ supported: true, value: "false / active" });
    expect(filePropertiesFor).toHaveBeenCalledWith("Archive/Plan.md");
  });

  it("projects ordered internal links from loaded files", () => {
    const links = ["Plan.md", String.raw`Projects\Roadmap.md`, "missing.md", "Plan.md"];
    const fileLinksFor = vi.fn((path: string) => path === "Archive/Source.md" ? links : null);
    const values = {
      "note.source": String.raw`Archive\Source.md`,
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      'file("Archive/Source.md").links',
      resolve,
      { fileLinksFor },
    )).toEqual({
      supported: true,
      value: ["Plan.md", "Projects/Roadmap.md", "missing.md", "Plan.md"],
    });
    const projected = evaluateNotesBaseFormula(
      "file(note.source).links",
      resolve,
      { fileLinksFor },
    );
    expect(projected).toEqual({
      supported: true,
      value: ["Plan.md", "Projects/Roadmap.md", "missing.md", "Plan.md"],
    });
    expect(projected.supported && projected.value).not.toBe(links);
    expect(evaluateNotesBaseFormula(
      'file("Archive/Source.md").links.join(" | ")',
      resolve,
      { fileLinksFor },
    )).toEqual({
      supported: true,
      value: "Plan.md | Projects/Roadmap.md | missing.md | Plan.md",
    });
    expect(fileLinksFor).toHaveBeenCalledWith("Archive/Source.md");
  });

  it("projects loaded-file backlinks as a composable ordered list", () => {
    const backlinks = ["Sources/First.md", String.raw`Sources\Second.md`];
    const fileBacklinksFor = vi.fn((path: string) => path === "Projects/Target.md" ? backlinks : null);
    const context = { fileBacklinksFor };

    const projected = evaluateNotesBaseFormula(
      'file("Projects/Target.md").backlinks',
      () => undefined,
      context,
    );
    expect(projected).toEqual({
      supported: true,
      value: ["Sources/First.md", "Sources/Second.md"],
    });
    expect(projected.supported && projected.value).not.toBe(backlinks);
    expect(evaluateNotesBaseFormula(
      'file("Projects/Target.md").backlinks.join(" | ")',
      () => undefined,
      context,
    )).toEqual({ supported: true, value: "Sources/First.md | Sources/Second.md" });
    expect(fileBacklinksFor).toHaveBeenCalledWith("Projects/Target.md");
  });

  it("rejects unsafe projected loaded-file backlinks", () => {
    const fileBacklinksFor = vi.fn(() => ["Source.md"]);
    let accessorReads = 0;
    const accessorBacklinks = ["Source.md"];
    Object.defineProperty(accessorBacklinks, "0", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return "Source.md";
      },
    });
    const invalidLengthBacklinks = new Proxy(["Source.md"], {
      get(target, property, receiver) {
        return property === "length" ? -1 : readFixtureProperty(target, property);
      },
    });
    for (const [expression, context] of [
      ['file("Target.md").backlinks', undefined],
      ['file("Missing.md").backlinks', { fileBacklinksFor: () => null }],
      ['file("../Target.md").backlinks', { fileBacklinksFor }],
      ['file("Target.md",).backlinks', { fileBacklinksFor }],
      ['file("Target.md").backlinks', { fileBacklinksFor: () => { throw new Error("untrusted lookup"); } }],
      ['file("Target.md").backlinks', { fileBacklinksFor: () => accessorBacklinks }],
      ['file("Target.md").backlinks', { fileBacklinksFor: () => invalidLengthBacklinks }],
      ['file("Target.md").backlinks', { fileBacklinksFor: () => ["../Source.md"] }],
      ['file("Target.md").toString().backlinks', { fileBacklinksFor }],
      ['file("Target.md").backlinks.length.value', { fileBacklinksFor }],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
    expect(fileBacklinksFor).not.toHaveBeenCalled();
    expect(accessorReads).toBe(0);
  });

  it("projects loaded-file embeds as a composable ordered list", () => {
    const embeds = ["Roadmap.md", "Assets/diagram.svg", "Assets/image.png", "Assets/image.png"];
    const fileEmbedsFor = vi.fn((path: string) => path === "Projects/Source.md" ? embeds : null);
    const context = { fileEmbedsFor };

    const projected = evaluateNotesBaseFormula(
      'file("Projects/Source.md").embeds',
      () => undefined,
      context,
    );
    expect(projected).toEqual({
      supported: true,
      value: ["Roadmap.md", "Assets/diagram.svg", "Assets/image.png", "Assets/image.png"],
    });
    expect(projected.supported && projected.value).not.toBe(embeds);
    expect(evaluateNotesBaseFormula(
      'file("Projects/Source.md").embeds.join(" | ")',
      () => undefined,
      context,
    )).toEqual({
      supported: true,
      value: "Roadmap.md | Assets/diagram.svg | Assets/image.png | Assets/image.png",
    });
    expect(fileEmbedsFor).toHaveBeenCalledWith("Projects/Source.md");
  });

  it("rejects unsafe projected loaded-file embed fields", () => {
    const fileEmbedsFor = vi.fn(() => ["Assets/image.png"]);
    for (const [expression, context] of [
      ['file("Source.md").embeds', undefined],
      ['file("Missing.md").embeds', { fileEmbedsFor: () => null }],
      ['file("../Source.md").embeds', { fileEmbedsFor }],
      ['file("Source.md",).embeds', { fileEmbedsFor }],
      ['file("Source.md").embeds', { fileEmbedsFor: () => { throw new Error("untrusted lookup"); } }],
      ['file("Source.md").embeds', { fileEmbedsFor: () => ["Projects/../Asset.png"] }],
      ['file("Source.md").toString().embeds', { fileEmbedsFor }],
      ['file("Source.md").embeds.length.value', { fileEmbedsFor }],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
    expect(fileEmbedsFor).not.toHaveBeenCalled();
  });

  it("rejects unsafe projected file link lists", () => {
    const missingContext = { fileLinksFor: () => null };
    const throwingContext = { fileLinksFor: () => { throw new Error("untrusted lookup"); } };
    const chainedReceiverLookup = vi.fn(() => ["Plan.md"]);
    const throwingList = new Proxy(["Plan.md"], {
      get(target, property, receiver) {
        if (property === "length") throw new Error("untrusted length trap");
        return readFixtureProperty(target, property);
      },
    });
    const excessiveIterator = new Proxy(["Plan.md"], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return function* () {
            for (let index = 0; index <= 10_000; index += 1) yield "Plan.md";
          };
        }
        return readFixtureProperty(target, property);
      },
    });
    const oversizedLinks = Array.from({ length: 10_001 }, (_, index) => `Note-${index}.md`);
    const excessiveLinkText = Array.from({ length: 26 }, (_, index) => (
      `${String(index).padStart(2, "0")}-${"x".repeat(3_995)}.md`
    ));

    for (const [expression, context] of [
      ['file("Missing.md").links', missingContext],
      ['file("../Source.md").links', missingContext],
      ['file("Source.md",).links', missingContext],
      ['"Source.md".links', missingContext],
      ['file("Source.md").links', undefined],
      ['file("Source.md").links', throwingContext],
      ['file("Source.md").links', { fileLinksFor: () => "Plan.md" }],
      ['file("Source.md").links', { fileLinksFor: () => ["Plan.md", 1] }],
      ['file("Source.md").links', { fileLinksFor: () => ["Projects/../Plan.md"] }],
      ['file("Source.md").links', { fileLinksFor: () => throwingList }],
      ['file("Source.md").links', { fileLinksFor: () => excessiveIterator }],
      ['file("Source.md").links', { fileLinksFor: () => oversizedLinks }],
      ['file("Source.md").links', { fileLinksFor: () => excessiveLinkText }],
    ] as const) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
    expect(evaluateNotesBaseFormula(
      'file("Source.md").toString().links',
      () => undefined,
      { fileLinksFor: chainedReceiverLookup },
    ).supported).toBe(false);
    expect(chainedReceiverLookup).not.toHaveBeenCalled();
  });

  it("rejects chained projected File field receivers before lookup", () => {
    const fileCreatedAtFor = vi.fn(() => 0);
    const fileLinksFor = vi.fn(() => ["Plan.md"]);
    const fileModifiedAtFor = vi.fn(() => 0);
    const filePropertiesFor = vi.fn(() => ({ status: "active" }));
    const fileSizeFor = vi.fn(() => 1);
    const context = {
      fileCreatedAtFor,
      fileLinksFor,
      fileModifiedAtFor,
      filePropertiesFor,
      fileSizeFor,
    };

    for (const field of [
      "path",
      "name",
      "basename",
      "folder",
      "ext",
      "size",
      "ctime",
      "mtime",
      "properties",
      "links",
    ]) {
      const expression = `file("Plan.md").toString().${field}`;
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
    expect(fileCreatedAtFor).not.toHaveBeenCalled();
    expect(fileLinksFor).not.toHaveBeenCalled();
    expect(fileModifiedAtFor).not.toHaveBeenCalled();
    expect(filePropertiesFor).not.toHaveBeenCalled();
    expect(fileSizeFor).not.toHaveBeenCalled();
  });

  it("rejects unsafe projected file property values", () => {
    const context = { filePropertiesFor: () => null };
    const throwingContext = { filePropertiesFor: () => { throw new Error("untrusted lookup"); } };
    const chainedReceiverLookup = vi.fn(() => ({ status: "active" }));
    let prototypeReads = 0;
    const statefulProperties = new Proxy({ status: "active" }, {
      getPrototypeOf: () => {
        prototypeReads += 1;
        if (prototypeReads > 1) throw new Error("stateful prototype trap");
        return Object.prototype;
      },
    });

    expect(evaluateNotesBaseFormula('file("Missing.md").properties', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Plan.md").properties', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md",).properties', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").toString().properties', () => undefined, { filePropertiesFor: chainedReceiverLookup }).supported).toBe(false);
    expect(chainedReceiverLookup).not.toHaveBeenCalled();
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").properties.toString()',
      () => undefined,
      { filePropertiesFor: () => statefulProperties },
    ).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").properties', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").properties', () => undefined, throwingContext).supported).toBe(false);
  });

  it("checks frontmatter property presence on projected loaded files", () => {
    const filePropertiesHas = vi.fn((path: string, name: string) => {
      if (path !== "Archive/Plan.md") return null;
      return name === "status" || name === "reviewed";
    });
    const values = {
      "note.path": String.raw`Archive\Plan.md`,
      "note.propertyName": "reviewed",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").hasProperty("status")',
      resolve,
      { filePropertiesHas },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      "file(note.path).hasProperty(note.propertyName)",
      resolve,
      { filePropertiesHas },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").hasProperty("missing")',
      resolve,
      { filePropertiesHas },
    )).toEqual({ supported: true, value: false });
    expect(filePropertiesHas).toHaveBeenCalledWith("Archive/Plan.md", "status");
  });

  it("rejects unsafe projected file property checks", () => {
    const context = { filePropertiesHas: () => null };
    const throwingContext = { filePropertiesHas: () => { throw new Error("untrusted lookup"); } };

    expect(evaluateNotesBaseFormula('file("Missing.md").hasProperty("status")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Plan.md").hasProperty("status")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasProperty("status",)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasProperty(false)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('"Plan.md".hasProperty("status")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasProperty("status")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasProperty("status")', () => undefined, throwingContext).supported).toBe(false);
  });

  it("checks bounded internal-link paths with the Obsidian file hasLink helper", () => {
    const values = {
      "file.links": ["Plan.md", "Projects/Roadmap.md", "missing.md"],
      "note.linkPath": String.raw`Projects\Roadmap.md`,
      "note.uppercaseLinkPath": "PLAN.MD",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file.hasLink(note.linkPath)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file.hasLink(lower(note.uppercaseLinkPath))", resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file.hasLink("Archive.md")', resolve)).toEqual({
      supported: true,
      value: false,
    });
  });

  it("checks links from projected loaded files", () => {
    const fileLinksContain = vi.fn((sourcePath: string, targetPath: string) => (
      sourcePath === "Archive/Source.md" ? targetPath === "Plan.md" : null
    ));
    const values = {
      "note.source": String.raw`Archive\Source.md`,
      "note.target": "Plan.md",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      'file("Archive/Source.md").hasLink("Plan.md")',
      resolve,
      { fileLinksContain },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      "file(note.source).hasLink(note.target)",
      resolve,
      { fileLinksContain },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'file("Archive/Source.md").hasLink("Missing.md")',
      resolve,
      { fileLinksContain },
    )).toEqual({ supported: true, value: false });
    expect(fileLinksContain).toHaveBeenCalledWith("Archive/Source.md", "Plan.md");
  });

  it("rejects unsafe projected file link checks", () => {
    const context = { fileLinksContain: () => null };
    const throwingContext = { fileLinksContain: () => { throw new Error("untrusted lookup"); } };
    const chainedReceiverLookup = vi.fn(() => true);

    expect(evaluateNotesBaseFormula('file("Missing.md").hasLink("Plan.md")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Source.md").hasLink("Plan.md")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Source.md").hasLink("../Plan.md")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Source.md").hasLink("Plan.md",)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Source.md").hasLink(false)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('"Source.md".hasLink("Plan.md")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'file("Source.md").toString().hasLink("Plan.md")',
      () => undefined,
      { fileLinksContain: chainedReceiverLookup },
    ).supported).toBe(false);
    expect(chainedReceiverLookup).not.toHaveBeenCalled();
    expect(evaluateNotesBaseFormula('file("Source.md").hasLink("Plan.md")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Source.md").hasLink("Plan.md")', () => undefined, throwingContext).supported).toBe(false);
  });

  it("rejects unsafe file hasLink arguments and link-list shapes", () => {
    const oversizedLinks = Array.from({ length: 10_001 }, (_, index) => `Note-${index}.md`);
    const excessiveLinkText = Array.from({ length: 26 }, (_, index) => (
      `${String(index).padStart(2, "0")}-${"x".repeat(3_995)}.md`
    ));
    const values = {
      "file.links": ["Plan.md"],
      "note.absolutePath": "/Plan.md",
      "note.booleanPath": false,
      "note.drivePath": String.raw`C:\Plan.md`,
      "note.dotPath": "Projects/./Plan.md",
      "note.emptyPath": "",
      "note.nulPath": "Projects/\0Plan.md",
      "note.parentPath": "../Plan.md",
      "note.oversizedPath": "x".repeat(4_097),
      "note.urlPath": "https://example.com/Plan.md",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("file.hasLink()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md",)', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md", "Other.md")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.booleanPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.absolutePath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.drivePath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.dotPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.emptyPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.nulPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.parentPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.oversizedPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasLink(note.urlPath)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('note.file.hasLink("Plan.md")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('process.exit().hasLink("Plan.md")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? "Plan.md" : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? ["Plan.md", 1] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? ["Projects/../Plan.md"] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? [String.raw`C:\Plan.md`] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? ["https://example.com/Plan.md"] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? oversizedLinks : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasLink("Plan.md")', (property) => (
      property === "file.links" ? excessiveLinkText : undefined
    )).supported).toBe(false);
  });

  it("rejects unsafe file hasProperty argument and property-object shapes", () => {
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted ownKeys trap");
      },
    });
    const oversized = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]),
    );
    const values = {
      "file.properties": { status: "active" },
      "note.booleanName": false,
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("file.hasProperty()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status",)', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status", "owner")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasProperty(note.booleanName)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('note.file.hasProperty("status")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('process.exit().hasProperty("status")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status")', (property) => (
      property === "file.properties"
        ? Object.assign(Object.create({ inherited: true }) as Record<string, Value | undefined>, { status: "active" })
        : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status")', (property) => (
      property === "file.properties" ? new (class Metadata { status = "active"; })() : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status")', (property) => (
      property === "file.properties" ? throwingKeys : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasProperty("status")', (property) => (
      property === "file.properties" ? oversized : undefined
    )).supported).toBe(false);
  });

  it("checks exact, nested, and variadic tags with the Obsidian file hasTag helper", () => {
    const tags = ["project/active", "Review", "inline"];
    const resolve = (property: string) => {
      if (property === "file.tags") return tags;
      if (property === "note.query") return "review";
      return undefined;
    };

    expect(evaluateNotesBaseFormula('file.hasTag("project")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasTag("#PROJECT")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasTag("missing", note.query)', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasTag("project/active")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.hasTag("missing")', resolve)).toEqual({
      supported: true,
      value: false,
    });
  });

  it("checks tags on projected loaded files", () => {
    const fileTagsFor = vi.fn((path: string) => (
      path === "Archive/Plan.md" ? ["project/active", "Review"] : null
    ));
    const values = {
      "note.path": String.raw`Archive\Plan.md`,
      "note.query": "review",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").hasTag("project")',
      resolve,
      { fileTagsFor },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      "file(note.path).hasTag(\"missing\", note.query)",
      resolve,
      { fileTagsFor },
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").hasTag("missing")',
      resolve,
      { fileTagsFor },
    )).toEqual({ supported: true, value: false });
    expect(fileTagsFor).toHaveBeenCalledWith("Archive/Plan.md");
  });

  it("projects loaded-file tags as a composable bounded list", () => {
    const sourceTags = ["project/active", "Review", "inline"];
    const fileTagsFor = vi.fn((path: string) => (
      path === "Archive/Plan.md" ? sourceTags : null
    ));

    const projected = evaluateNotesBaseFormula(
      'file("Archive/Plan.md").tags',
      () => undefined,
      { fileTagsFor },
    );
    expect(projected).toEqual({ supported: true, value: ["project/active", "Review", "inline"] });
    expect(projected.supported && projected.value).not.toBe(sourceTags);
    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").tags.join(" / ")',
      () => undefined,
      { fileTagsFor },
    )).toEqual({ supported: true, value: "project/active / Review / inline" });
    expect(evaluateNotesBaseFormula(
      'file("Archive/Plan.md").tags.contains("Review")',
      () => undefined,
      { fileTagsFor },
    )).toEqual({ supported: true, value: true });
    expect(fileTagsFor).toHaveBeenCalledWith("Archive/Plan.md");
  });

  it("rejects unsafe projected loaded-file tag fields", () => {
    const accessorTags = ["project"];
    Object.defineProperty(accessorTags, "0", { enumerable: true, get: () => "project" });
    const revokedTags = Proxy.revocable([], {});
    revokedTags.revoke();

    for (const context of [
      undefined,
      { fileTagsFor: () => null },
      { fileTagsFor: () => { throw new Error("untrusted lookup"); } },
      { fileTagsFor: () => revokedTags.proxy },
      { fileTagsFor: () => new Array(1) },
      { fileTagsFor: () => accessorTags },
      { fileTagsFor: () => ["project", 1] },
      { fileTagsFor: () => Array.from({ length: 10_001 }, (_, index) => `tag-${index}`) },
      { fileTagsFor: () => ["x".repeat(100_001)] },
    ]) {
      expect(evaluateNotesBaseFormula(
        'file("Plan.md").tags',
        () => undefined,
        context,
      ).supported).toBe(false);
    }

    const context = { fileTagsFor: (path: string) => path === "Plan.md" ? ["project"] : null };
    for (const expression of [
      'file("Missing.md").tags',
      'file("../Plan.md").tags',
      'file("Plan.md",).tags',
      '"Plan.md".tags',
      'file("Plan.md").toString().tags',
      'file("Plan.md").tags.path',
    ]) {
      expect(evaluateNotesBaseFormula(expression, () => undefined, context).supported, expression).toBe(false);
    }
  });

  it("rejects unsafe projected file tag checks", () => {
    const context = { fileTagsFor: () => null };
    const throwingContext = { fileTagsFor: () => { throw new Error("untrusted lookup"); } };
    const revokedTags = Proxy.revocable([], {});
    revokedTags.revoke();
    const hostileContext = { fileTagsFor: () => revokedTags.proxy };
    let lengthReads = 0;
    const statefulTags = new Proxy(["project"], {
      get(target, property, receiver) {
        if (property === "length" && ++lengthReads > 3) throw new Error("post-validation trap");
        return readFixtureProperty(target, property);
      },
    });
    const statefulContext = { fileTagsFor: () => statefulTags };
    const iteratorTags: string[] = [];
    iteratorTags[Symbol.iterator] = function* hostileIterator() {
      throw new Error("tag iterator must not run");
    };
    const iteratorContext = { fileTagsFor: () => iteratorTags };
    const coercibleLengthTags = new Proxy(["project"], {
      get(target, property, receiver) {
        if (property === "length") return { valueOf: () => 1 };
        return readFixtureProperty(target, property);
      },
    });
    const coercibleLengthContext = { fileTagsFor: () => coercibleLengthTags };

    expect(evaluateNotesBaseFormula('file("Missing.md").hasTag("project")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Plan.md").hasTag("project")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasTag("project",)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasTag(false)', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('"Plan.md".hasTag("project")', () => undefined, context).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasTag("project")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasTag("project")', () => undefined, throwingContext).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Plan.md").hasTag("project")', () => undefined, hostileContext).supported).toBe(false);
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").hasTag("project")',
      () => undefined,
      statefulContext,
    )).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").hasTag("project")',
      () => undefined,
      iteratorContext,
    )).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula(
      'file("Plan.md").hasTag("project")',
      () => undefined,
      coercibleLengthContext,
    ).supported).toBe(false);
  });

  it("rejects unsafe file hasTag argument and tag-list shapes", () => {
    const oversizedTags = Array.from({ length: 10_001 }, (_, index) => `tag-${index}`);
    const excessiveComparisons = Array.from({ length: 1_001 }, (_, index) => `tag-${index}`);
    const excessiveQueries = Array.from({ length: 100 }, (_, index) => `"query-${index}"`).join(", ");
    const resolve = (property: string) => {
      if (property === "file.tags") return ["project", "review"];
      if (property === "note.tags") return ["project"];
      if (property === "note.boolean") return true;
      if (property === "note.oversizedQuery") return "x".repeat(100_001);
      return undefined;
    };

    expect(evaluateNotesBaseFormula("file.hasTag()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project",)', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasTag(note.tags)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasTag(note.boolean)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasTag(note.oversizedQuery)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('note.file.hasTag("project")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.hasTag(process.exit())", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project")', (property) => (
      property === "file.tags" ? "project" : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project")', (property) => (
      property === "file.tags" ? ["project", 1] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project")', (property) => (
      property === "file.tags" ? oversizedTags : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.hasTag("project")', (property) => (
      property === "file.tags" ? ["x".repeat(100_001)] : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula(`file.hasTag(${excessiveQueries})`, (property) => (
      property === "file.tags" ? excessiveComparisons : undefined
    )).supported).toBe(false);
  });

  it("checks exact and descendant folders with the Obsidian file inFolder helper", () => {
    const values = {
      "file.path": "Projects/Active/Plan.md",
      "note.folder": "Projects",
      "note.windowsFolder": String.raw`Projects\Active`,
      "note.rootFolder": "/",
      "note.projectedPath": "Projects/Active/Plan.md",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.inFolder("Projects/Active")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.inFolder("Projects/Archive")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file.inFolder("Project")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file.inFolder("Projects-Archive")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula("file.inFolder(note.folder)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file.inFolder(note.windowsFolder)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file.inFolder(note.rootFolder)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file.inFolder("")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file("Projects/Active/Plan.md").inFolder("Projects")', resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula("file(note.projectedPath).inFolder(note.folder)", resolve)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('file("Projects\\\\Active\\\\Plan.md").inFolder("Projects/Archive")', resolve)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('file("Plan.md").inFolder("")', resolve)).toEqual({
      supported: true,
      value: true,
    });
  });

  it("rejects unsafe file inFolder arguments and file paths", () => {
    const values = {
      "file.path": "Projects/Active/Plan.md",
      "note.booleanFolder": false,
      "note.parentFolder": "../Projects",
      "note.dotFolder": "Projects/./Active",
      "note.nulFolder": "Projects/\0Active",
      "note.oversizedFolder": "P".repeat(4_097),
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    expect(evaluateNotesBaseFormula("file.inFolder()", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects",)', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects", "Active")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.inFolder(note.booleanFolder)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.inFolder(note.parentFolder)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.inFolder(note.dotFolder)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.inFolder(note.nulFolder)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula("file.inFolder(note.oversizedFolder)", resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('note.file.inFolder("Projects")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('"Projects/Plan.md".inFolder("Projects")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("../Plan.md").inFolder("Projects")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Projects/Plan.md",).inFolder("Projects")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('process.exit().inFolder("Projects")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', (property) => (
      property === "file.path" ? false : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', (property) => (
      property === "file.path" ? "/Projects/Active/Plan.md" : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', (property) => (
      property === "file.path" ? "Projects/../Secrets.md" : undefined
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file.inFolder("Projects")', (property) => (
      property === "file.path" ? `${"P".repeat(4_097)}/Plan.md` : undefined
    )).supported).toBe(false);
  });

  it("returns absolute values with the Obsidian number abs helper", () => {
    const numericRow = { ...row, debt: -7.5, zero: -0 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("(-5).abs()", resolve)).toEqual({ supported: true, value: 5 });
    expect(evaluateNotesBaseFormula("(3.25).abs()", resolve)).toEqual({ supported: true, value: 3.25 });
    expect(evaluateNotesBaseFormula("note.debt.abs()", resolve)).toEqual({ supported: true, value: 7.5 });
    expect(evaluateNotesBaseFormula("note.zero.abs()", resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseFormula("number(\"-2.5\").abs()", resolve)).toEqual({ supported: true, value: 2.5 });
    expect(evaluateNotesBaseFormula("concat(note.debt.abs(), \" points\")", resolve)).toEqual({
      supported: true,
      value: "7.5 points",
    });
  });

  it("rejects unsafe number abs argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.points.abs(1)", () => -3).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.abs(,)", () => -3).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.abs()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.abs()", () => false).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.abs()", () => ["daily"]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.abs()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.abs()", () => Number.POSITIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("(process.exit()).abs()", () => undefined).supported).toBe(false);
  });

  it("rounds finite numbers upward with the Obsidian number ceil helper", () => {
    const numericRow = { ...row, estimate: 2.1, debt: -2.9, zero: -0 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("(2.1).ceil()", resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseFormula("(-2.9).ceil()", resolve)).toEqual({ supported: true, value: -2 });
    expect(evaluateNotesBaseFormula("note.estimate.ceil()", resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseFormula("note.debt.ceil()", resolve)).toEqual({ supported: true, value: -2 });
    expect(evaluateNotesBaseFormula("number(\"3.01\").ceil()", resolve)).toEqual({ supported: true, value: 4 });
    expect(evaluateNotesBaseFormula("concat(note.estimate.ceil(), \" points\")", resolve)).toEqual({
      supported: true,
      value: "3 points",
    });

    const negativeZero = evaluateNotesBaseFormula("(-0.2).ceil()", resolve);
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
    const existingNegativeZero = evaluateNotesBaseFormula("note.zero.ceil()", resolve);
    expect(existingNegativeZero.supported && Object.is(existingNegativeZero.value, -0)).toBe(true);
  });

  it("rejects unsafe number ceil argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.points.ceil(1)", () => 2.1).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.ceil(,)", () => 2.1).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.ceil()", () => "2.1").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.ceil()", () => false).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.ceil()", () => [2.1]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.ceil()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.ceil()", () => Number.NEGATIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("(process.exit()).ceil()", () => undefined).supported).toBe(false);
  });

  it("rounds finite numbers downward with the Obsidian number floor helper", () => {
    const numericRow = { ...row, estimate: 2.9, debt: -2.1, zero: -0 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("(2.9).floor()", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("(-2.1).floor()", resolve)).toEqual({ supported: true, value: -3 });
    expect(evaluateNotesBaseFormula("note.estimate.floor()", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("note.debt.floor()", resolve)).toEqual({ supported: true, value: -3 });
    expect(evaluateNotesBaseFormula("number(\"3.99\").floor()", resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseFormula("(4).floor()", resolve)).toEqual({ supported: true, value: 4 });
    expect(evaluateNotesBaseFormula("(0).floor()", resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseFormula("concat(note.estimate.floor(), \" points\")", resolve)).toEqual({
      supported: true,
      value: "2 points",
    });

    const existingNegativeZero = evaluateNotesBaseFormula("note.zero.floor()", resolve);
    expect(existingNegativeZero.supported && Object.is(existingNegativeZero.value, -0)).toBe(true);
  });

  it("rejects unsafe number floor argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.points.floor(1)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.floor(,)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.floor()", () => "2.9").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.floor()", () => false).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.floor()", () => [2.9]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.floor()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.floor()", () => Number.POSITIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("(process.exit()).floor()", () => undefined).supported).toBe(false);
  });

  it("rounds finite numbers with the Obsidian number round helper", () => {
    const numericRow = { ...row, estimate: 2.5, debt: -2.5, precise: 2.3333, digits: 2, zero: -0.1 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("(2.5).round()", resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseFormula("(-2.5).round()", resolve)).toEqual({ supported: true, value: -2 });
    expect(evaluateNotesBaseFormula("note.estimate.round()", resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseFormula("note.debt.round()", resolve)).toEqual({ supported: true, value: -2 });
    expect(evaluateNotesBaseFormula("note.precise.round(2)", resolve)).toEqual({ supported: true, value: 2.33 });
    expect(evaluateNotesBaseFormula("note.precise.round(note.digits)", resolve)).toEqual({
      supported: true,
      value: 2.33,
    });
    expect(evaluateNotesBaseFormula("number(\"2.3333\").round(2)", resolve)).toEqual({
      supported: true,
      value: 2.33,
    });
    expect(evaluateNotesBaseFormula("note.precise.round(0)", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("note.precise.round(-2)", resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseFormula("(12.345).round(1.5)", resolve)).toEqual({
      supported: true,
      value: 12.33288287465668,
    });
    expect(evaluateNotesBaseFormula("concat(note.precise.round(2), \" points\")", resolve)).toEqual({
      supported: true,
      value: "2.33 points",
    });

    const negativeZero = evaluateNotesBaseFormula("note.zero.round()", resolve);
    expect(negativeZero.supported && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("rejects unsafe number round argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.points.round(1, 2)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round(2,)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.round()", () => "2.9").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.round()", () => false).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.round()", () => [2.9]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.round()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round()", () => Number.POSITIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round(\"2\")", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round(note.digits)", (property) => (
      property === "note.points" ? 2.9 : Number.POSITIVE_INFINITY
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round(400)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.round(1)", () => Number.MAX_VALUE).supported).toBe(false);
    expect(evaluateNotesBaseFormula("(process.exit()).round()", () => undefined).supported).toBe(false);
  });

  it("formats finite numbers with the Obsidian number toFixed helper", () => {
    const numericRow = { ...row, precise: 3.14159, precision: 2, fractionalPrecision: 2.9 };
    const resolve = (property: string) => numericRow[property.replace(/^note\./u, "") as keyof typeof numericRow];

    expect(evaluateNotesBaseFormula("(3.14159).toFixed(2)", resolve)).toEqual({
      supported: true,
      value: "3.14",
    });
    expect(evaluateNotesBaseFormula("note.precise.toFixed(note.precision)", resolve)).toEqual({
      supported: true,
      value: "3.14",
    });
    expect(evaluateNotesBaseFormula("number(\"3.1\").toFixed(2)", resolve)).toEqual({
      supported: true,
      value: "3.10",
    });
    expect(evaluateNotesBaseFormula("note.precise.toFixed(note.fractionalPrecision)", resolve)).toEqual({
      supported: true,
      value: "3.14",
    });
    expect(evaluateNotesBaseFormula("(-0.1).toFixed(-0.5)", resolve)).toEqual({
      supported: true,
      value: "-0",
    });
    expect(evaluateNotesBaseFormula("(1).toFixed(100)", resolve)).toEqual({
      supported: true,
      value: `1.${"0".repeat(100)}`,
    });
    expect(evaluateNotesBaseFormula("concat(note.precise.toFixed(2), \" points\")", resolve)).toEqual({
      supported: true,
      value: "3.14 points",
    });
  });

  it("rejects unsafe number toFixed argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.points.toFixed()", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(2,)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(1, 2)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.toFixed(2)", () => "2.9").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.done.toFixed(2)", () => false).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.tags.toFixed(2)", () => [2.9]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.toFixed(2)", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(2)", () => Number.POSITIVE_INFINITY).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(\"2\")", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(note.precision)", (property) => (
      property === "note.points" ? 2.9 : Number.POSITIVE_INFINITY
    )).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(-1)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.points.toFixed(101)", () => 2.9).supported).toBe(false);
    expect(evaluateNotesBaseFormula("(process.exit()).toFixed(2)", () => undefined).supported).toBe(false);
  });

  it("coerces supported receivers with the Obsidian isTruthy helper", () => {
    const resolve = (property: string) => row[property.replace(/^note\./u, "") as keyof typeof row];

    expect(evaluateNotesBaseFormula("\"text\".isTruthy()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("\"\".isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("1.isTruthy()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("0.isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("true.isTruthy()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("false.isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.isTruthy()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.isTruthy( )", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.done.isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.missing.isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("null.isTruthy()", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("list(note.tags).isTruthy()", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("if(note.status.isTruthy(), \"Open\", \"Closed\")", resolve)).toEqual({ supported: true, value: "Open" });
  });

  it("classifies supported receivers with the Obsidian isType helper", () => {
    const typedRow = { ...row, metadata: { owner: "Ada" } };
    const resolve = (property: string) => typedRow[property.replace(/^note\./u, "") as keyof typeof typedRow];

    expect(evaluateNotesBaseFormula("\"example\".isType(\"string\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("3.isType(\"NUMBER\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.done.isType('boolean')", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("list(note.tags).isType(\"list\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.metadata.isType(\"object\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("null.isType(\"null\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.missing.isType(\"null\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("note.status.isType(\"any\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula("null.isType(\"any\")", resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('link("Projects/Plan.md").isType("link")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('link("Projects/Plan.md").isType("any")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('link("Projects/Plan.md").isType("object")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('"Projects/Plan.md".isType("link")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('note.metadata.isType("link")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.isType(\"number\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("note.status.isType(\"date\")", resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula("if(note.status.isType(\"string\"), \"Text\", \"Other\")", resolve)).toEqual({ supported: true, value: "Text" });
  });

  it("classifies bounded regular expression literals with the Obsidian isType helper", () => {
    const resolve = (property: string) => property === "note.pattern" ? "/abc/" : undefined;

    expect(evaluateNotesBaseFormula('/abc/.isType("regexp")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/^abc$/i.isType("REGEXP")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/\\(/.isType("regexp")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/"/.isType("regexp")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/(abc)/.isType("regexp")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/[a-c]/u.isType("any")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('/abc/.isType("object")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('note.pattern.isType("regexp")', resolve)).toEqual({ supported: true, value: false });

    for (const expression of [
      '/a+/.isType("regexp")',
      '/[abc/.isType("regexp")',
      'process.exit().isType("regexp")',
      `/${"a".repeat(1_001)}/.isType("regexp")`,
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }

    let prototypeReads = 0;
    const hostilePatternLike = new Proxy({}, {
      getPrototypeOf() {
        prototypeReads += 1;
        throw new Error("RegExp classification must not inspect object prototypes");
      },
    });
    expect(evaluateNotesBaseFormula('note.pattern.isType("regexp")', () => hostilePatternLike)).toEqual({
      supported: true,
      value: false,
    });
    expect(prototypeReads).toBe(0);
  });

  it("classifies exact File-producing operands with the Obsidian isType helper", () => {
    const values = {
      "file.file": "Projects/Plan.md",
      "note.path": "Projects/Plan.md",
      "note.unsafePath": "../Outside.md",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    for (const expression of [
      'file("Projects/Plan.md").isType("file")',
      'file(file.file).isType("FILE")',
      'file.file.isType("file")',
      'link("Projects/Plan.md").asFile().isType("file")',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve), expression).toEqual({ supported: true, value: true });
    }
    expect(evaluateNotesBaseFormula('file("Projects/Plan.md").isType("any")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('file("Projects/Plan.md").isType("string")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('file("Projects/Plan.md").isType("object")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('note.path.isType("file")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('"Projects/Plan.md".isType("file")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('file(note.unsafePath).isType("file")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('file("Projects/Plan.md",).isType("file")', resolve).supported).toBe(false);
    expect(evaluateNotesBaseFormula('note.path.asFile().isType("file")', resolve).supported).toBe(false);
  });

  it("rejects hostile Link type lookalikes without invoking object traps", () => {
    let prototypeReads = 0;
    const hostileLinkLike = new Proxy({}, {
      getPrototypeOf() {
        prototypeReads += 1;
        throw new Error("Link classification must not inspect object prototypes");
      },
    });

    expect(evaluateNotesBaseFormula('note.value.isType("link")', () => hostileLinkLike)).toEqual({
      supported: true,
      value: false,
    });
    expect(prototypeReads).toBe(0);
  });

  it("classifies evaluator-owned image values without trusting object lookalikes", () => {
    expect(evaluateNotesBaseFormula('image("https://example.test/cover.png").isType("image")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('image("Attachments/cover.webp").isType("IMAGE")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('image("Attachments/cover.webp").isType("any")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('image("Attachments/cover.webp").isType("object")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('"Attachments/cover.webp".isType("image")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('note.value.isType("image")', () => ({ path: "Attachments/cover.webp" }))).toEqual({
      supported: true,
      value: false,
    });

    let prototypeReads = 0;
    const hostileImageLike = new Proxy({}, {
      getPrototypeOf() {
        prototypeReads += 1;
        throw new Error("Image classification must not inspect object prototypes");
      },
    });
    expect(evaluateNotesBaseFormula('note.value.isType("image")', () => hostileImageLike)).toEqual({
      supported: true,
      value: false,
    });
    expect(prototypeReads).toBe(0);
  });

  it("classifies evaluator-owned icon values without trusting object lookalikes", () => {
    expect(evaluateNotesBaseFormula('icon("star").isType("icon")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('icon("check").isType("ICON")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('icon("circle").isType("any")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('icon("x").isType("object")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('"star".isType("icon")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('note.value.isType("icon")', () => ({ name: "star" }))).toEqual({
      supported: true,
      value: false,
    });

    let prototypeReads = 0;
    const hostileIconLike = new Proxy({}, {
      getPrototypeOf() {
        prototypeReads += 1;
        throw new Error("Icon classification must not inspect object prototypes");
      },
    });
    expect(evaluateNotesBaseFormula('note.value.isType("icon")', () => hostileIconLike)).toEqual({
      supported: true,
      value: false,
    });
    expect(prototypeReads).toBe(0);
  });

  it("classifies evaluator-owned HTML values without trusting object lookalikes", () => {
    expect(evaluateNotesBaseFormula('html("<strong>Ready</strong>").isType("html")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('html("<em>Ready</em>").isType("HTML")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('html("<u>Ready</u>").isType("any")', () => undefined)).toEqual({
      supported: true,
      value: true,
    });
    expect(evaluateNotesBaseFormula('html("<code>Ready</code>").isType("object")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('"<strong>Ready</strong>".isType("html")', () => undefined)).toEqual({
      supported: true,
      value: false,
    });
    expect(evaluateNotesBaseFormula('note.value.isType("html")', () => ({ text: "Ready" }))).toEqual({
      supported: true,
      value: false,
    });

    let prototypeReads = 0;
    const hostileHtmlLike = new Proxy({}, {
      getPrototypeOf() {
        prototypeReads += 1;
        throw new Error("HTML classification must not inspect object prototypes");
      },
    });
    expect(evaluateNotesBaseFormula('note.value.isType("html")', () => hostileHtmlLike)).toEqual({
      supported: true,
      value: false,
    });
    expect(prototypeReads).toBe(0);
  });

  it("classifies documented date-producing operands as dates", () => {
    const values = {
      "file.mtime": "2025-05-27T12:34:56.000Z",
      "formula.started": "2025-05-27T12:34:56.000Z",
      "note.invalidDate": "2025-02-29",
      "note.started": "2025-05-27",
      started: "2025-05-27",
    } satisfies Record<string, Value | undefined>;
    const resolve = (property: string) => values[property];

    for (const expression of [
      'date("2025-05-27").isType("date")',
      'today().isType("DATE")',
      'now().isType("date")',
      'note.started.isType("date")',
      'started.isType("date")',
      'file.mtime.isType("date")',
      'formula.started.isType("date")',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve), expression).toEqual({ supported: true, value: true });
    }
    expect(evaluateNotesBaseFormula('note.started.isType("string")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('"2025-05-27".isType("date")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('"2025-05-27".isType("string")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('note.invalidDate.isType("date")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('note.invalidDate.isType("string")', resolve)).toEqual({ supported: true, value: true });
  });

  it("classifies documented duration-producing operands as durations", () => {
    const resolve = (property: string) => property === "note.delay" ? 86_400_000 : undefined;

    for (const expression of [
      'duration("1d").isType("duration")',
      '(duration("5h") * 2).isType("DURATION")',
      'duration("2 days").isType("duration")',
      '(duration("1w") / 7).isType("duration")',
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve), expression).toEqual({ supported: true, value: true });
    }
    expect(evaluateNotesBaseFormula('duration("1d").isType("any")', resolve)).toEqual({ supported: true, value: true });
    expect(evaluateNotesBaseFormula('duration("1d").isType("number")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('86400000.isType("duration")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('note.delay.isType("duration")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('(2 * duration("1d")).isType("duration")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('(duration("1ms") / 2).isType("duration")', resolve)).toEqual({ supported: true, value: false });
    expect(evaluateNotesBaseFormula('duration("1d",).isType("duration")', resolve).supported).toBe(false);
  });

  it("stringifies supported receivers with the Obsidian toString helper", () => {
    const stringifiableRow = { ...row, metadata: { owner: "Ada" } };
    const resolve = (property: string) => stringifiableRow[property.replace(/^note\./u, "") as keyof typeof stringifiableRow];

    expect(evaluateNotesBaseFormula("\"example\".toString()", resolve)).toEqual({ supported: true, value: "example" });
    expect(evaluateNotesBaseFormula("3.toString()", resolve)).toEqual({ supported: true, value: "3" });
    expect(evaluateNotesBaseFormula("note.done.toString()", resolve)).toEqual({ supported: true, value: "false" });
    expect(evaluateNotesBaseFormula("note.tags.toString()", resolve)).toEqual({ supported: true, value: "daily,review" });
    expect(evaluateNotesBaseFormula("note.metadata.toString()", resolve)).toEqual({ supported: true, value: "[object Object]" });
    expect(evaluateNotesBaseFormula("null.toString()", resolve)).toEqual({ supported: true, value: "null" });
    expect(evaluateNotesBaseFormula("note.missing.toString()", resolve)).toEqual({ supported: true, value: "null" });
    expect(evaluateNotesBaseFormula("list(note.status).toString()", resolve)).toEqual({ supported: true, value: "active" });
    expect(evaluateNotesBaseFormula("concat(note.status.toString(), \" item\")", resolve)).toEqual({ supported: true, value: "active item" });
  });

  it("stringifies evaluator-owned opaque values through their inert text projections", () => {
    expect(evaluateNotesBaseFormula('icon("check").toString()', () => undefined)).toEqual({
      supported: true,
      value: "check",
    });
    expect(evaluateNotesBaseFormula('image("Attachments/cover.png").toString()', () => undefined)).toEqual({
      supported: true,
      value: "Attachments/cover.png",
    });
    expect(evaluateNotesBaseFormula('image("https://example.com/cover.png").toString()', () => undefined)).toEqual({
      supported: true,
      value: "https://example.com/cover.png",
    });
    expect(evaluateNotesBaseFormula('html("<strong>Ada</strong><br>Ready").toString()', () => undefined)).toEqual({
      supported: true,
      value: "Ada\nReady",
    });
  });

  it("does not let untrusted objects spoof opaque toString projections", () => {
    const lookalike = { name: () => "check", source: () => ({ kind: "local", value: "cover.png" }) };
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("untrusted getPrototypeOf trap");
      },
    });
    const values = {
      "note.hostile": hostile,
      "note.lookalike": lookalike,
    } satisfies Record<string, Value | undefined>;

    expect(evaluateNotesBaseFormula("note.lookalike.toString()", (property) => values[property])).toEqual({
      supported: true,
      value: "[object Object]",
    });
    expect(evaluateNotesBaseFormula("note.hostile.toString()", (property) => values[property])).toEqual({ supported: false });
    expect(evaluateNotesBaseFormula('icon("check").toString(1)', () => undefined).supported).toBe(false);
  });

  it("lists own plain-object keys with the Obsidian object keys helper", () => {
    const metadata = Object.assign(Object.create(null) as Record<string, Value | undefined>, {
      owner: "Ada",
      reviewed: true,
    });
    const resolve = (property: string) => property === "note.metadata" ? metadata : {};

    expect(evaluateNotesBaseFormula("note.metadata.keys()", resolve)).toEqual({
      supported: true,
      value: ["owner", "reviewed"],
    });
    expect(evaluateNotesBaseFormula("note.empty.keys()", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("list(note.metadata.keys()).length", resolve)).toEqual({
      supported: true,
      value: 2,
    });
  });

  it("rejects unsafe or excessive object keys receiver shapes", () => {
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted ownKeys trap");
      },
    });
    const bounded = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversized = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]),
    );
    const values = {
      "note.array": ["owner"],
      "note.bounded": bounded,
      "note.instance": new (class Metadata { owner = "Ada"; })(),
      "note.missing": null,
      "note.number": 1,
      "note.oversized": oversized,
      "note.throwing": throwingKeys,
    } satisfies Record<string, Value | undefined>;

    const boundedResult = evaluateNotesBaseFormula("note.bounded.keys()", (property) => values[property]);
    expect(boundedResult.supported).toBe(true);
    if (!boundedResult.supported) throw new Error("Expected the bounded object keys formula to be supported.");
    expect(boundedResult.value).toHaveLength(10_000);
    expect(evaluateNotesBaseFormula("note.array.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.instance.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.number.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.oversized.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.throwing.keys()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.keys(1)", () => ({})).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().keys()", () => undefined).supported).toBe(false);
  });

  it("lists own plain-object values with the Obsidian object values helper", () => {
    const metadata = Object.assign(Object.create(null) as Record<string, Value | undefined>, {
      2: "second",
      owner: "Ada",
      1: "first",
      reviewed: true,
    });
    Object.defineProperty(metadata, "hidden", {
      enumerable: false,
      value: "private",
    });
    const resolve = (property: string) => property === "note.metadata" ? metadata : {};

    expect(evaluateNotesBaseFormula("note.metadata.values()", resolve)).toEqual({
      supported: true,
      value: ["first", "second", "Ada", true],
    });
    expect(evaluateNotesBaseFormula("note.empty.values()", resolve)).toEqual({
      supported: true,
      value: [],
    });
    expect(evaluateNotesBaseFormula("list(note.metadata.values()).length", resolve)).toEqual({
      supported: true,
      value: 4,
    });
  });

  it("rejects unsafe or excessive object values receiver shapes without invoking accessors", () => {
    let getterRuns = 0;
    const accessor = Object.defineProperty({}, "owner", {
      enumerable: true,
      get() {
        getterRuns += 1;
        return "Ada";
      },
    });
    const throwingValues = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted ownKeys trap");
      },
    });
    const bounded = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversized = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]),
    );
    const values = {
      "note.accessor": accessor,
      "note.array": ["owner"],
      "note.bounded": bounded,
      "note.instance": new (class Metadata { owner = "Ada"; })(),
      "note.missing": null,
      "note.number": 1,
      "note.oversized": oversized,
      "note.throwing": throwingValues,
    } satisfies Record<string, Value | undefined>;

    const boundedResult = evaluateNotesBaseFormula("note.bounded.values()", (property) => values[property]);
    expect(boundedResult.supported).toBe(true);
    if (!boundedResult.supported) throw new Error("Expected the bounded object values formula to be supported.");
    expect(boundedResult.value).toHaveLength(10_000);
    expect(evaluateNotesBaseFormula("note.accessor.values()", (property) => values[property]).supported).toBe(false);
    expect(getterRuns).toBe(0);
    expect(evaluateNotesBaseFormula("note.array.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.instance.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.missing.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.number.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.oversized.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.throwing.values()", (property) => values[property]).supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.metadata.values(1)", () => ({})).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().values()", () => undefined).supported).toBe(false);
  });

  it("rejects unsafe isType argument and receiver shapes", () => {
    expect(evaluateNotesBaseFormula("note.status.isType()", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.isType(note.type)", () => "string").supported).toBe(false);
    expect(evaluateNotesBaseFormula("note.status.isType(\"string\", \"number\")", () => "active").supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().isType(\"string\")", () => undefined).supported).toBe(false);
  });

  it("rejects unsupported member-call formulas", () => {
    expect(evaluateNotesBaseFormula("1.isTruthy(1)", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("1.toString(1)", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().toString()", () => undefined).supported).toBe(false);
    expect(evaluateNotesBaseFormula("process.exit().isTruthy()", () => undefined).supported).toBe(false);
  });

  it("rejects arbitrary code-shaped formulas", () => {
    expect(evaluateNotesBaseFormula("process.exit()", () => "").supported).toBe(false);
    expect(evaluateNotesBaseFormula("constructor.constructor('return process')()", () => "").supported).toBe(false);
  });

  it("evaluates safe summaries over rows", () => {
    const rows = [{ points: 2 }, { points: -4 }, { points: "nope" }];
    const resolve = (rowValue: Record<string, Value | undefined>, property: string) => rowValue[property.replace(/^note\./u, "")];
    const unsafeResolve = vi.fn(resolve);

    expect(evaluateNotesBaseSummary("count()", rows, resolve)).toEqual({ supported: true, value: 3 });
    expect(evaluateNotesBaseSummary("sum(note.points)", rows, resolve)).toEqual({ supported: true, value: -2 });
    expect(evaluateNotesBaseSummary("average(note.points)", rows, resolve)).toEqual({ supported: true, value: -1 });
    expect(evaluateNotesBaseSummary("min(note.points)", rows, resolve)).toEqual({ supported: true, value: -4 });
    expect(evaluateNotesBaseSummary("max(note.points)", rows, resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseSummary("range(note.points)", rows, resolve)).toEqual({ supported: true, value: 6 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: 10 }, { points: 2 }, { points: 4 }], resolve)).toEqual({ supported: true, value: 4 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: 10 }, { points: 2 }, { points: 4 }, { points: 8 }], resolve)).toEqual({ supported: true, value: 6 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: -8 }, { points: -3 }, { points: "nope" }], resolve)).toEqual({ supported: true, value: -5.5 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: 7 }], resolve)).toEqual({ supported: true, value: 7 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: Number.MAX_VALUE }, { points: Number.MAX_VALUE }], resolve)).toEqual({ supported: true, value: Number.MAX_VALUE });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: Number.MIN_VALUE }, { points: Number.MIN_VALUE }], resolve)).toEqual({ supported: true, value: Number.MIN_VALUE });
    expect(evaluateNotesBaseSummary("median(note.points)", [{ points: -Number.MAX_VALUE }, { points: Number.MAX_VALUE }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [2, 4, 4, 4, 5, 5, 7, 9].map((points) => ({ points })), resolve)).toEqual({ supported: true, value: 2 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: -8 }, { points: -3 }, { points: "nope" }], resolve)).toEqual({ supported: true, value: 2.5 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: 7 }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: 0 }, { points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: Number.MAX_VALUE }, { points: Number.MAX_VALUE }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: -Number.MAX_VALUE }, { points: Number.MAX_VALUE }], resolve)).toEqual({ supported: true, value: Number.MAX_VALUE });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: -Number.MIN_VALUE }, { points: Number.MIN_VALUE }], resolve)).toEqual({ supported: true, value: Number.MIN_VALUE });
    expect(evaluateNotesBaseSummary("stddev(note.points)", [{ points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("earliest(note.started)", [
      { started: "2025-01-15T12:00:00.000Z" },
      { started: "2024-02-29" },
      { started: "2024-02-30" },
      { started: 0 },
    ], resolve)).toEqual({ supported: true, value: new Date(2024, 1, 29).toISOString() });
    expect(evaluateNotesBaseSummary("earliest(note.started)", [{ started: "invalid" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("latest(note.started)", [
      { started: "2025-01-15T12:00:00.000Z" },
      { started: "2026-02-28" },
      { started: "2026-02-30" },
      { started: 0 },
    ], resolve)).toEqual({ supported: true, value: new Date(2026, 1, 28).toISOString() });
    expect(evaluateNotesBaseSummary("latest(note.started)", [{ started: "invalid" }], resolve)).toEqual({ supported: true, value: 0 });
    const dateRangeResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("range(note.started)", [
      { started: "2025-01-15T12:00:00.000Z" },
      { started: "2024-02-29" },
      { started: "2024-02-30" },
      { started: 0 },
    ], dateRangeResolve)).toEqual({
      supported: true,
      value: Date.parse("2025-01-15T12:00:00.000Z") - new Date(2024, 1, 29).getTime(),
    });
    expect(dateRangeResolve).toHaveBeenCalledTimes(4);
    expect(evaluateNotesBaseSummary("range(note.started)", [{ started: "2025-01-15" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("range(note.started)", [{ started: "invalid" }], resolve)).toEqual({ supported: true, value: 0 });
    const checkedResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("checked(note.done)", [
      { done: true },
      { done: false },
      { done: true },
      { done: "true" },
      { done: 1 },
      { done: null },
      { done: [true] },
      { done: { value: true } },
      {},
    ], checkedResolve)).toEqual({ supported: true, value: 2 });
    expect(checkedResolve).toHaveBeenCalledTimes(9);
    expect(evaluateNotesBaseSummary("checked(note.done)", [], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("checked(note.done)", [{ done: false }, { done: "true" }], resolve)).toEqual({ supported: true, value: 0 });
    const uncheckedResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("unchecked(note.done)", [
      { done: false },
      { done: true },
      { done: false },
      { done: "" },
      { done: 0 },
      { done: null },
      { done: [false] },
      { done: { value: false } },
      {},
    ], uncheckedResolve)).toEqual({ supported: true, value: 2 });
    expect(uncheckedResolve).toHaveBeenCalledTimes(9);
    expect(evaluateNotesBaseSummary("unchecked(note.done)", [], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("unchecked(note.done)", [{ done: true }, { done: 0 }], resolve)).toEqual({ supported: true, value: 0 });
    const anyValueRows = [
      {},
      { value: null },
      { value: "" },
      { value: [] },
      { value: {} },
      { value: " " },
      { value: 0 },
      { value: false },
      { value: true },
      { value: ["set"] },
      { value: { owner: "Ada" } },
      { value: "set" },
    ];
    const emptyResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("empty(note.value)", anyValueRows, emptyResolve)).toEqual({ supported: true, value: 5 });
    expect(emptyResolve).toHaveBeenCalledTimes(12);
    expect(evaluateNotesBaseSummary("empty(note.value)", [], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("empty(note.value)", [{ value: 0 }, { value: false }, { value: " " }], resolve)).toEqual({ supported: true, value: 0 });
    const filledResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("filled(note.value)", anyValueRows, filledResolve)).toEqual({ supported: true, value: 7 });
    expect(filledResolve).toHaveBeenCalledTimes(12);
    expect(evaluateNotesBaseSummary("filled(note.value)", [], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("filled(note.value)", [{}, { value: null }, { value: "" }, { value: [] }, { value: {} }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("filled(note.value)", [{ value: 0 }, { value: false }, { value: " " }], resolve)).toEqual({ supported: true, value: 3 });
    const uniqueRows = [
      {},
      { value: null },
      { value: "Ada" },
      { value: "Ada" },
      { value: 0 },
      { value: -0 },
      { value: false },
      { value: "0" },
      { value: ["daily", { active: true, owner: "Ada" }] },
      { value: ["daily", { owner: "Ada", active: true }] },
      { value: [{ active: true, owner: "Ada" }, "daily"] },
      { value: { tags: ["daily", "review"], meta: { priority: 1 } } },
      { value: { meta: { priority: 1 }, tags: ["daily", "review"] } },
    ];
    const uniqueResolve = vi.fn(resolve);
    expect(evaluateNotesBaseSummary("unique(note.value)", uniqueRows, uniqueResolve)).toEqual({ supported: true, value: 8 });
    expect(uniqueResolve).toHaveBeenCalledTimes(13);
    expect(evaluateNotesBaseSummary("unique(note.value)", [], resolve)).toEqual({ supported: true, value: 0 });
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted ownKeys trap");
      },
    });
    const throwingDescriptor = new Proxy({ owner: "Ada" }, {
      getOwnPropertyDescriptor() {
        throw new Error("untrusted descriptor trap");
      },
    });
    const accessor = Object.defineProperty({}, "owner", {
      enumerable: true,
      get() {
        throw new Error("accessor must not run");
      },
    });
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const invalidLength = new Proxy([], {
      get(target, property, receiver) {
        return property === "length" ? -1 : readFixtureProperty(target, property);
      },
    });
    let excessiveDepth = "Ada" satisfies unknown;
    for (let depth = 0; depth < 65; depth += 1) excessiveDepth = [excessiveDepth];
    const oversizedObject = Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]));
    expect(evaluateNotesBaseSummary("empty(note.value)", [{ value: throwingKeys }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("empty(note.value)", [{ value: oversizedObject }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("empty(note.value)", [{ value: new (class Metadata {})() }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("empty(note.value)", [{ value: Number.POSITIVE_INFINITY }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value)", [{ value: throwingKeys }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value)", [{ value: oversizedObject }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value)", [{ value: new (class Metadata {})() }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value)", [{ value: Number.POSITIVE_INFINITY }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: throwingKeys }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: throwingDescriptor }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: accessor }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: cyclic }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: invalidLength }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: excessiveDepth }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: Array.from({ length: 10_001 }, () => 1) }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: oversizedObject }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: new (class Metadata {})() }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: "x".repeat(100_001) }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", [{ value: Number.POSITIVE_INFINITY }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value)", Array.from({ length: 11 }, () => ({ value: "x".repeat(100_000) })), resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("max(note.points)", [{ points: -8 }, { points: -3 }], resolve)).toEqual({ supported: true, value: -3 });
    expect(evaluateNotesBaseSummary("range(note.points)", [{ points: -8 }, { points: -3 }], resolve)).toEqual({ supported: true, value: 5 });
    expect(evaluateNotesBaseSummary("range(note.points)", [{ points: 7 }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("range(note.points)", [{ points: -Number.MAX_VALUE }, { points: Number.MAX_VALUE }], resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("min(note.points)", [{ points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("max(note.points)", [{ points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("range(note.points)", [{ points: "nope" }], resolve)).toEqual({ supported: true, value: 0 });
    expect(evaluateNotesBaseSummary("min(note.points, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("max(note.points, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("range(note.points, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("median(note.points, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("stddev(note.points, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("earliest(note.started, note.finished)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("latest(note.started, note.finished)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("checked(note.done, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unchecked(note.done, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("empty(note.value, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value, note.other)", rows, resolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("max(note.points.abs())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("range(note.points.abs())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("median(note.points.abs())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("stddev(note.points.abs())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("earliest(note.started.date())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("latest(note.started.date())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("range(note.started.date())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("checked(note.done.isTruthy())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unchecked(note.done.isTruthy())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("empty(note.value.isEmpty())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("filled(note.value.isEmpty())", rows, unsafeResolve).supported).toBe(false);
    expect(evaluateNotesBaseSummary("unique(note.value.unique())", rows, unsafeResolve).supported).toBe(false);
    expect(unsafeResolve).not.toHaveBeenCalled();
    expect(evaluateNotesBaseSummary("readFile('/etc/passwd')", rows, resolve).supported).toBe(false);
  });

  it("bounds string transforms and slices of oversized properties", () => {
    const resolve = (property: string) => property === "note.big" ? "x".repeat(100_001) : undefined;

    for (const expression of [
      "note.big.lower()",
      "note.big.title()",
      "note.big.trim()",
      "note.big.reverse()",
      "note.big.slice(0)",
    ]) {
      expect(evaluateNotesBaseFormula(expression, resolve).supported, expression).toBe(false);
    }
  });
});
