# TockTeam package builder over the npm runtime pinned by dsh-source.json.

{ pkgs, dshSourceSpec }:

{ surface # "full" | "web" | "tui"
}:

let
  lib = pkgs.lib;

  isFull = surface == "full";
  includesSidebar = surface != "tui";
  includesWeb = surface != "tui";
  includesTui = surface != "web";

  dshRuntime = pkgs.callPackage ./dsh-runtime-pinned.nix { inherit dshSourceSpec; };
  pinnedPnpm = pkgs.callPackage ./pnpm-pinned.nix { inherit dshSourceSpec; };

  # ---------------------------------------------------------------------------
  # TockTeam front-end bundle. The same build produces all surface adapters;
  # the outer derivation controls which launchers and renderers are exposed.
  cleanSource = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let
        base = baseNameOf path;
        relativePath = lib.removePrefix "${toString ../.}/" (toString path);
      in !(lib.hasSuffix ".nix" base)
      && base != "flake.lock"
      && base != "release"
      && base != ".stage"
      && base != ".cache"
      && base != "node_modules"
      && relativePath != "dist"
      && !(lib.hasPrefix "dist/" relativePath)
      && relativePath != "nix"
      && !(lib.hasPrefix "nix/" relativePath);
  };

  betterSidebarSrc = pkgs.fetchFromGitHub {
    owner = "omdsh-dev";
    repo = "DSH-better-sidebar";
    rev = "9e1a03452794532cda1f6ac677b72579dff48dfc";
    hash = "sha256-s0QaSJwyy+x69DIjMdoZVwoIIziczP3qTvhmf4w0AEo=";
  };
  tuiSrc = pkgs.fetchFromGitHub {
    owner = "ccch1mneyyy";
    repo = "dsh-TUI";
    rev = "8f1444a2627fab01682e679a0e44de8989b66f77";
    hash = "sha256-uGCwkBgZojLuLcDCuESiPpgIG9ZA0kbSUqJmALsnl7M=";
  };
  tuiAuthSrc = pkgs.fetchFromGitHub {
    owner = "ccch1mneyyy";
    repo = "dsh-auth";
    rev = "94fdf81e775e8d884af4dfb64a94b617c3751936";
    hash = "sha256-gSkDJnjm4N2qOqnEstDU12S4D9FvomrxB9UVwlFN2M4=";
  };
  tuiEcosystemSpecSrc = pkgs.fetchFromGitHub {
    owner = "T-Auto";
    repo = "dsh-ecosystem-spec";
    rev = "d28c267fe7fd775428ec2dccd65b0b7efd4dacee";
    hash = "sha256-hhp/UUMo2engw0SyrB0Gq6Xc6BUYgvEmYh0F4OBdZEw=";
  };
  tuiStdSrc = pkgs.fetchFromGitHub {
    owner = "Yan-Zero";
    repo = "dsh-std";
    rev = "614dfa1ac168db79fcf4577cf0ebb34e2e3b944b";
    hash = "sha256-aJEykWAXEKTUsNte51+ZEhFAgLT6QNNplNZTNPhgb00=";
  };

  # fetchPnpmDeps and the real build MUST see the same workspace graph.
  source = pkgs.runCommand "tockteam-source" { } ''
    cp -r ${cleanSource} $out
    chmod -R u+w $out
    rm -rf $out/upstream/DSH-better-sidebar $out/upstream/dsh-TUI
    mkdir -p $out/upstream
    cp -r ${betterSidebarSrc} $out/upstream/DSH-better-sidebar
    cp -r ${tuiSrc} $out/upstream/dsh-TUI
    chmod -R u+w $out/upstream/dsh-TUI
    rm -rf $out/upstream/dsh-TUI/dsh-auth \
      $out/upstream/dsh-TUI/dsh-ecosystem-spec \
      $out/upstream/dsh-TUI/vendor/dsh-std
    cp -r ${tuiAuthSrc} $out/upstream/dsh-TUI/dsh-auth
    mkdir -p $out/upstream/dsh-TUI/vendor
    cp -r ${tuiEcosystemSpecSrc} $out/upstream/dsh-TUI/dsh-ecosystem-spec
    cp -r ${tuiStdSrc} $out/upstream/dsh-TUI/vendor/dsh-std
  '';

  tockTeamBundle = pkgs.stdenv.mkDerivation rec {
    pname = "tockteam-${surface}-bundle";
    version = (builtins.fromJSON (builtins.readFile ../package.json)).version;

    src = source;

    pnpmDeps = pkgs.fetchPnpmDeps {
      inherit pname version src;
      fetcherVersion = 4;
      hash = "sha256-U9XM2reAwPKuaXeuFFKUF8l+ECtSJRvuVjKikCGv/iA=";
    };

    nativeBuildInputs = [
      pkgs.nodejs_24
      pinnedPnpm
      pkgs.pnpmConfigHook
    ];

    # The upstream build scripts (esbuild) are what produce dist/.
    buildPhase = ''
      runHook preBuild

      # The full release pipeline (build:dsh + stage:dsh) is skipped on purpose:
      # the pinned Nix DSH runtime replaces the staged copy. TockTutor's
      # committed outputs are verified rather than rebuilt from a second lock.
      ${lib.optionalString isFull ''
        node scripts/tocktutor-build-manifest.mjs
      ''}
      ${lib.optionalString includesTui ''
        (cd upstream/dsh-TUI && node scripts/prepare-guard.mjs)
        pnpm --filter @dsh-std/core --filter @dsh-std/manifest \
          --filter @dsh-std/connection --filter @dsh-std/presentation \
          --filter @dsh-std/command --filter @dsh-std/storage \
          --filter @dsh-std/messages --reporter append-only -r exec tsdown
        node upstream/dsh-TUI/scripts/clean-lib.mjs
        node node_modules/typescript/bin/tsc -p upstream/dsh-TUI/dsh-auth/tsconfig.json
        node node_modules/typescript/bin/tsc -p upstream/dsh-TUI/tsconfig.json
      ''}
      node scripts/build.mjs

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/lib/tockteam
      cp -r dist $out/lib/tockteam/
      cp -r bin $out/lib/tockteam/
      cp package.json client.d.ts host.d.ts $out/lib/tockteam/

      # Carry package manifests so the final package can register the selected
      # surfaces into dsh-runtime/node_modules (mirrors stage-dsh.mjs).
      mkdir -p $out/lib/tockteam/manifests
      cp package.json $out/lib/tockteam/manifests/desktop.json
      for p in plugins/*/package.json; do
        name=$(basename $(dirname "$p"))
        cp "$p" "$out/lib/tockteam/manifests/$name.json"
      done
      cp web/package.json $out/lib/tockteam/manifests/web.json
      ${lib.optionalString includesTui ''
        cp upstream/dsh-TUI/package.json $out/lib/tockteam/manifests/tui-renderer.json
      ''}

      ${lib.optionalString isFull ''
        mkdir -p $out/lib/tockteam/tocktutor-packages/ui
        cp plugins/ui/package.json $out/lib/tockteam/tocktutor-packages/ui/package.json
        cp -r plugins/ui/lib plugins/ui/src $out/lib/tockteam/tocktutor-packages/ui/
        for package in plugins/tocktutor/packages/*; do
          name=$(basename "$package")
          target="$out/lib/tockteam/tocktutor-packages/$name"
          mkdir -p "$target"
          cp "$package/package.json" "$target/package.json"
          cp "$package/package.json" "$out/lib/tockteam/manifests/$name.json"
          for artifact in lib dist cordis.patch.yml index.js inspection.js inspection.d.ts LICENSE README.md PENNIVO_PROVENANCE.md THIRD_PARTY_NOTICES; do
            if [ -e "$package/$artifact" ]; then
              cp -r "$package/$artifact" "$target/$artifact"
            fi
          done
        done
      ''}

      ${lib.optionalString includesTui ''
        # Copy the pinned renderer and apply the guarded TockTeam adaptation.
        mkdir -p $out/lib/tockteam/tui-renderer
        cp -r upstream/dsh-TUI/lib upstream/dsh-TUI/dsh-ecosystem-spec \
          upstream/dsh-TUI/presets upstream/dsh-TUI/cordis.patch.yml \
          upstream/dsh-TUI/cordis.yml \
          upstream/dsh-TUI/LICENSE $out/lib/tockteam/tui-renderer/
        node -e "import('./scripts/tui-upstream-adapter.mjs').then(({ adaptTuiRendererPackage }) => adaptTuiRendererPackage('$out/lib/tockteam/tui-renderer'))"
      ''}

      # Keep native and exact-version dependencies package-local, matching the
      # staged distribution instead of substituting DSH's shared versions.
      ${lib.optionalString includesSidebar ''
        mkdir -p $out/lib/tockteam/package-deps/better-sidebar-runtime
        ${pkgs.python3}/bin/python3 ${./collect-deps.py} \
          node_modules/.pnpm \
          plugins/better-sidebar-runtime/package.json \
          $out/lib/tockteam/package-deps/better-sidebar-runtime
        PYTHON=${pkgs.python3}/bin/python3 ${pkgs.nodejs_24}/bin/node \
          ${pinnedPnpm}/lib/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js \
          rebuild --directory $out/lib/tockteam/package-deps/better-sidebar-runtime/node-pty \
          --nodedir=${pkgs.nodejs_24}
      ''}

      # Collect runtime dependency closures that the DSH runtime may not ship.
      mkdir -p $out/lib/tockteam/extra-deps
      ${lib.optionalString includesTui ''
        mkdir -p $out/lib/tockteam/package-deps/tui-renderer
        for name in command connection core manifest messages presentation storage; do
          for root in extra-deps package-deps/tui-renderer; do
            target="$out/lib/tockteam/$root/@dsh-std/$name"
            mkdir -p "$(dirname "$target")"
            cp -r "upstream/dsh-TUI/vendor/dsh-std/packages/$name" "$target"
            chmod -R u+w "$target"
            rm -rf "$target/node_modules" "$target/tests"
            ln -s ../.. "$target/node_modules"
          done
        done
        # Keep the renderer's React 19 graph away from the Web runtime's React 18.
        ${pkgs.python3}/bin/python3 ${./collect-deps.py} \
          node_modules/.pnpm \
          upstream/dsh-TUI/package.json \
          $out/lib/tockteam/package-deps/tui-renderer
        auth=$out/lib/tockteam/package-deps/tui-renderer/@deepseek-harness-tui/dsh-auth
        mkdir -p "$(dirname "$auth")"
        cp -r upstream/dsh-TUI/dsh-auth "$auth"
        chmod -R u+w "$auth"
        rm -rf "$auth/node_modules" "$auth/src" "$auth/scripts" "$auth/tsconfig.json"
      ''}
      ${lib.optionalString isFull ''
        mkdir -p $out/lib/tockteam/package-deps/tockbot-note-runtime
        ${pkgs.python3}/bin/python3 ${./collect-deps.py} \
          node_modules/.pnpm \
          plugins/tocktutor/packages/tockbot-note-runtime/package.json \
          $out/lib/tockteam/package-deps/tockbot-note-runtime
        PYTHON=${pkgs.python3}/bin/python3 ${pkgs.nodejs_24}/bin/node \
          ${pinnedPnpm}/lib/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js \
          rebuild --directory $out/lib/tockteam/package-deps/tockbot-note-runtime/sqlite3 \
          --nodedir=${pkgs.nodejs_24}

        ${pkgs.python3}/bin/python3 ${./collect-deps.py} \
          node_modules/.pnpm \
          plugins/ui/package.json \
          $out/lib/tockteam/extra-deps
        for manifest in plugins/tocktutor/packages/*/package.json; do
          ${pkgs.python3}/bin/python3 ${./collect-deps.py} \
            node_modules/.pnpm \
            "$manifest" \
            $out/lib/tockteam/extra-deps
        done
      ''}

      runHook postInstall
    '';

    # Electron is supplied by nixpkgs only in the full outer package.
    env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  };

in
pkgs.stdenv.mkDerivation {
  pname = "tockteam-${if isFull then "desktop" else surface}";
  version = tockTeamBundle.version;

  dontUnpack = true;

  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/tockteam $out/bin

    # TockTeam built assets
    cp -r ${tockTeamBundle}/lib/tockteam/dist $out/lib/tockteam/dist
    cp ${tockTeamBundle}/lib/tockteam/package.json $out/lib/tockteam/package.json

    # DSH runtime
    mkdir -p $out/dsh-runtime
    cp -r ${dshRuntime}/lib/dsh/* $out/dsh-runtime/
    chmod -R u+w $out/dsh-runtime
    chmod +x $out/dsh-runtime/lib/bin.js || true

    # Node runtime: reuse the same nodejs that built the bundle. The DSH
    # runtime's HMR service requires --expose-internals (upstream releases
    # ship the flag baked into their launcher; we wrap node itself).
    mkdir -p $out/node-runtime/bin
    makeWrapper ${pkgs.nodejs_24}/bin/node $out/node-runtime/bin/node \
      --add-flags "--expose-internals"

    # Register TockTeam packages into dsh-runtime/node_modules so the DSH
    # profile loader can resolve them (mirrors installDesktopPackages in
    # scripts/stage-dsh.mjs).
    ${pkgs.python3}/bin/python3 ${./register-plugins.py} \
      ${tockTeamBundle}/lib/tockteam \
      $out/lib/tockteam/dist \
      $out/dsh-runtime \
      ${surface}

    # Copy plugin runtime dependencies that the DSH runtime does not ship
    # (e.g. schemastery for better-sidebar-runtime).
    if [ -d "${tockTeamBundle}/lib/tockteam/extra-deps" ]; then
      if [ -d "${tockTeamBundle}/lib/tockteam/extra-deps/.tockteam-pnpm-closure" ]; then
        cp -r "${tockTeamBundle}/lib/tockteam/extra-deps/.tockteam-pnpm-closure" \
          "$out/dsh-runtime/node_modules/"
      fi
      for dep in ${tockTeamBundle}/lib/tockteam/extra-deps/*; do
        [ -e "$dep" ] || continue
        name=$(basename "$dep")
        if [[ "$name" == @* ]]; then
          mkdir -p "$out/dsh-runtime/node_modules/$name"
          for scopedDep in "$dep"/*; do
            scopedName=$(basename "$scopedDep")
            target="$out/dsh-runtime/node_modules/$name/$scopedName"
            if [ ! -e "$target" ]; then
              cp -r "$scopedDep" "$target"
              chmod -R u+w "$target"
            fi
          done
        elif [ ! -e "$out/dsh-runtime/node_modules/$name" ]; then
          cp -r "$dep" "$out/dsh-runtime/node_modules/$name"
          chmod -R u+w "$out/dsh-runtime/node_modules/$name"
        fi
      done
    fi

    ${lib.optionalString includesSidebar ''
      ${pkgs.nodejs_24}/bin/node ${./smoke-native.cjs} $out/dsh-runtime ${surface}
    ''}

    # HMR is a development-time feature that requires --expose-internals;
    # the packaged runtime keeps it enabled (matching upstream releases).

    # tockteam launcher
    makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/tockteam \
      --add-flags "$out/lib/tockteam/dist/tockteam.js" \
      --set TOCKTEAM_WEB_ROOT "$out" \
      --set TOCKTEAM_TUI_ROOT "$out" \
      --set TOCKTEAM_SURFACES "${if isFull then "desktop,web,tui" else surface}" \
      ${lib.optionalString isFull ''
        --set TOCKTEAM_DESKTOP_APP "$out/bin/tockteam-desktop" \
      ''}

    ${lib.optionalString isFull ''
      # Electron wrapper. TOCKTEAM_RESOURCES_ROOT is required because loading
      # dist/main.js directly keeps app.isPackaged false under Nix.
      makeWrapper ${pkgs.electron_42}/bin/electron $out/bin/tockteam-desktop \
        --add-flags "$out/lib/tockteam/dist/main.js" \
        --set TOCKTEAM_RESOURCES_ROOT "$out" \
        --set TOCKTEAM_WEB_ROOT "$out"

      mkdir -p $out/share/applications
      cat > $out/share/applications/tockteam-desktop.desktop <<EOF
      [Desktop Entry]
      Name=TockTeam Desktop
      Exec=$out/bin/tockteam-desktop
      Type=Application
      Categories=Development;
      EOF
    ''}

    runHook postInstall
  '';

  meta = with lib; {
    description = "TockTeam ${if isFull then "full Desktop/Web/TUI" else if includesWeb then "Web" else "TUI"} distribution";
    homepage = "https://github.com/taowang1993/tockteam";
    license = licenses.mit;
    platforms = platforms.linux;
    mainProgram = "tockteam";
  };
}
