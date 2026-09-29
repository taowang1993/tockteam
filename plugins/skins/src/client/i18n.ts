export type DesktopSkinsMessage =
  | 'skins.title'
  | 'skins.description'
  | 'skins.name.default'
  | 'skins.name.deep-current'
  | 'skins.name.jade-circuit'
  | 'skins.name.ember-dusk'
  | 'skins.mode.system'
  | 'skins.selected'

export const DESKTOP_SKINS_MESSAGES: Record<'en' | 'zh', Record<DesktopSkinsMessage, string>> = {
  en: {
    'skins.title': 'TockTeam Skin',
    'skins.description': 'Choose a skin shared by Web, Desktop, and TUI.',
    'skins.name.default': 'Default',
    'skins.name.deep-current': 'Cyan',
    'skins.name.jade-circuit': 'Aurora',
    'skins.name.ember-dusk': 'Ember Dusk',
    'skins.mode.system': 'Follow Appearance',
    'skins.selected': 'Selected',
  },
  zh: {
    'skins.title': 'TockTeam 皮肤',
    'skins.description': '选择 Web、桌面端和 TUI 共用的皮肤。',
    'skins.name.default': '默认',
    'skins.name.deep-current': '青色',
    'skins.name.jade-circuit': '极光',
    'skins.name.ember-dusk': '余烬暮色',
    'skins.mode.system': '跟随外观设置',
    'skins.selected': '已选择',
  },
}
