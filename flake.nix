{
  description = "TockTeam: installable Desktop, Web, and TUI distributions";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
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
            inherit pkgs dshSourceSpec;
          };
        in
        rec {
          # Full distribution: Desktop, Web, and TUI through one launcher.
          tockteam = mkTockTeam { surface = "full"; };
          tockteam-desktop = tockteam;

          # Layered distributions without Electron.
          tockteam-web = mkTockTeam { surface = "web"; };
          tockteam-tui = mkTockTeam { surface = "tui"; };

          # Compatibility aliases for the former opt-in repository pin.
          tockteam-pinned = tockteam;
          tockteam-desktop-pinned = tockteam;
          tockteam-web-pinned = tockteam-web;
          tockteam-tui-pinned = tockteam-tui;

          default = tockteam;
        });
    };
}
