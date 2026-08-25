# TockTutor Import/Export

Host + browser client bundle for reviewed TockTutor imports, backup, restore, and conversion in TockTeam Desktop.

## Supported Release Scope

Every operation is inspected, previewed, explicitly approved, revalidated, and then committed through `tockbot-note-runtime`. Existing vault files are never replaced. Each import and backup engine holds at most one active reviewed plan; abandoned plans expire within five minutes and release their Desktop source or destination capability.

- Markdown folders and ZIP files: Markdown, Canvas, Base, accepted image/audio/video files, and PDF files.
- Craft: delegates Craft Markdown folder or ZIP exports to the Markdown workflow without a Craft-specific parser.
- HTML: inert standalone files, folders, and ZIP batches, reviewed local media/PDF resources, and relative note-link rewrites. Notion and third-party Apple Notes HTML exports use this path.
- CSV: up to 500 data rows become Markdown notes plus one inert Base table.
- Apple Journal: supported exported HTML text/date/prompt fields; media is reported but intentionally omitted.
- Bear: normal unencrypted `.bear2bk` Markdown records and accepted attachments; unsupported records remain visible as skipped.
- Evernote: one normal ENEX export with inert ENML, tags, dates, and accepted resources. DTDs, entities, encryption, reminders, tasks, location, and OCR are unsupported.
- Google Keep: Takeout JSON notes, top-level tasks, labels, state metadata, and referenced accepted attachments. Reminders, collaborators, drawings, OCR, and nested checklist structure are omitted.
- Roam Research: bounded page/block JSON converted to Markdown. Remote attachments and graph metadata are omitted.
- Textbundle/Textpack: Markdown packages and accepted assets. Unsupported package types and assets are reported.
- Backup/restore: deterministic version-2 ZIP archives with a complete nested manifest and independent member verification. The backup set is the complete runtime-visible Markdown/Canvas/Base and accepted attachment snapshot; hidden application configuration and arbitrary vault binaries are not advertised or silently included.

## Trust Boundaries

The browser receives bounded labels, previews, warnings, item digests, relative destinations, progress, and result evidence. It never receives native paths, source handles, unrestricted bytes, active-vault write authority, or caller-controlled session, window, or vault identity.

The trusted main Desktop window mints a short-lived caller authorization before each import, restore, or backup. The Host claims that opaque authorization through `tockTeamDesktopCaller` and uses only Desktop-derived operation, request, session, window, vault, and generation identity. Auxiliary or pop-out windows cannot mint the authorization and cannot trigger native pickers through the Remote service.

Desktop owns opaque external source/destination grants. This package owns bounded parsing, conversion, plans, review tokens, archive verification, and orchestration. `tockbot-note-runtime` remains the only active-vault filesystem authority and provides exclusive create operations. Partial multi-file results identify committed, skipped, failed, and recovery-required entries without claiming rollback.

The release targets DSH revision `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, Desktop `>=0.1.11 <0.2.0`, Workbench `>=0.1.7 <0.2.0`, and exact Runtime `0.1.2`.
