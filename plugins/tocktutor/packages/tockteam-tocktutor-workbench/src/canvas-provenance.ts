export const TOCKBOT_CANVAS_PROVENANCE = Object.freeze({
  repository: 'https://github.com/taowang1993/tockbot',
  revision: 'af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba',
  sourceFiles: Object.freeze([
    'apps/web/src/components/notes/NotesCanvasDuplication.ts',
    'apps/web/src/components/notes/NotesCanvasEdges.ts',
    'apps/web/src/components/notes/NotesCanvasGeometry.ts',
    'apps/web/src/components/notes/NotesCanvasIdentity.ts',
    'apps/web/src/components/notes/NotesCanvasLinks.ts',
    'apps/web/src/components/notes/NotesCanvasNodes.ts',
    'apps/web/src/components/notes/NotesCanvasView.tsx',
  ]),
  adaptations: Object.freeze([
    'Use NodeNext .ts import extensions and unknown-valued JSON records instead of Convex Value annotations.',
    'Run every mutation through TockTeam bounded parsing and output validation without weakening existing limits.',
    'Retain TockTeam cross-category node/edge identity uniqueness in addition to Tockbot duplicate checks.',
    'Extract pure mutations from NotesCanvasView.tsx without porting its React shell or native authority.',
    'Expose controlled change requests with exact previous source and expected revision for caller-owned rollback.',
    'Replace the upstream route-coupled view with a bounded controlled board seam for later route integration.',
  ]),
})
