import type { LocaleMessages } from '../../shared/i18n.ts'

export type PinnedSummaryMessage =
  | 'summary.title'
  | 'summary.close'
  | 'summary.copy'
  | 'summary.copy-success'
  | 'summary.copy-failure'
  | 'summary.show-more'
  | 'summary.show-less'
  | 'summary.no-active'
  | 'summary.select-session'
  | 'summary.empty-placeholder'
  | 'summary.source.context'
  | 'summary.source.assistant'
  | 'summary.source.overview'
  | 'summary.status.no-session'
  | 'summary.status.loading'
  | 'summary.status.blank'
  | 'summary.status.running'
  | 'summary.status.waiting'
  | 'summary.status.ready'
  | 'summary.status.unavailable'
  | 'summary.status.error'
  | 'summary.loading'
  | 'summary.error'
  | 'summary.updated'
  | 'summary.blank'
  | 'summary.unavailable'

export const PINNED_SUMMARY_MESSAGES: LocaleMessages<PinnedSummaryMessage> = {
  en: {
    'summary.title': 'Pinned Summary',
    'summary.close': 'Close Pinned Summary',
    'summary.copy': 'Copy Summary',
    'summary.copy-success': 'Summary Copied',
    'summary.copy-failure': 'Copy Unavailable',
    'summary.show-more': 'View Full Content',
    'summary.show-less': 'Show Less',
    'summary.no-active': 'No Active Session',
    'summary.select-session': 'Select a session to see its summary.',
    'summary.empty-placeholder': 'The active DSH session summary will appear here.',
    'summary.source.context': 'DSH Context Summary',
    'summary.source.assistant': 'Latest Assistant Response',
    'summary.source.overview': 'Session Overview',
    'summary.status.no-session': 'No Session',
    'summary.status.loading': 'Loading',
    'summary.status.blank': 'Not Started',
    'summary.status.running': 'Running',
    'summary.status.waiting': 'Waiting for Input',
    'summary.status.ready': 'Ready',
    'summary.status.unavailable': 'Unavailable',
    'summary.status.error': 'Error',
    'summary.loading': 'Loading session summary…',
    'summary.error': 'The session summary could not be loaded.',
    'summary.updated': 'Updated {time}',
    'summary.blank': 'This session has not started yet.',
    'summary.unavailable': 'No DSH compaction summary is available yet. The latest generated summary will be pinned here automatically.',
  },
  zh: {
    'summary.title': '固定摘要',
    'summary.close': '关闭固定摘要',
    'summary.copy': '复制摘要',
    'summary.copy-success': '摘要已复制',
    'summary.copy-failure': '暂时无法复制',
    'summary.show-more': '查看完整内容',
    'summary.show-less': '收起内容',
    'summary.no-active': '没有活动会话',
    'summary.select-session': '选择一个会话查看摘要。',
    'summary.empty-placeholder': '当前 DSH 会话的摘要将显示在这里。',
    'summary.source.context': 'DSH 上下文摘要',
    'summary.source.assistant': '最新助手回复',
    'summary.source.overview': '会话概览',
    'summary.status.no-session': '没有会话',
    'summary.status.loading': '加载中',
    'summary.status.blank': '尚未开始',
    'summary.status.running': '运行中',
    'summary.status.waiting': '等待输入',
    'summary.status.ready': '就绪',
    'summary.status.unavailable': '不可用',
    'summary.status.error': '加载失败',
    'summary.loading': '正在加载会话摘要…',
    'summary.error': '无法加载该会话摘要。',
    'summary.updated': '更新于 {time}',
    'summary.blank': '该会话尚未开始。',
    'summary.unavailable': '暂无 DSH 压缩摘要。生成后将自动固定在这里。',
  },
}
