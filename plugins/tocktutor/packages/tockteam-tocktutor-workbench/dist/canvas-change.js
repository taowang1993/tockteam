import { parseCanvasForMutation } from "./canvas.js";
/** Stage a bounded Canvas mutation with all caller-owned conflict/rollback inputs. */
export function createCanvasChange(previousSource, expectedRevision, operation, mutate) {
    if (!expectedRevision || expectedRevision.length > 512 || /[\0\r\n]/u.test(expectedRevision)) {
        throw new Error('The Canvas source revision is invalid.');
    }
    parseCanvasForMutation(previousSource);
    const source = mutate(previousSource);
    parseCanvasForMutation(source);
    return { previousSource, source, expectedRevision, operation };
}
//# sourceMappingURL=canvas-change.js.map