# Architecture

This document explains how the Gaia Build System works: its design goals, the
build pipeline, the roles of its core abstractions, and the surrounding
ecosystem.

## Design Goals

- **Debian first.** Gaia builds Debian based distributions from official Debian
  packages. It does not re-implement the package manager; it drives `apt-get`
  inside a chroot and inside Debian build containers.
- **Reproducibility.** Builds run inside Debian based container images (provided
  by the [PergamOS](https://github.com/gaiaBuildSystem/Pergamos) library).
  Pinning the toolchain and the base images keeps the output of a build
  deterministic for a given set of inputs.
- **Declarative recipes.** Every component of a target image (kernel, bootloader, rootfs, application) is described by a **recipe** that declares *what* to do at each **build stage**, not *how* to orchestrate it.
- **Multi-architecture.** A single recipe set can target `linux/amd64` and
  `linux/arm64` (and other machines via vendor cookbooks). Architecture
  emulation is set up with `binfmt` so foreign-architecture containers run
  transparently.
- **Extensible.** Recipes can live in multiple "cookbooks". A distro manifest
  picks which recipes to include, and recipes can be merged and overridden by
  priority.

## The Core Abstractions

```
+-------------------+        +---------------------+
|  Distro Manifest  |        |        Recipes       |
|    (distro.json)   |----->  |   (recipe JSON)     |
+-------------------+        +---------------------+
        |                              |
        |  machine, arch, version,     |  stages (fetch/patch/build/deploy/bundle)
        |  include/exclude recipes     |  scripts + deps + container image
        v                              v
+-----------------------------------------------+
|                 Build Engine (gaia.ts)        |
|  parse -> validate -> dependency check ->     |
|  fetch -> patch -> build -> package ->        |
|  deploy -> initramfs -> bundle -> sbom ->     |
|  clean                                         |
+-----------------------------------------------+
        |
        v
+-----------------------------------------------+
|     Output: <distro>-<machine>-<version>.img  |
+-----------------------------------------------+
```

1. **Distro Manifest (`distro.json`)**: describes the target distribution, name, machine, architecture, version, max image size, which recipes to include or exclude, and whether an initramfs is needed. See [Distro Manifest](distro.md).

2. **Recipes**: the unit of work. Each recipe declares a type, a priority, its build dependencies (host and target), the container image it builds in, and the list of scripts that run in each build stage. See [Recipes](recipes.md).

3. **Build Engine**: the TypeScript program (`gaia.ts`, wrapped by `bitcook`) that parses and validates the inputs, then drives each recipe through the ordered build stages. See [Build Steps](build-steps.md).

4. **Cookbook**: a folder of recipes plus any machine-specific data (for example a kernel defconfig template). The `cookbook/` folder in this repository is the reference cookbook used to build DeimOS.

## The Build Pipeline

Gaia runs every selected recipe through a fixed sequence of stages. A recipe
participates in a stage only if it declares scripts (or dependencies) for it.
The high-level order is:

```
fetch → patch → build → package → deploy → [initramfs] → bundle → sbom → clean
```

- **fetch**: download/extract sources (skipped in `--dev` mode).
- **patch**: apply patches to the fetched sources.
- **build**: compile/build the component in its container.
- **package**: install target dependencies into the rootfs chroot.
- **deploy**: lay the built component into the image (bootloader, kernel, rootfs, config).
- **initramfs** (optional): build and bundle an initramfs.
- **bundle**: assemble the final disk image.
- **sbom** (optional): generate a Software Bill of Materials.
- **clean**: always run last (in a `finally` block), to tear down mounts and containers.

A detailed, stage-by-stage walkthrough is in [Build Steps](build-steps.md).

## How Recipes Are Discovered and Merged

The engine searches the directories listed in `searchForRecipesOn` (relative to
the distro manifest) for recipe JSON files. A file is considered a recipe if its
name matches its parent directory name (e.g. `linux/linux.json`). A
machine-specific override file (`linux-rpi5b.json`) takes precedence over the
default when present.

Recipes are then filtered by `includeRecipes` or `excludeRecipes` from the distro manifest (mutually exclusive, exactly one must be present).

Finally, recipes with the same `name` are **merged**: the one with the higher
`priority` wins for scalar properties, and when `merge: true` its
script/dependency arrays are combined (deduplicated by script basename) instead
of replaced. This is how a vendor cookbook overrides or extends a core recipe for a specific machine.

## Build Environment

The engine exposes a set of environment variables to every recipe stage script.
The most important are derived from the distro manifest:

| Variable | Source |
|----------|--------|
| `DISTRO_NAME` | `distro.name` |
| `MACHINE` | `distro.machine` |
| `ARCH` | `distro.arch` |
| `DISTRO_MAJOR` / `DISTRO_MINOR` / `DISTRO_PATCH` / `DISTRO_BUILD` | `distro.version.*` |
| `DISTRO_VARIANT` / `DISTRO_CODENAME` | `distro.version.variant` / `codename` |
| `MAX_IMG_SIZE` | `distro.maxImgSize` |
| `USE_INITRAMFS` | `distro.useInitramfs` |
| `BUILD_PATH` | `<buildPath>/build-<distro.name>` |
| `GAIA_WORKSPACE` | the working directory root |
| `IMAGE_NAME` | `<distro.name>-<machine>-<major>-<minor>-<patch>.img` |
| `META` | the JSON of the recipe being executed (per stage) |

Each recipe can also declare its own `env` block, which is injected into the
environment before its scripts run (and can reference `${recipeOrigin}`).

## The Ecosystem

| Project | Role |
|---------|------|
| **Gaia Core** (this repo) | The build engine and the reference cookbook. |
| **DeimOS** | The reference distribution Gaia builds. Named after the Greek god Deimos. |
| **PhobOS** | A Debian based, Toradex Torizon compatible distribution (Deimos' brother). Uses OSTree, Aktualizr, and a container runtime. |
| **PergamOS** | A library of Debian based container images used to build and as a base for applications. |

> Torizon™ is a registered trademark of Toradex Group AG. The Gaia project does
> not speak on behalf of Toradex or of any Toradex product.
