import { type CanvasChange } from './canvas-change.ts';
export interface CanvasBoardProps {
    source: string;
    revision: string;
    onChange(change: CanvasChange): void;
    disabled?: boolean;
}
/**
 * Controlled, browser-only Canvas seam. It never saves or owns optimistic
 * source; every edit carries the exact previous source and expected revision.
 */
export declare function CanvasBoard({ source, revision, onChange, disabled }: CanvasBoardProps): import("react").JSX.Element;
//# sourceMappingURL=canvas-board.d.ts.map