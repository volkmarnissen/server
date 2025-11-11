Short description

This directory contains the Alpine APK packaging for `modbus2mqtt` plus helper scripts to build the package and run a container-based runtime check.

Node ↔ Alpine version coupling

To avoid ABI issues with native modules (e.g. `@serialport/bindings-cpp`), the build uses the local Node.js major version to select a matching Alpine release.

- Node 22 → Alpine 3.22
- Node 20 → Alpine 3.20
- Node 18 → Alpine 3.18

`build.sh` determines the Alpine version automatically and writes it to `build/alpine.env` (e.g. `ALPINE_VERSION=3.22`). `build-and-test-image.sh` reads this file and uses the same version for the test image. Override by setting `ALPINE_VERSION=3.xx` explicitly.

Important: disabled `check()` phase

In `APKBUILD` you will find:

  options="!check"

Rationale:
- Jest/Cypress tests run in CI separately.
- CI validates both before package creation and after installing the generated `.apk`.
- Running `check()` inside `abuild` would be redundant and possibly at the wrong time.

How the keys and CI setup work

1) Local preparation (developer machine)

- Export the abuild private key into the environment. The packaging script expects the key in the variable `PACKAGER_PRIVKEY` (this name is used by `abuild`). The public key will be automatically derived from the private key:

```sh
export PACKAGER_PRIVKEY="$(cat ~/.abuild/builder-6904805d.rsa)"
```

- Build and test locally:

```sh
cd alpine/package/modbus2mqtt
chmod +x build.sh build-and-test-image.sh
./build-and-test-image.sh
```

What the scripts do

- `build.sh`
  - verifies abuild private key in the environment (`PACKAGER_PRIVKEY`)
  - derives the public key automatically using `openssl rsa -pubout`
  - derives (or uses) `ALPINE_VERSION`, persists it into `build/alpine.env`
  - starts a temporary Alpine container (`alpine:${ALPINE_VERSION}`)
  - configures repositories, installs build deps, runs `abuild -r`
  - copies produced packages into `../../repo`

- `build-and-test-image.sh`
  - calls `build.sh`
  - reads `build/alpine.env` and builds the test image with `FROM alpine:${ALPINE_VERSION}`
  - installs the freshly built `.apk` and launches the service via s6-overlay
  - performs a healthcheck on `http://localhost:3000/`
```

`build.sh` starts a temporary Alpine container, writes the keys to `/home/builder/.abuild`, runs `npm build` and `abuild -r` as the builder user, and copies the generated packages into `./packages`.

`build-and-test-image.sh` then builds `Dockerfile.test`, installs the generated `.apk` into the test image and starts a container which is checked via HTTP request (`http://localhost:3000/`).

2) GitHub Actions

- Add the following credential to GitHub:
  - Secret (Repository secret): `PACKAGER_PRIVKEY` — content of the private key file (including BEGIN/END lines)

- Setup: Repository Settings → Secrets and variables → Actions → Secrets → New repository secret
  - Name: `PACKAGER_PRIVKEY`
  - Value: Full content of `~/.abuild/builder-6904805d.rsa`

- The build script will automatically generate the public key internally using `openssl rsa -pubout`.

- The workflow `.github/workflows/build-and-test.yml` injects these secrets into the job environment and runs `./build-and-test-image.sh`.

Notes and troubleshooting

- Multi-line secrets: GitHub Actions supports multi-line secret values. Make sure PEM headers (`-----BEGIN RSA PRIVATE KEY-----`) and footers are included.
- If `abuild` reports signature errors or warnings about missing checks, this is expected in CI — the produced package is installed with `--allow-untrusted`. The workflow validates functionality, not PKI signatures.
- If npm build / tsc errors occur, run `npm run build` locally and verify Node version or set `ALPINE_VERSION` explicitly.

Contact

If you have questions about the CI configuration or packaging problems, please open an issue or contact me directly.
