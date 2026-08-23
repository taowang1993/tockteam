import type { Context } from '@deepseek-ai/cordis';
export declare const name = "tockbot-note-desktop";
/**
 * Every native owner is supplied by Desktop 0.1.6 and Runtime 0.1.2. This row
 * deliberately contributes no second bridge or authority; it only makes the
 * complete Desktop dependency set atomic and fail-closed.
 */
export declare const inject: readonly ["tockTeamSurface", "tockTeamDesktopPicker", "tockTeamDesktopDispatch", "tockTeamDesktopPopOut", "tockTeamDesktopMicrophone", "tockTeamDesktopPrintExport", "tockTeamDesktopVaultSelection", "tockTeamDesktopReveal", "noteVault"];
export declare function apply(ctx: Context): void;
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts';
//# sourceMappingURL=index.d.ts.map