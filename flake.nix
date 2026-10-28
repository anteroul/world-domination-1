{
  description = "World Domination (2003) in the browser via Ruffle, served with Node.js";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        site = pkgs.runCommand "world-domination-1-site" { } ''
          mkdir -p $out/swf
          cp ${./index.html} $out/index.html
          cp ${./style.css} $out/style.css
          cp ${./launcher.js} $out/launcher.js
          cp ${./profile.js} $out/profile.js
          cp ${./swf/WorldDomination1.swf} $out/swf/WorldDomination1.swf
          cp ${./server.js} $out/server.js
          cp ${./favicon.svg} $out/favicon.svg
        '';

        world-domination-1 = pkgs.writeShellApplication {
          name = "world-domination-1";
          runtimeInputs = [ pkgs.nodejs ];
          text = ''
            # The site lives in the read-only Nix store; keep scores elsewhere.
            export WD1_DB="''${WD1_DB:-''${XDG_DATA_HOME:-$HOME/.local/share}/world-domination-1/scores.sqlite}"
            exec node ${site}/server.js "$@"
          '';
        };
      in
      {
        packages = {
          default = world-domination-1;
          inherit site;
        };

        apps.default = flake-utils.lib.mkApp { drv = world-domination-1; };

        devShells.default = pkgs.mkShell {
          packages = [ pkgs.nodejs ];
        };
      });
}
