Short description

This directory contains an Alpine APK package for `modbus2mqtt` and helper scripts that perform the package build and a container-based runtime check.

Important: disabled `check()` phase

In `APKBUILD` you will find:

  options="!check"

This disables the default `check()` phase of `abuild`. Reasoning:
- The application tests (Jest and Cypress) are executed in the GitHub Actions pipeline.
- The CI runs in two stages: tests (before creating the npm artifacts) and a subsequent package-installation check against the generated `.apk`.
- Running a local `check()` inside the `abuild` run would either run tests at the wrong time or be redundant.

How the keys and CI setup work

1) Local preparation (developer machine)

- Export the abuild keys into the environment (the files contain the private / public PEM contents). The packaging scripts now expect the keys in the variables `PACKAGER_PRIVKEY` / `PACKAGER_PUBKEY` (these names are used by `abuild`). For backwards compatibility the CI workflow also accepts `ABUILD_PRIVKEY` / `ABUILD_PUBKEY` and falls back to them if `PACKAGER_*` are not set:

```sh
# preferred (recommended)
export PACKAGER_PRIVKEY="$(cat ~/.abuild/builder-6904805d.rsa)"
export PACKAGER_PUBKEY="$(cat ~/.abuild/builder-6904805d.rsa.pub)"

# legacy fallback (supported by the workflow but prefer PACKAGER_*)
export ABUILD_PRIVKEY="$(cat ~/.abuild/builder-6904805d.rsa)"
export ABUILD_PUBKEY="$(cat ~/.abuild/builder-6904805d.rsa.pub)"
```

- Build and test locally:

```sh
cd alpine-package/modbus2mqtt
chmod +x build.sh build-and-test-image.sh
./build-and-test-image.sh
```

`build.sh` starts a temporary Alpine container, writes the keys to `/home/builder/.abuild`, runs `npm build` and `abuild -r` as the builder user, and copies the generated packages into `./packages`.

`build-and-test-image.sh` then builds `Dockerfile.test`, installs the generated `.apk` into the test image and starts a container which is checked via HTTP request (`http://localhost:3000/`).

2) GitHub Actions

- Add the following secrets to the repository (prefer the PACKAGER_* names):
  - `PACKAGER_PRIVKEY` — content of the private key file (including BEGIN/END lines)
  - `PACKAGER_PUBKEY` — content of the public key file

- For backwards compatibility the workflow also accepts `ABUILD_PRIVKEY` / `ABUILD_PUBKEY` and will use them when `PACKAGER_*` are not present.

- The workflow `.github/workflows/build-and-test.yml` injects these secrets into the job environment and runs `./build-and-test-image.sh`.

Notes and troubleshooting

- Multi-line secrets: GitHub Actions supports multi-line secret values. Make sure PEM headers (`-----BEGIN RSA PRIVATE KEY-----`) and footers are included.
- If `abuild` reports signature errors or warnings about missing checks, this is expected in CI — the produced package is installed with `--allow-untrusted`. The workflow validates functionality, not PKI signatures.
- If npm build / tsc errors occur, run `npm run build` locally and verify Node version (the workflow uses Node 18).

Contact

If you have questions about the CI configuration or packaging problems, please open an issue or contact me directly.
