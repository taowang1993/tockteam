import { readFile } from 'node:fs/promises';
import { MERMAID_FRAME_PATH } from "./mermaid-contract.js";
export { MERMAID_FRAME_PATH };
/** A fixed, package-owned script. Never accepts a path, vault data, or arbitrary file name. */
export function createMermaidFrameHandler() {
    let bundle;
    return async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        try {
            const bytes = await (bundle ??= readFile(new URL('./mermaid-frame.js', import.meta.url)));
            res.writeHead(200, {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Content-Length': bytes.length,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            }).end(req.method === 'HEAD' ? undefined : bytes);
        }
        catch {
            bundle = undefined;
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Renderer unavailable.');
        }
    };
}
//# sourceMappingURL=mermaid-asset.js.map