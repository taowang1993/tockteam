{
  description = "TockTeam: installable Desktop, Web, and TUI distributions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    llm-agents = {
      url = "github:numtide/llm-agents.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, llm-agents }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;

      # The version of deepseek-harness pinned by this repository.
      dshSourceSpec = builtins.fromJSON (builtins.readFile ./dsh-source.json);
    in
    {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.pnpm
              pkgs.git
              pkgs.curl
              pkgs.python3 # node-gyp
              pkgs.pkg-config
            ];

            # pnpm install fetches its own electron; no nixpkgs electron here.
            shellHook = ''
              export TOCKTEAM_SOURCE_ROOT="$PWD"
            '';
          };
        });

      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          mkTockTeam = import ./nix/tockteam.nix {
            inherit pkgs system llm-agents dshSourceSpec;
          };
        in
        rec {
          # Full distribution: Desktop, Web, and TUI through one launcher.
          tockteam = mkTockTeam { surface = "full"; dshSource = "llm-agents"; };
          tockteam-desktop = tockteam;

          # Layered distributions without Electron.
          tockteam-web = mkTockTeam { surface = "web"; dshSource = "llm-agents"; };
          tockteam-tui = mkTockTeam { surface = "tui"; dshSource = "llm-agents"; };

          # Variants pinning the DSH runtime to this repo's dsh-source.json.
          tockteam-pinned = mkTockTeam { surface = "full"; dshSource = "pinned"; };
          tockteam-desktop-pinned = tockteam-pinned;
          tockteam-web-pinned = mkTockTeam { surface = "web"; dshSource = "pinned"; };
          tockteam-tui-pinned = mkTockTeam { surface = "tui"; dshSource = "pinned"; };

          # "nixpkgs" variants remain available through mkTockTeam once
          # pkgs.deepseek-harness lands (NixOS/nixpkgs#552467).

          default = tockteam;
        });
    };
}
