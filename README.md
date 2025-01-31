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
./scripts/bitcook/gaia.ts --buildPath /mnt/factory/build/gaia --distro distro-ref-amd64.json
```

> ⚠️ **WARNING**: The `--buildPath` argument is mandatory and must be an absolute path.

> ⚠️ **WARNING**: The `--distro` argument is mandatory and must be an relative path to a distro json file.

The DeimOS images that this repo builds are only for:

- qemu-x86-64
- qemu-arm64

Check the other repositories for DeimOS support on other machines.
