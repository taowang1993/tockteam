export type DesktopSkinsMessage =
  | 'skins.title'
  | 'skins.description'
  | 'skins.name.default'
  | 'skins.name.navy'
  | 'skins.name.jade'
  | 'skins.name.ember'
  | 'skins.mode.system'
  | 'skins.selected'

export const DESKTOP_SKINS_MESSAGES: Record<'en' | 'zh', Record<DesktopSkinsMessage, string>> = {
  en: {
    'skins.title': 'TockTeam Skin',
    'skins.description': 'Choose a skin shared by Web, Desktop, and TUI.',
    'skins.name.default': 'Default',
    'skins.name.navy': 'Navy',
    'skins.name.jade': 'Jade',
    'skins.name.ember': 'Ember',
    'skins.mode.system': 'Follow Appearance',
    'skins.selected': 'Selected',
  },
  zh: {
    'skins.title': 'TockTeam 皮肤',
    'skins.description': '选择 Web、桌面端和 TUI 共用的皮肤。',
    'skins.name.default': '默认',
    'skins.name.navy': '海军蓝',
    'skins.name.jade': '翡翠绿',
    'skins.name.ember': '余烬橙',
    'skins.mode.system': '跟随外观设置',
    'skins.selected': '已选择',
  },
}
