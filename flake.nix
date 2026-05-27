# flake.nix (in your electron project)
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      fhs = pkgs.buildFHSEnv {
        name = "electron-dev";
        targetPkgs = pkgs: with pkgs; [
          dbus.lib
          atk
          at-spi2-atk
          at-spi2-core
          cups.lib
          cairo
          gtk3
          pango
          libXcomposite
          libXdamage
          libgbm
          alsa-lib
          systemd  # libudev
          nss
          nspr
          libdrm
          mesa
        ];
        runScript = "bash";
      };
    in {
      devShells.${system}.default = fhs.env;
    };
}