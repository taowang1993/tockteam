---
status: review
area: markdown
tags: [comparison, typography]
difficulty: medium
---

# Markdown Rendering Lab

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, ==highlighting==, and `inline code` in one paragraph.

Open [[Welcome]], follow [[Study Guide|an aliased note]], or visit [Obsidian Help](https://help.obsidian.md).

## Structure

### Lists

1. Compare heading scale and paragraph rhythm.
2. Inspect nested content.
   - A nested bullet
   - A bullet with **strong text**

- [x] Completed task
- [ ] Pending task with [[Welcome]]

> A short quote should begin close to its leading bar.
>
> A second paragraph tests spacing inside the same quote.

## Data

| Syntax | Expected Result | State |
| :--- | :--- | ---: |
| `**text**` | Bold text | Ready |
| `[[note]]` | Internal link | Review |
| `> quote` | Leading bar | Ready |

## Code and Notes

```ts
const lesson = "markdown"
console.log(lesson)
```

Inline math uses $E = mc^2$, while a footnote keeps context nearby.[^context]

A soft line ends here.
This sentence follows without a blank line.

---

#### Small Heading

Final text tests the smallest heading, an automatic URL https://example.com, and punctuation—without changing application chrome.

[^context]: Footnotes should remain readable without dominating the page.
