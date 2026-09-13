/** Copy keys rendered by the finalized assistant response image action. */
export type SaveAsImageMessage =
  | 'action.saveAsImage'
  | 'status.capturing'
  | 'status.saved'
  | 'status.failed'

export const SAVE_AS_IMAGE_MESSAGES: {
  zh: Record<SaveAsImageMessage, string>
  en: Record<SaveAsImageMessage, string>
} = {
  zh: {
    'action.saveAsImage': '保存为图片',
    'status.capturing': '正在生成图片…',
    'status.saved': '已保存',
    'status.failed': '图片导出失败',
  },
  en: {
    'action.saveAsImage': 'Save as Image',
    'status.capturing': 'Capturing Image…',
    'status.saved': 'Saved',
    'status.failed': 'Could Not Export Image',
  },
}
