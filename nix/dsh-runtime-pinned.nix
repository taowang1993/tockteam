# Build the pinned deepseek-harness runtime from the npm release recorded in
# this repository's dsh-source.json. The npm package ships compiled `lib/`
# and `config/`, so only the dependency graph needs installation.

{ lib
, stdenv
, callPackage
, fetchPnpmDeps
, fetchurl
, nodejs_24
, pnpmConfigHook
, runCommand
, dshSourceSpec
}:

assert dshSourceSpec.source == "npm";

let
  pinnedPnpm = callPackage ./pnpm-pinned.nix { inherit dshSourceSpec; };
  tarball = fetchurl {
    url = dshSourceSpec.tarball;
    hash = dshSourceSpec.integrity;
  };

  # pnpm install needs the lockfile and supply-chain policy beside
  # package.json; the npm tarball carries neither repository file.
  src = runCommand "dsh-runtime-pinned-src" { } ''
    mkdir -p $out
    tar -xzf ${tarball} -C $out --strip-components=1
    cp ${../.npmrc} $out/.npmrc
    cp ${../scripts}/dsh-runtime-${dshSourceSpec.version}-lock.yaml $out/pnpm-lock.yaml
    printf '%s\n' \
      'packages:' \
      '  - .' \
      "" \
      'minimumReleaseAgeExclude:' \
      "  - '@deepseek-ai/*'" \
      > $out/pnpm-workspace.yaml
  '';
in

stdenv.mkDerivation rec {
  pname = "dsh-runtime-pinned";
  version = dshSourceSpec.version;

  inherit src;

  pnpmDeps = fetchPnpmDeps {
    inherit pname version src;
    fetcherVersion = 4;
    hash = "sha256-cjSI0PFYvpUGJZEfuuL6/4JCvK4V+yf/psEAfrZ9FRQ=";
  };

  nativeBuildInputs = [ nodejs_24 pinnedPnpm pnpmConfigHook ];

  buildPhase = ''
    runHook preBuild
    pnpm install --frozen-lockfile --ignore-scripts

    # Profiles live outside this package, so expose pnpm's complete hoisted
    # graph and record it for the DSH loader's package-resolution fallback.
    hoist=node_modules/.pnpm/node_modules
    for source in "$hoist"/*; do
      name=$(basename "$source")
      if [[ "$name" == @* ]]; then
        mkdir -p "node_modules/$name"
        for scopedSource in "$source"/*; do
          scopedName=$(basename "$scopedSource")
          target="node_modules/$name/$scopedName"
          if [ ! -e "$target" ] && [ ! -L "$target" ]; then
            ln -s "../.pnpm/node_modules/$name/$scopedName" "$target"
          fi
        done
      else
        target="node_modules/$name"
        if [ ! -e "$target" ] && [ ! -L "$target" ]; then
          ln -s ".pnpm/node_modules/$name" "$target"
        fi
      fi
    done
    node --input-type=module <<'NODE'
    import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    const dependencies = { ...manifest.dependencies }
    const hoist = 'node_modules/.pnpm/node_modules'
    const record = path => {
      const dependency = JSON.parse(readFileSync(join(realpathSync(path), 'package.json'), 'utf8'))
      dependencies[dependency.name] = dependency.version
    }
    for (const entry of readdirSync(hoist, { withFileTypes: true })) {
      if (entry.name === '.bin') continue
      const path = join(hoist, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(path)) record(join(path, scoped))
      } else record(path)
    }
    manifest.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    writeFileSync('package.json', JSON.stringify(manifest, undefined, 2) + '\n')
    NODE
    node ${../scripts/settings-boundary.mjs} "$PWD"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/dsh
    cp -r lib config package.json node_modules $out/lib/dsh/
    runHook postInstall
  '';

  meta = with lib; {
    description = "Pinned DeepSeek Harness npm runtime (${dshSourceSpec.version})";
    license = licenses.mit;
    platforms = platforms.unix;
  };
}
