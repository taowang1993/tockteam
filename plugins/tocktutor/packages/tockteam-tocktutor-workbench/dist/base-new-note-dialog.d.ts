import type { TockTutorSettings } from './settings.ts';
export interface BaseNewNoteRequest {
    basePath: string;
    name: string;
    location: TockTutorSettings['newNoteLocation'];
    folder: string;
}
export declare function BaseNewNoteDialog(props: {
    basePath: string;
    defaultFolder: string;
    defaultLocation: TockTutorSettings['newNoteLocation'];
    folders: readonly string[];
    onClose(): void;
    onCreate(request: BaseNewNoteRequest): Promise<boolean>;
}): import("react").JSX.Element;
//# sourceMappingURL=base-new-note-dialog.d.ts.map