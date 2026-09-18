import type { Context } from '@deepseek-ai/cordis';
export declare const name = "tockbot-note-desktop";
/**
 * Desktop owns native authority and caller proof; Runtime owns vault authority.
 * This row contributes only their caller-bound TockTutor gateway.
 */
export declare const inject: readonly ["tockTeamSurface", "tockTeamDesktopCaller", "tockTeamDesktopPicker", "tockTeamDesktopPopOut", "tockTeamDesktopMicrophone", "tockTeamDesktopPrintExport", "tockTeamDesktopVaultSelection", "tockTeamDesktopReveal", "noteVault"];
export declare function apply(ctx: Context): void;
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts';
export * from './host-actions.ts';
//# sourceMappingURL=index.d.ts.map