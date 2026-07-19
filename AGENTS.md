<p align="center">
    <img
        src="https://github.com/gaiaBuildSystem/.github/blob/main/profile/GaiaNewLogoCircle.png?raw=true"
        height="212"
    />
</p>

# Gaia Core

Gaia Core is the origin, the beginning, the first. It is the core of the Gaia Build System.

## Building DeimOS

Deimos is the Gaia Build System's reference distribution. It is a minimal distribution that is used to test the Gaia Build System.

Run the following command to create an image:

```bash
./bitcook --buildPath /<absolute path to a build folder preference for the actual workdir> --distro distro-ref-amd64.json --noCache --installHostDeps
```

> [!WARNING]
The `--buildPath` argument is mandatory and must be an absolute path.

> [!WARNING]
The `--distro` argument is mandatory and must be a relative path to a distro json file.

> [!WARNING]
The `--noCache` argument is mandatory for the first build. It will force the build to not use any cache and build everything from scratch.

> [!WARNING]
The `--installHostDeps` argument is pretty much recommended for the first build. As we support build inside a container it will install the host dependencies inside the container. This is a one time operation and will be cached for future builds, so leave it there does not hurt.

The DeimOS images that this repo builds are only for:

- qemu-x86-64
- qemu-arm64

Check the other repositories for DeimOS support on other machines.

### bitcook Arguments

The `bitcook` script (which wraps `gaia.ts`) accepts the following arguments:

| Argument | Description |
|----------|-------------|
| `--buildPath <path>` | The absolute path where the build distro folder will be generated to store artifacts |
| `--clean` | Clean the build |
| `--dev` | Run in development mode; the fetch step will be skipped |
| `--distro <path>` | Path to the `distro.json` file (relative to the current working directory) |
| `-h`, `--help` | Shows the help message |
| `--installHostDeps` | Automatically install host dependencies inside the build container |
| `--noCache` | Build from scratch without using any cache |
| `--onlySbom` | Just generate SBOM files (requires a prior build with `--sbom`) |
| `--overrideEnv` | Use the environment variables set on the shell instead of the ones from the cookbook |
| `--recipe <name>` | Build only the specified recipe |
| `--sbom` | Generate SBOM (Software Bill of Materials) files for the built artifacts |
| `--step <step>` | Execute a specific build step |
| `--verbose` | Print all the parsed recipe objects in JSON format |
| `-v`, `--version` | Shows the Gaia version |


## Setup Multi-Cookbook Build

> [!WARNING]
This depends on having Docker and Docker compose plugin installed.

For some targets you may need to build with the help of other meta cookbooks. To do this we recommend you to use the Gaia `repo`util with a `manifest.json` file. These are the interfaces that follow the `manifest.json` schema:

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

A hypothetic example of a `manifest.json` file:

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

The manifest file must be in the root of a folder where you have cloned the Gaia Core repository. To use the `repo`util, run the following command:

```bash
./gaia/scripts/init
```

This command will build the dev container and clone the repositories specified in the `manifest.json` file.

# Ecosystem

## Gaia Build System

Gaia is a build system to create Debian based Linux distributions. It's use Debian packages and Docker Debian containers to build the system and create reproducible builds.

The project consists of some components:

### Gaia Core

https://github.com/gaiaBuildSystem/gaia

Gaia core is the main component of the project. It's the tool that parses the recipes meta-data, run the tasks and output the artifacts. It's written in TypeScript, run under Bun and uses container images to build the system.

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

PergamOS is the namespace for the Debian based container images library of the
Gaia project. It's a collection of Debian based images that are used to build and as a base for applications.

The PergamOS name is a reference to the ancient city of Pergamon, which was known for its library, the second largest in the ancient world, after the Library of Alexandria. W
