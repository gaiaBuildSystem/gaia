# Build Steps

A Gaia build is a fixed sequence of **stages**. Each stage iterates over every
selected recipe and runs that recipe's scripts for the stage (in order). Recipes
that declare no scripts for a stage simply do nothing in that stage.

The entry point is `scripts/bitcook/gaia.ts`, invoked by the `bitcook` wrapper.
It:

1. Parses CLI arguments.
2. Reads and **schema-validates** the distro manifest.
3. Sets up the build environment variables (see [Environment](#environment-variables)).
4. **Parses recipes**: discovers, filters, and merges them.
5. Runs the stages in order.

> `--verbose` prints the parsed recipes and the environment, then exits before
> any stage runs. `--recipe <name>` restricts every stage to that single recipe.

## Stage Order

The exact order, as driven by `gaia.ts`:

| # | Stage | Recipe field run | Skipped when |
|---|-------|------------------|--------------|
| 1 | **Check dependencies** | (engine logic) | never |
| 2 | **Fetch** | `fetchRecipes` | `--dev` |
| 3 | **Patch** | `patchRecipes` | never |
| 4 | **Build** | `buildRecipes` | never |
| 5 | **Pure deploy** | `deployPureRecipes` | never |
| 6 | **Before package** | `beforeTargetDepsRecipes` | `--recipe` |
| 7 | **Package** | `targetDeps` (engine logic) | `--recipe` |
| 8 | **After package** | `afterTargetDepsRecipes` | `--recipe` |
| 9 | **Before deploy** | `beforeDeployRecipes` | `--recipe` |
| 10 | **Deploy** | `deployRecipes` | `--recipe` |
| 11 | **After deploy** | `afterDeployRecipes` | `--recipe` |
| 12 | **Deploy initramfs** | `initramfsRecipes` | `--recipe`, no initramfs |
| 13 | **After deploy initramfs** | `afterDeployInitramfsRecipes` | same |
| 14 | **Bundle initramfs** | (engine logic) | same |
| 15 | **After bundle initramfs** | `afterBundleInitramfsRecipes` | same |
| 16 | **Bundle** | `bundleRecipes` | `--recipe` |
| 17 | **After bundle** | `afterBundleRecipes` | `--recipe` |
| 18 | **SBOM** | `sbomRecipes` | unless `--sbom` / `--onlySbom` |
| 19 | **Clean** | `cleanRecipes` | `--recipe` (always in a `finally`) |

Key behaviors:

- **Stages 6–11 and 16–17 are skipped entirely** when `--recipe` is set, so
  single-recipe mode only runs dependencies → fetch → patch → build → pure
  deploy → clean. This is how you build one component (e.g. the kernel) in
  isolation.
- **Clean** runs in a `finally` block, so it executes even if an earlier stage
  threw.
- **SBOM** only runs when `--sbom` (generate during the build) or `--onlySbom`
  (regenerate from a prior `--sbom` build) is passed.

## What Each Stage Does

### 1. Check dependencies
For every recipe:

- **`hostAsContainer: true`**: ensures a per-recipe Podman container exists (named `<recipe>-<distro>-<arch>-host`) from `containerImage`. It mounts the build path, the cookbook directories, and the image's `root`/`boot` mount points; runs any cookbook `./init` script inside it; and installs the recipe's `hostDeps` via `apt-get` within the container.
- **otherwise**: runs any cookbook `./init` script on the host, then checks each `hostDeps` entry with `dpkg -s`. If a dependency is missing and `--installHostDeps` was not passed, the build fails; if it was passed, the dependency is installed with `apt-get`.

### 2. Fetch
Runs each recipe's `fetchRecipes`. This is where sources (git checkouts,
tarballs) are pulled. Skipped in `--dev` mode, on the assumption that sources
are already present and are being edited locally.

### 3. Patch
Runs `patchRecipes`. Applies source patches before building.

### 4. Build
Runs `buildRecipes`. If the recipe has `hostAsContainer: true`, each script is
executed **inside** the recipe's Podman container (all environment variables
forwarded); otherwise it runs directly on the host. Scripts are executed from
the recipe's own directory.

### 5. Pure deploy
Runs `deployPureRecipes`. Deploys artifacts that do not depend on the
rootfs being present (for example dropping a kernel image into the boot
partition).

### 6–8. Package (before / package / after)
The **package** stage installs a recipe's `targetDeps` **into the target
rootfs** via `chroot <root> apt-get update` (once) and
`chroot <root> apt-get install -y --no-upgrade <deps>`. The **before package**
and **after package** stages run `beforeTargetDepsRecipes` /
`afterTargetDepsRecipes` for hook-in before and after this.

### 9–11. Deploy (before / deploy / after)
The **deploy** stage runs `deployRecipes`, copying built artifacts into the
mounted image at `IMAGE_MNT_BOOT` / `IMAGE_MNT_ROOT`. The **before deploy** and
**after deploy** stages run `beforeDeployRecipes` / `afterDeployRecipes`.

### 12–15. Initramfs
Only when `useInitramfs` is true in the distro. The **deploy initramfs** stage
runs `initramfsRecipes` (typically building/assembling an initramfs image into
`INITRAMFS_PATH`); the **bundle initramfs** stage embeds it into the kernel/boot;
the surrounding **after** stages run `afterDeployInitramfsRecipes` /
`afterBundleInitramfsRecipes`.

### 16–17. Bundle (before / after)
The **bundle** stage runs `bundleRecipes`, finalizing and packaging the image
(for example writing the final `.img`, finalizing partitions). The **after
bundle** stage runs `afterBundleRecipes`.

### 18. SBOM
Runs each recipe's `sbomRecipes` (which emit CycloneDX JSON fragments into
`<buildPath>/tmp/<machine>/sbom/`), then **merges** all fragments into a single
CycloneDX 1.6 SBOM:

```
<distro>-<machine>-<variant>-<major>-<minor>-<patch>-<build>-sbom.cdx.json
```

The merge de-duplicates components by name + version + type, warns on version
conflicts, and prefers non-Debian components over Debian ones when they clash.

### 19. Clean
Runs `cleanRecipes` (for example unmounting the image, detaching loop devices).
`CleanLosetupMounts()` also detaches any leftover `losetup` devices before the
build starts.

## Environment Variables

Set by the engine and visible to every stage script:

| Variable | Source |
|----------|--------|
| `BUILD_PATH` | `<buildPath>/build-<distro.name>` |
| `GAIA_WORKSPACE` | The working directory (use for shared caches) |
| `MACHINE`, `ARCH` | From the distro manifest |
| `DISTRO_NAME`, `DISTRO_MAJOR`, `DISTRO_MINOR`, `DISTRO_PATCH`, `DISTRO_BUILD` | From the distro manifest |
| `DISTRO_VARIANT`, `DISTRO_CODENAME` | From the distro manifest (if set) |
| `MAX_IMG_SIZE` | From the distro manifest |
| `USE_INITRAMFS` | From the distro manifest |
| `IMAGE_NAME` | `<name>-<machine>-<major>-<minor>-<patch>.img` |
| `INITRAMFS_PATH` | `<buildPath>/tmp/<machine>/initramfs` (if initramfs) |
| `IMAGE_MNT_BOOT`, `IMAGE_MNT_ROOT` | `<buildPath>/tmp/<machine>/mnt/{boot,root}` (set in package/deploy/sbom) |
| `META` | JSON of the recipe currently being executed (set per-script) |
| `RECIPE` | Set when `--recipe` is used |
| `VERBOSE` | `true`/`false` |
| `INSTALL_HOST_DEPS` | `true`/`false` |
| `KERNEL_EDGE` | `true`/`false` (from `--kernelEdge`) |
| `CLEAN_IMAGE` | `true` when `--noCache` |
| `DO_SBOM` | `true`/`false` |
| `GAIA_OVERRIDE_ENV` | `true`/`false` (from `--overrideEnv`) |

## Recipe-Specific Environment

Each recipe may also declare an `env` block; those variables are merged into the
script environment for that recipe. Values can reference `${recipeOrigin}`
(the recipe directory).

## Execution Details

- Scripts are run with the **recipe directory as the working directory** and
  invoked through `bash` via `exec <script>`, so a shebang (for example
  `#!/usr/bin/env -S deno run --allow-all`) selects the interpreter.
- `process.env.META` is set to the JSON of the current recipe before each
  script runs, so a script can introspect its own metadata.
- For `hostAsContainer` builds, the same script is executed inside the
  per-recipe container instead of on the host.
