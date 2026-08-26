import type { KeyValueStorage } from './settings.ts';
export declare const MAX_BOOKMARK_ITEMS = 1000;
export declare const MAX_BOOKMARK_BYTES = 1048576;
interface BookmarkBase {
    id: string;
    missing?: boolean;
    title: string;
}
export type Bookmark = (BookmarkBase & {
    kind: 'note' | 'folder';
    path: string;
}) | (BookmarkBase & {
    kind: 'search';
    query: string;
}) | (BookmarkBase & {
    kind: 'graph';
}) | (BookmarkBase & {
    kind: 'heading';
    line: number;
    path: string;
}) | (BookmarkBase & {
    blockId: string;
    kind: 'block';
    path: string;
}) | (BookmarkBase & {
    kind: 'link';
    url: string;
}) | (BookmarkBase & {
    children: Exclude<Bookmark, {
        kind: 'group';
    }>[];
    kind: 'group';
});
export declare function loadBookmarks(storage: KeyValueStorage, vaultId: string): Bookmark[];
export declare function saveBookmarks(storage: KeyValueStorage, vaultId: string, bookmarks: readonly Bookmark[]): boolean;
export declare function addBookmark(bookmarks: readonly Bookmark[], bookmark: Bookmark): Bookmark[];
export declare function remapBookmarks(bookmarks: readonly Bookmark[], fromPath: string, toPath: string): Bookmark[];
export {};
//# sourceMappingURL=bookmarks.d.ts.map