import type { Context } from '@deepseek-ai/cordis';
/** Host Loader identity for the native TockTutor workbench. */
export declare const name = "@tockteam/tocktutor-workbench";
/** Required Host capability supplied only by tockbot-note-runtime. */
export declare const inject: string[];
/** Register the accepted read/tree gateway under this plugin's Cordis lifecycle. */
export declare function apply(ctx: Context): void;
export * from './host-read.ts';
export * from './vault-events.ts';
export * from './session.ts';
export * from './canvas.ts';
export * from './canvas-change.ts';
export * from './canvas-edges.ts';
export * from './canvas-geometry.ts';
export * from './canvas-identity.ts';
export * from './canvas-links.ts';
export * from './canvas-nodes.ts';
export * from './canvas-provenance.ts';
export * from './base.ts';
export * from './base-edit.ts';
export * from './base-evaluator-provenance.ts';
export * from './base-parser.ts';
export * from './base-query.ts';
export * from './base-spreadsheet.ts';
export * from './base-view-model.ts';
export * from './base-view-provenance.ts';
export * from './NotesBaseFilterTree.ts';
export * from './NotesBaseFormula.ts';
export * from './NotesBaseFormulaHtml.ts';
export * from './NotesBaseFormulaIcon.ts';
export * from './NotesBaseFormulaImage.ts';
export * from './NotesBaseFormulaLink.ts';
export * from './NotesBaseFormulaObject.ts';
export * from './NotesBaseFormulaPath.ts';
export * from './NotesBaseFormulaValue.ts';
export * from './markdown.ts';
export * from './live-preview.ts';
export * from './rich-markdown.ts';
export * from './editor-commands.ts';
export * from './settings.ts';
export * from './properties.ts';
export * from './bookmarks.ts';
export * from './graph.ts';
export * from './capture.ts';
export * from './organize.ts';
export * from './composer.ts';
export * from './attachments.ts';
//# sourceMappingURL=index.d.ts.map