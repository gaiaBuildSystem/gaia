<p align="center">
    <img
        src="https://github.com/gaiaBuildSystem/.github/raw/main/profile/GaiaBuildSystemLogoDebCircle.png"
        height="212"
    />
</p>

# Gaia Core

Gaia Core is the origin, the beginning, the first. It is the core of the Gaia Build System.

## Building DeimOS

Deimos is the Gaia Build System's reference distribution. It is a minimal distribution that is used to test the Gaia Build System.

Run the following command to create an image:

```bash
./scripts/bitcook/gaia.ts --buildPath /mnt/factory/build/gaia --distro distro-ref-amd64.json --noCache
```

> [!WARNING]
The `--buildPath` argument is mandatory and must be an absolute path.

> [!WARNING]
The `--distro` argument is mandatory and must be an relative path to a distro json file.

> [!WARNING]
The `--noCache` argument is optional but should be use on the first build to create a new cache.

The DeimOS images that this repo builds are only for:

- qemu-x86-64
- qemu-arm64

Check the other repositories for DeimOS support on other machines.

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
