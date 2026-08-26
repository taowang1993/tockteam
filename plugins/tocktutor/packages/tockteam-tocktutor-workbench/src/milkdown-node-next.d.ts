import type { ComponentType, ReactNode } from 'react'

/**
 * Milkdown 7.20 publishes extensionless declaration re-exports. NodeNext does
 * not follow those internal declaration paths, so keep this narrow type bridge
 * while runtime imports continue to use the pinned public packages.
 */
declare module '@milkdown/core' {
  interface MilkdownContext {
    get<T = unknown>(slice: unknown): T
    set(slice: unknown, value: unknown): void
  }
  interface MilkdownEditor {
    action<T>(action: (ctx: MilkdownContext) => T): T
    config(configure: (ctx: MilkdownContext) => void): MilkdownEditor
    use(plugin: unknown): MilkdownEditor
  }
  export const Editor: { make(): MilkdownEditor }
  export const defaultValueCtx: unknown
  export const rootCtx: unknown
}

declare module '@milkdown/react' {
  export const Milkdown: ComponentType
  export const MilkdownProvider: ComponentType<{ children?: ReactNode }>
  export function useEditor(
    factory: (root: HTMLElement) => unknown,
    deps?: readonly unknown[],
  ): { loading: boolean; get(): { action<T>(action: (ctx: unknown) => T): T } | undefined }
}

declare module '@milkdown/utils' {
  export function $prose(factory: (ctx: unknown) => unknown): unknown
  export function getMarkdown(): (ctx: unknown) => string
  export function replaceAll(markdown: string): (ctx: unknown) => void
}
