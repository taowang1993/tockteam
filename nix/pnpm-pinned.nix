# Integrity-pinned pnpm CLI used for deterministic DSH and TockTeam installs.

{ lib
, stdenvNoCC
, fetchurl
, nodejs_24
, makeWrapper
, dshSourceSpec
}:

let
  version = lib.removePrefix "pnpm@" dshSourceSpec.packageManager;
in
assert lib.hasPrefix "pnpm@" dshSourceSpec.packageManager;
stdenvNoCC.mkDerivation {
  pname = "pnpm";
  inherit version;

  src = fetchurl {
    url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
    hash = dshSourceSpec.pnpmIntegrity;
  };
  sourceRoot = "package";

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/lib/pnpm
    cp -r . $out/lib/pnpm/
    makeWrapper ${nodejs_24}/bin/node $out/bin/pnpm \
      --add-flags "$out/lib/pnpm/bin/pnpm.cjs"
    runHook postInstall
  '';
}
