<p align="center">
    <img
        src="https://github.com/gaiaBuildSystem/.github/blob/main/profile/GaiaNewLogoCircle.png?raw=true"
        height="212"
    />
</p>

# Gaia Core

Gaia Core is the build engine for the Gaia Build System. Everything starts here.

## Building DeimOS

Deimos is the reference distribution. It is minimal, and exists to test the build system itself.

To create an image:

```bash
./bitcook --buildPath /<absolute path for the actual workdir> --distro distro-ref-amd64.json --noCache --installHostDeps
```

> [!WARNING]
The `--buildPath` argument is mandatory and must be an absolute path. Never pass the path to a `build-<distro>` folder; the build system creates that folder inside the path you provide.

> [!WARNING]
The `--distro` argument is mandatory and must be a relative path to a distro JSON file. An absolute path will not work.

> [!WARNING]
The `--noCache` argument is mandatory for the first build. It will force the build to not use any cache and build everything from scratch.

> [!WARNING]
The `--installHostDeps` argument is recommended for the first build. It installs host dependencies inside the build container. This is a one-time operation that gets cached for future builds, so leave it in.

The DeimOS images that this repo builds are for:

- qemu-x86-64
- qemu-arm64

Check the other repositories for DeimOS support on other machines. The distro descriptions with `distro-ref-<machine>.json` files are implemented in their vendor repositories.

### bitcook Arguments

The `bitcook` script (which wraps `gaia.ts`) accepts these arguments:

| Argument | Description |
|----------|-------------|
| `--buildPath <path>` | The absolute path where the build distro folder will be generated to store artifacts |
| `--clean` | Clean the build |
| `--dev` | Run in development mode; the fetch step will be skipped |
| `--distro <path>` | Path to the `distro.json` file (relative to the current working directory) |
| `-h`, `--help` | Shows the help message |
| `--installHostDeps` | Automatically install host dependencies inside the build container |
| `--kernelEdge` | Build the kernel recipe using its `customData.ref.edge` reference (and a `$MACHINE_defconfig_edge.template` if the recipe provides one) instead of the default stable version |
| `--noCache` | Build from scratch without using any cache |
| `--onlySbom` | Just generate SBOM files (requires a prior build with `--sbom`) |
| `--overrideEnv` | Use the environment variables set on the shell instead of the ones from the cookbook |
| `--recipe <name>` | Build only the specified recipe |
| `--sbom` | Generate SBOM (Software Bill of Materials) files for the built artifacts |
| `--step <step>` | Execute a specific build step |
| `--verbose` | Print all the parsed recipe objects in JSON format |
| `-v`, `--version` | Shows the Gaia version |

## Build Command Examples

```
./gaia/bitcook --buildPath /your/workdir --distro ./gaia/distro-ref-qemux86-64.json --noCache --installHostDeps
```

The `bitcook` command is the wrapper that should be called, not the `./gaia/scripts/bitcook/gaia.ts`.

The recommended PWD to run the command is the root of the workdir, not the root of the Gaia repository.

## Adding a New Platform or Board

To add a new vendor platform or a new board to an existing cookbook, follow the guide in [docs/platforms.md](docs/platforms.md). It covers creating the cookbook directory structure, schemas, distro-ref manifests, and all required recipes (bootloader, firmware, kernel, fstab) with working Xonsh script examples.

## Setup Multi-Cookbook Build

> [!WARNING]
This depends on having Docker and Docker compose plugin installed.

Some targets need recipes from additional cookbooks. Use the Gaia `repo` util with a `manifest.json` file to pull them in. The schema:

```typescript
interface Manifest {
    name: string,
    description: string,
    maintainer: string,
    repositories: Repository[]
}

interface Repository {
    name: string
    path: string
    url: string
    revision: string
}
```

Example `manifest.json`:

```json
{
    "name": "Rasp DeimOS",
    "description": "Raspberry Pi DeimOS repo cookbook manifest",
    "maintainer": "matheus@castello.eng.br",
    "repositories": [
        {
            "name": "Cookbook RPi",
            "path": "cookbook-rpi",
            "url": "https://github.com/gaiaBuildSystem/cookbook-rpi.git",
            "revision": "525951ad2d5f0282dc396125205674eed3dfc145"
        }
    ]
}
```

The manifest file must be in the root of a folder where you have cloned the Gaia Core repository. Run:

```bash
./gaia/scripts/init
```

This command will build the dev container and clone the repositories specified in the `manifest.json` file.

# Ecosystem

## Gaia Build System

Gaia is a build system that creates Debian based Linux distributions. It uses Debian packages and Docker/Podman Debian containers to build the system and produce reproducible builds.

The project has these components:

### Gaia Core

https://github.com/gaiaBuildSystem/gaia

Gaia Core is the main component. It parses recipe metadata, runs build tasks, and outputs artifacts. Written in TypeScript, it runs under Deno and uses container images to build the system.

### DeimOS

https://github.com/gaiaBuildSystem/gaia

The DeimOS is the Debian based Linux distribution that Gaia builds as reference.
The name is a play on words with "Debian" and "OS" and a reference to the Greek god "Deimos".

### PhobOS

https://github.com/gaiaBuildSystem/cookbook-phobos

PhobOS is the Debian based and Toradex Torizon compatible Linux distribution that Gaia builds. The name is a reference to the Greek god, and brother of Deimos, Phobos.

PhobOS is more complex than DeimOS, as it has to be compatible with the Toradex Torizon ecosystem. It uses OSTree to manage the system rootfs, Aktualizr to handle updates through Torizon OTA and comes with a Docker container runtime.

> Torizon™ is a registered trademark of Toradex Group AG. Gaia project does not
talk on behalf of Toradex or on behalf of any Toradex product.

### PergamOS

https://github.com/gaiaBuildSystem/Pergamos

PergamOS is the namespace for the Debian based container images library of the Gaia project. A collection of Debian based images used to build and as a base for applications.

The name references the ancient city of Pergamon, known for its library, the second largest in the ancient world after the Library of Alexandria.
