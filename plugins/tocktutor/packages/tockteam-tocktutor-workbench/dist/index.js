import { TockTutorWorkbenchGateway } from "./host-read.js";
/** Host Loader identity for the native TockTutor workbench. */
export const name = '@tockteam/tocktutor-workbench';
/** Required Host capability supplied only by tockbot-note-runtime. */
export const inject = ['noteVault'];
/** Register the accepted read/tree gateway under this plugin's Cordis lifecycle. */
export function apply(ctx) {
    ctx.plugin(TockTutorWorkbenchGateway);
}
export * from "./host-read.js";
export * from "./vault-events.js";
export * from "./session.js";
export * from "./canvas.js";
export * from "./base.js";
export * from "./base-evaluator-provenance.js";
export * from "./NotesBaseFilterTree.js";
export * from "./NotesBaseFormula.js";
export * from "./NotesBaseFormulaHtml.js";
export * from "./NotesBaseFormulaIcon.js";
export * from "./NotesBaseFormulaImage.js";
export * from "./NotesBaseFormulaLink.js";
export * from "./NotesBaseFormulaObject.js";
export * from "./NotesBaseFormulaPath.js";
export * from "./NotesBaseFormulaValue.js";
export * from "./markdown.js";
export * from "./live-preview.js";
export * from "./rich-markdown.js";
export * from "./editor-commands.js";
export * from "./settings.js";
//# sourceMappingURL=index.js.map