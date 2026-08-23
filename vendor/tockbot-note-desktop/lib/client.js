window.__ModuleLoader__.load({ id: "tockbot-note-desktop", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  TOCKTEAM_SURFACE_SERVICE: () => TOCKTEAM_SURFACE_SERVICE,
  apply: () => apply,
  assertDesktopSurface: () => assertDesktopSurface,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// src/guard.ts
var TOCKTEAM_SURFACE_SERVICE = "tockTeamSurface";
function assertDesktopSurface(value) {
  if (typeof value !== "object" || value === null || value.kind !== "desktop") {
    throw new Error("tockbot-note-desktop: TockTeam Desktop surface is required");
  }
}

// src/client-api.ts
var name = "tockbot-note-desktop";
var inject = [TOCKTEAM_SURFACE_SERVICE];
function apply(ctx) {
  assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
