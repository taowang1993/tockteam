import type { IncomingMessage, ServerResponse } from 'node:http';
import { MERMAID_FRAME_PATH } from './mermaid-contract.ts';
export { MERMAID_FRAME_PATH };
/** A fixed, package-owned script. Never accepts a path, vault data, or arbitrary file name. */
export declare function createMermaidFrameHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
//# sourceMappingURL=mermaid-asset.d.ts.map