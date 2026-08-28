export type LauncherOsPlatform = 'Linux' | 'macOS' | 'Windows'

export type LauncherOsExtensionId =
  | 'AppearanceSwitcher'
  | 'SystemCommands'
  | 'SystemSettings'
  | 'UeliCommand'
  | 'WindowsControlPanel'

export type LauncherSystemCommand =
  | 'empty-trash'
  | 'hibernate'
  | 'lock'
  | 'log-out'
  | 'restart'
  | 'shutdown'
  | 'sleep'

export type LauncherUeliCommand =
  | 'centerWindow'
  | 'disableHotkey'
  | 'enableHotkey'
  | 'openAbout'
  | 'openExtensions'
  | 'openSettings'
  | 'quit'
  | 'rescanExtensions'
  | 'show'

export type LauncherSystemSetting = Readonly<{ name: string; target: string }>
export type LauncherSystemCommandRow = Readonly<{ command: LauncherSystemCommand; details: string; imageKey: string; name: string }>
export type LauncherUeliCommandRow = Readonly<{ command: LauncherUeliCommand; description: string; id: string; name: string; protected?: boolean }>

export const LAUNCHER_OS_EXTENSION_IDS = Object.freeze(['AppearanceSwitcher', 'SystemCommands', 'SystemSettings', 'UeliCommand', 'WindowsControlPanel'] as const)
export const LAUNCHER_OS_MODULES = Object.freeze([
  ['AppearanceSwitcherModule', 'AppearanceSwitcher'],
  ['SystemCommandsModule', 'SystemCommands'],
  ['SystemSettingsModule', 'SystemSettings'],
  ['UeliCommandModule', 'UeliCommand'],
  ['WindowsControlPanelModule', 'WindowsControlPanel'],
] as const)

export const MACOS_SYSTEM_SETTINGS: readonly LauncherSystemSetting[] = Object.freeze([
  Object.freeze({ name: "System Settings", target: "/System/Applications/System Settings.app" }),
  Object.freeze({ name: "Accounts", target: "/System/Library/PreferencePanes/Accounts.prefPane" }),
  Object.freeze({ name: "Appearance", target: "/System/Library/PreferencePanes/Appearance.prefPane" }),
  Object.freeze({ name: "Apple ID", target: "/System/Library/PreferencePanes/AppleIDPrefPane.prefPane" }),
  Object.freeze({ name: "Battery", target: "/System/Library/PreferencePanes/Battery.prefPane" }),
  Object.freeze({ name: "Bluetooth", target: "/System/Library/PreferencePanes/Bluetooth.prefPane" }),
  Object.freeze({ name: "Date & Time", target: "/System/Library/PreferencePanes/DateAndTime.prefPane" }),
  Object.freeze({ name: "Wallpaper", target: "/System/Library/PreferencePanes/DesktopScreenEffectsPref.prefPane" }),
  Object.freeze({ name: "Displays", target: "/System/Library/PreferencePanes/Displays.prefPane" }),
  Object.freeze({ name: "Dock", target: "/System/Library/PreferencePanes/Dock.prefPane" }),
  Object.freeze({ name: "Internet Accounts", target: "/System/Library/PreferencePanes/InternetAccounts.prefPane" }),
  Object.freeze({ name: "Keyboard", target: "/System/Library/PreferencePanes/Keyboard.prefPane" }),
  Object.freeze({ name: "Localization", target: "/System/Library/PreferencePanes/Localization.prefPane" }),
  Object.freeze({ name: "Mouse", target: "/System/Library/PreferencePanes/Mouse.prefPane" }),
  Object.freeze({ name: "Network", target: "/System/Library/PreferencePanes/Network.prefPane" }),
  Object.freeze({ name: "Notifications", target: "/System/Library/PreferencePanes/Notifications.prefPane" }),
  Object.freeze({ name: "Passwords", target: "/System/Library/PreferencePanes/Passwords.prefPane" }),
  Object.freeze({ name: "Printers & Scanners", target: "/System/Library/PreferencePanes/PrintAndFax.prefPane" }),
  Object.freeze({ name: "Screen Time", target: "/System/Library/PreferencePanes/ScreenTime.prefPane" }),
  Object.freeze({ name: "Security", target: "/System/Library/PreferencePanes/Security.prefPane" }),
  Object.freeze({ name: "Sound", target: "/System/Library/PreferencePanes/Sound.prefPane" }),
  Object.freeze({ name: "Siri & Spotlight", target: "/System/Library/PreferencePanes/Speech.prefPane" }),
  Object.freeze({ name: "Touch ID & Password", target: "/System/Library/PreferencePanes/TouchID.prefPane" }),
  Object.freeze({ name: "Trackpad", target: "/System/Library/PreferencePanes/Trackpad.prefPane" }),
  Object.freeze({ name: "Accessibility", target: "/System/Library/PreferencePanes/UniversalAccessPref.prefPane" }),
  Object.freeze({ name: "Wallet & Apple Pay", target: "/System/Library/PreferencePanes/Wallet.prefPane" }),
] as const)

export const WINDOWS_SYSTEM_SETTINGS: readonly LauncherSystemSetting[] = Object.freeze([
  Object.freeze({ name: "System Settings", target: "ms-settings:" }),
  Object.freeze({ name: "Access work or school", target: "ms-settings:workplace" }),
  Object.freeze({ name: "Email & app accounts", target: "ms-settings:emailandaccounts" }),
  Object.freeze({ name: "Family & other people", target: "ms-settings:otherusers" }),
  Object.freeze({ name: "Set up a kiosk", target: "ms-settings:assignedaccess" }),
  Object.freeze({ name: "Sign-in options", target: "ms-settings:signinoptions" }),
  Object.freeze({ name: "Sync your settings", target: "ms-settings:sync" }),
  Object.freeze({ name: "Windows Hello setup", target: "ms-settings:signinoptions-launchfaceenrollment" }),
  Object.freeze({ name: "Your info", target: "ms-settings:yourinfo" }),
  Object.freeze({ name: "Apps & Features", target: "ms-settings:appsfeatures" }),
  Object.freeze({ name: "Apps for websites", target: "ms-settings:appsforwebsites" }),
  Object.freeze({ name: "Default apps", target: "ms-settings:defaultapps" }),
  Object.freeze({ name: "Manage optional features", target: "ms-settings:optionalfeatures" }),
  Object.freeze({ name: "Offline Maps", target: "ms-settings:maps" }),
  Object.freeze({ name: "Startup apps", target: "ms-settings:startupapps" }),
  Object.freeze({ name: "Video playback", target: "ms-settings:videoplayback" }),
  Object.freeze({ name: "Control center", target: "ms-settings:controlcenter$" }),
  Object.freeze({ name: "Cortana across my devices", target: "ms-settings:cortana-notifications" }),
  Object.freeze({ name: "More details", target: "ms-settings:cortana-moredetails" }),
  Object.freeze({ name: "Permissions & History", target: "ms-settings:cortana-permissions" }),
  Object.freeze({ name: "Talk to Cortana", target: "ms-settings:cortana" }),
  Object.freeze({ name: "AutoPlay", target: "ms-settings:autoplay" }),
  Object.freeze({ name: "Bluetooth", target: "ms-settings:bluetooth" }),
  Object.freeze({ name: "Connected Devices", target: "ms-settings:connecteddevices" }),
  Object.freeze({ name: "Camera settings", target: "ms-settings:camera" }),
  Object.freeze({ name: "Mouse & touchpad", target: "ms-settings:mousetouchpad" }),
  Object.freeze({ name: "Pen & Windows Ink", target: "ms-settings:pen" }),
  Object.freeze({ name: "Printers & scanners", target: "ms-settings:printers" }),
  Object.freeze({ name: "Touch", target: "ms-settings:devices-touch" }),
  Object.freeze({ name: "Touchpad", target: "ms-settings:devices-touchpad" }),
  Object.freeze({ name: "Text Suggestions", target: "ms-settings:devicestyping-hwkbtextsuggestions" }),
  Object.freeze({ name: "Typing", target: "ms-settings:typing" }),
  Object.freeze({ name: "USB", target: "ms-settings:usb" }),
  Object.freeze({ name: "Wheel", target: "ms-settings:wheel" }),
  Object.freeze({ name: "Audio", target: "ms-settings:easeofaccess-audio" }),
  Object.freeze({ name: "Closed captions", target: "ms-settings:easeofaccess-closedcaptioning" }),
  Object.freeze({ name: "Color filters", target: "ms-settings:easeofaccess-colorfilter" }),
  Object.freeze({ name: "Eye control", target: "ms-settings:easeofaccess-eyecontrol" }),
  Object.freeze({ name: "Fonts", target: "ms-settings:fonts" }),
  Object.freeze({ name: "High contrast", target: "ms-settings:easeofaccess-highcontrast" }),
  Object.freeze({ name: "Keyboard", target: "ms-settings:easeofaccess-keyboard" }),
  Object.freeze({ name: "Magnifier", target: "ms-settings:easeofaccess-magnifier" }),
  Object.freeze({ name: "Mouse", target: "ms-settings:easeofaccess-mouse" }),
  Object.freeze({ name: "Mouse pointer & touch", target: "ms-settings:easeofaccess-mousepointer" }),
  Object.freeze({ name: "Narrator", target: "ms-settings:easeofaccess-narrator" }),
  Object.freeze({ name: "Text cursor", target: "ms-settings:easeofaccess-cursor" }),
  Object.freeze({ name: "Visual Effects", target: "ms-settings:easeofaccess-visualeffects" }),
  Object.freeze({ name: "Extras", target: "ms-settings:extras" }),
  Object.freeze({ name: "Family Group", target: "ms-settings:family-group" }),
  Object.freeze({ name: "Game bar", target: "ms-settings:gaming-gamebar" }),
  Object.freeze({ name: "Game DVR", target: "ms-settings:gaming-gamedvr" }),
  Object.freeze({ name: "Game Mode", target: "ms-settings:gaming-gamemode" }),
  Object.freeze({ name: "Playing a game full screen", target: "ms-settings:quietmomentsgame" }),
  Object.freeze({ name: "TruePlay", target: "ms-settings:gaming-trueplay" }),
  Object.freeze({ name: "Headset display", target: "ms-settings:holographic-headset" }),
  Object.freeze({ name: "Uninstall", target: "ms-settings:holographic-management" }),
  Object.freeze({ name: "Startup and desktop", target: "ms-settings:holographic-startupandesktop" }),
  Object.freeze({ name: "Network & internet", target: "ms-settings:network-status" }),
  Object.freeze({ name: "Advanced settings", target: "ms-settings:network-advancedsettings" }),
  Object.freeze({ name: "Airplane mode", target: "ms-settings:network-airplanemode" }),
  Object.freeze({ name: "Cellular & SIM", target: "ms-settings:network-cellular" }),
  Object.freeze({ name: "Dial-up", target: "ms-settings:network-dialup" }),
  Object.freeze({ name: "DirectAccess", target: "ms-settings:network-directaccess" }),
  Object.freeze({ name: "Ethernet", target: "ms-settings:network-ethernet" }),
  Object.freeze({ name: "Manage known networks", target: "ms-settings:network-wifisettings" }),
  Object.freeze({ name: "Mobile hotspot", target: "ms-settings:network-mobilehotspot" }),
  Object.freeze({ name: "Proxy", target: "ms-settings:network-proxy" }),
  Object.freeze({ name: "VPN", target: "ms-settings:network-vpn" }),
  Object.freeze({ name: "Wi-Fi", target: "ms-settings:network-wifi" }),
  Object.freeze({ name: "Wi-Fi provisioning", target: "ms-settings:wifi-provisioning" }),
  Object.freeze({ name: "Background", target: "ms-settings:personalization-background" }),
  Object.freeze({ name: "Choose which folders appear on Start", target: "ms-settings:personalization-start-places" }),
  Object.freeze({ name: "Colors", target: "ms-settings:colors" }),
  Object.freeze({ name: "Lock screen", target: "ms-settings:lockscreen" }),
  Object.freeze({ name: "Personalization (category)", target: "ms-settings:personalization" }),
  Object.freeze({ name: "Start", target: "ms-settings:personalization-start" }),
  Object.freeze({ name: "Touch Keyboard", target: "ms-settings:personalization-touchkeyboard" }),
  Object.freeze({ name: "Themes", target: "ms-settings:themes" }),
  Object.freeze({ name: "Your phone", target: "ms-settings:mobile-devices" }),
  Object.freeze({ name: "Device Usage", target: "ms-settings:deviceusage" }),
  Object.freeze({ name: "Privacy & Security", target: "ms-settings:privacy" }),
  Object.freeze({ name: "Search", target: "ms-settings:search" }),
  Object.freeze({ name: "About", target: "ms-settings:about" }),
  Object.freeze({ name: "Advanced display settings", target: "ms-settings:display-advanced" }),
  Object.freeze({ name: "App volume and device preferences", target: "ms-settings:apps-volume" }),
  Object.freeze({ name: "Battery Saver", target: "ms-settings:batterysaver" }),
  Object.freeze({ name: "Battery Saver settings", target: "ms-settings:batterysaver-settings" }),
  Object.freeze({ name: "Battery use", target: "ms-settings:batterysaver-usagedetails" }),
  Object.freeze({ name: "Clipboard", target: "ms-settings:clipboard" }),
  Object.freeze({ name: "Display", target: "ms-settings:display" }),
  Object.freeze({ name: "Default Save Locations", target: "ms-settings:savelocations" }),
  Object.freeze({ name: "Duplicating my display", target: "ms-settings:quietmomentspresentation" }),
  Object.freeze({ name: "During these hours", target: "ms-settings:quietmomentsscheduled" }),
  Object.freeze({ name: "Encryption", target: "ms-settings:deviceencryption" }),
  Object.freeze({ name: "Energy recommendatations", target: "ms-settings:energyrecommendations" }),
  Object.freeze({ name: "Focus assist", target: "ms-settings:quiethours" }),
  Object.freeze({ name: "Graphics Settings", target: "ms-settings:display-advancedgraphics" }),
  Object.freeze({ name: "Graphics Default Settings", target: "ms-settings:display-advancedgraphics-default" }),
  Object.freeze({ name: "Multitasking", target: "ms-settings:multitasking" }),
  Object.freeze({ name: "Night light settings", target: "ms-settings:nightlight" }),
  Object.freeze({ name: "Projecting to this PC", target: "ms-settings:project" }),
  Object.freeze({ name: "Shared experiences", target: "ms-settings:crossdevice" }),
  Object.freeze({ name: "Taskbar", target: "ms-settings:taskbar" }),
  Object.freeze({ name: "Notifications & actions", target: "ms-settings:notifications" }),
  Object.freeze({ name: "Remote Desktop", target: "ms-settings:remotedesktop" }),
  Object.freeze({ name: "Power & sleep", target: "ms-settings:powersleep" }),
  Object.freeze({ name: "Presence sensing", target: "ms-settings:presence" }),
  Object.freeze({ name: "Sound", target: "ms-settings:sound" }),
  Object.freeze({ name: "Sound devices", target: "ms-settings:sound-devices" }),
  Object.freeze({ name: "Storage", target: "ms-settings:storagesense" }),
  Object.freeze({ name: "Storage Sense", target: "ms-settings:storagepolicies" }),
  Object.freeze({ name: "Storage recommendations", target: "ms-settings:storagerecommendations" }),
  Object.freeze({ name: "Disks & volumes", target: "ms-settings:disksandvolumes" }),
  Object.freeze({ name: "Date & time", target: "ms-settings:dateandtime" }),
  Object.freeze({ name: "Region", target: "ms-settings:regionformatting" }),
  Object.freeze({ name: "Language", target: "ms-settings:keyboard" }),
  Object.freeze({ name: "Speech", target: "ms-settings:speech" }),
  Object.freeze({ name: "Add display language", target: "ms-settings:regionlanguage-adddisplaylanguage" }),
  Object.freeze({ name: "Language options", target: "ms-settings:regionlanguage-languageoptions" }),
  Object.freeze({ name: "Set display language", target: "ms-settings:regionlanguage-setdisplaylanguage" }),
  Object.freeze({ name: "Activation", target: "ms-settings:activation" }),
  Object.freeze({ name: "Delivery Optimization", target: "ms-settings:delivery-optimization" }),
  Object.freeze({ name: "Find My Device", target: "ms-settings:findmydevice" }),
  Object.freeze({ name: "For developers", target: "ms-settings:developers" }),
  Object.freeze({ name: "Recovery", target: "ms-settings:recovery" }),
  Object.freeze({ name: "Launch Security Key Enrollment", target: "ms-settings:signinoptions-launchsecuritykeyenrollment" }),
  Object.freeze({ name: "Troubleshoot", target: "ms-settings:troubleshoot" }),
  Object.freeze({ name: "Windows Security", target: "ms-settings:windowsdefender" }),
  Object.freeze({ name: "Windows Insider Program", target: "ms-settings:windowsinsider" }),
  Object.freeze({ name: "Windows Update", target: "ms-settings:windowsupdate" }),
  Object.freeze({ name: "Provisioning", target: "ms-settings:workplace-provisioning" }),
  Object.freeze({ name: "Repair token", target: "ms-settings:workplace-repairtoken" }),
  Object.freeze({ name: "Windows Anywhere", target: "ms-settings:windowsanywhere" }),
] as const)

export const SYSTEM_COMMAND_CATALOG: Readonly<Record<LauncherOsPlatform, readonly LauncherSystemCommandRow[]>> = Object.freeze({
  Linux: Object.freeze([
    Object.freeze({ command: 'empty-trash', details: "Empty the current account's desktop trash", imageKey: 'system-command-trash', name: 'Empty Trash' }),
  ]),
  macOS: Object.freeze([
    Object.freeze({ command: 'shutdown', details: 'Shut down this Mac', imageKey: 'system-command-macos-shutdown', name: 'Shut Down' }),
    Object.freeze({ command: 'restart', details: 'Restart this Mac', imageKey: 'system-command-macos-restart', name: 'Restart' }),
    Object.freeze({ command: 'log-out', details: 'Log out the current account', imageKey: 'system-command-macos-logout', name: 'Log Out' }),
    Object.freeze({ command: 'sleep', details: 'Put this Mac to sleep', imageKey: 'system-command-macos-sleep', name: 'Sleep' }),
    Object.freeze({ command: 'lock', details: 'Lock this Mac', imageKey: 'system-command-macos-lock', name: 'Lock' }),
    Object.freeze({ command: 'empty-trash', details: "Empty the current account's Trash", imageKey: 'system-command-trash', name: 'Empty Trash' }),
  ]),
  Windows: Object.freeze([
    Object.freeze({ command: 'shutdown', details: 'Shut down this PC', imageKey: 'system-command-windows', name: 'Shut Down' }),
    Object.freeze({ command: 'restart', details: 'Restart this PC', imageKey: 'system-command-windows', name: 'Restart' }),
    Object.freeze({ command: 'log-out', details: 'Sign out the current account', imageKey: 'system-command-windows', name: 'Sign Out' }),
    Object.freeze({ command: 'lock', details: 'Lock this PC', imageKey: 'system-command-windows', name: 'Lock' }),
    Object.freeze({ command: 'sleep', details: 'Put this PC to sleep', imageKey: 'system-command-windows', name: 'Sleep' }),
    Object.freeze({ command: 'hibernate', details: 'Hibernate this PC', imageKey: 'system-command-windows', name: 'Hibernate' }),
    Object.freeze({ command: 'empty-trash', details: "Empty the current account's Recycle Bin", imageKey: 'system-command-trash', name: 'Empty Recycle Bin' }),
  ]),
})

export const UELI_COMMAND_CATALOG: readonly LauncherUeliCommandRow[] = Object.freeze([
  Object.freeze({ command: 'quit', description: 'Quit TockTeam', id: 'ueliCommand:quit', name: 'Quit TockTeam', protected: true }),
  Object.freeze({ command: 'openSettings', description: 'Open TockTeam settings', id: 'ueliCommand:settings', name: 'Open TockTeam settings' }),
  Object.freeze({ command: 'openExtensions', description: 'Browse TockTeam extensions', id: 'ueliCommand:extensions', name: 'Browse TockTeam extensions' }),
  Object.freeze({ command: 'centerWindow', description: 'Center TockLauncher window', id: 'ueliCommand:centerWindow', name: 'Center TockLauncher window' }),
  Object.freeze({ command: 'rescanExtensions', description: 'Rescan TockLauncher extensions', id: 'ueliCommand:rescanExtensions', name: 'Rescan extensions' }),
  Object.freeze({ command: 'disableHotkey', description: 'Disable hotkey', id: 'ueliCommand:toggleHotkey', name: 'Disable hotkey' }),
])

export function osExtensionSupported(id: string, platform: LauncherOsPlatform): boolean {
  switch (id) {
    case 'AppearanceSwitcher': return platform === 'macOS' || platform === 'Windows'
    case 'SystemCommands': return true
    case 'SystemSettings': return platform === 'macOS' || platform === 'Windows'
    case 'UeliCommand': return true
    case 'WindowsControlPanel': return platform === 'Windows'
    default: return false
  }
}

export function systemCommandId(name: string): string {
  return `SystemCommand[${Buffer.from(name, 'utf8').toString('hex')}]`
}
