# Recipes

A **recipe** is the unit of work in Gaia. It is a JSON file that describes one component of a target image (kernel, bootloader, rootfs, application, or configuration tweak) and declares *what* to do at each build stage. Gaia does the orchestration; the recipe declares intent.

## Recipe Layout

A recipe is a directory. Inside it:

```
cookbook/
└── recipes-kernel/
    └── linux/
        ├── linux.json      # the recipe metadata (name MUST match the directory)
        ├── fetch.ts        # stage scripts (any executable / script)
        ├── build.ts
        ├── deploy.ts
        └── linux-sbom.ts
```

Rules:

- The recipe JSON file **must be named after its directory**
  (`linux/linux.json`). Any other `.json` in the directory is ignored (with a
  warning).
- A **machine-specific override** may be placed alongside it:
  `linux-rpi5b.json` (i.e. `<name>-<machine>.json`). When present, it is
  selected instead of the default recipe for that machine.
- Stage scripts are referenced **relative to the recipe directory** and are
  executed with their own interpreter (for example Deno scripts with a
  `#!/usr/bin/env -S deno run --allow-all` shebang).

## Minimal Recipe

```json
{
    "name": "hostname",
    "type": "config",
    "priority": 0,
    "support": ["linux/amd64", "linux/arm64"],
    "env": {
        "HOSTNAME_NAME": "reference"
    },
    "deployRecipes": ["deploy.ts"]
}
```

The only required fields are `name`, `type`, `priority`, and `support`.

## Full Reference

### Identity

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | **Required.** The recipe name. Must match its directory name. Used when merging recipes. |
| `type` | `string` | **Required.** One of: `bootloader`, `package`, `rootfs`, `init`, `config`, `kernel`, `kernelModule`, `application`. |
| `priority` | `number` | **Required.** Used to pick a winner when multiple recipes share the same `name`. Higher wins for scalar fields. |
| `version` | `string` | Free-form version of the recipe. |
| `merge` | `boolean` | When `true`, this recipe's script/dependency arrays are **merged** (deduplicated by script basename) into a recipe with the same name instead of replacing them. |

### Source

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Empty string or an `http(s)://` URL. A git repository URL or a link to a tarball/file. |
| `ref` | `object` | Git ref to fetch, keyed by architecture: `{ "linux/amd64": "...", "linux/arm64": "..." }`. Ignored if `source` is not a git repo. |
| `file` | `string` | A single file to fetch from `source`. |
| `files` | `string[]` | Multiple files to fetch from `source`. |
| `checksum` | `object` | Checksum of the fetched file, keyed by architecture. |

### Architecture

| Field | Type | Description |
|-------|------|-------------|
| `support` | `string[]` | **Required.** Architectures the recipe supports. At least one of `linux/amd64`, `linux/arm64`. A recipe that does not support the target architecture is a hard error. |

### Container & Dependencies

| Field | Type | Description |
|-------|------|-------------|
| `hostAsContainer` | `boolean` | Default `false`. When `true`, the recipe is built inside a container, and `containerImage` **must** be provided. |
| `containerImage` | `object` | The build container. `image` (required), `tag` (required), and optional `extraConfig` (extra docker flags, e.g. `--entrypoint=""`). |
| `hostDeps` | `string[]` | Host tools that must be present (checked before the build). Example: `["git", "make"]`. |
| `targetDeps` | `string[]` | Debian packages installed **into the target rootfs** during the package stage (via `apt-get`). |
| `env` | `object` | Environment variables injected for this recipe's scripts. Values may reference `${recipeOrigin}`. |
| `customData` | `object` | Arbitrary data shared to the build context (for example alternate kernel `ref` sets). |

### Build-Stage Script Arrays

Each of these is an array of script paths (relative to the recipe directory).
Scripts whose basename starts with digits are sorted numerically, so
`00-a.ts` runs before `10-b.ts`; non-numeric scripts run after, in listed
order.

| Field | Stage |
|-------|-------|
| `fetchRecipes` | fetch |
| `patchRecipes` | patch |
| `buildRecipes` | build |
| `beforeTargetDepsRecipes` | before package |
| `afterTargetDepsRecipes` | after package |
| `deployPureRecipes` | pure deploy (no rootfs dependency) |
| `beforeDeployRecipes` | before deploy |
| `deployRecipes` | deploy |
| `afterDeployRecipes` | after deploy |
| `initramfsRecipes` | initramfs |
| `afterDeployInitramfsRecipes` | after deploy initramfs |
| `afterBundleInitramfsRecipes` | after bundle initramfs |
| `bundleRecipes` | bundle |
| `afterBundleRecipes` | after bundle |
| `sbomRecipes` | SBOM |
| `cleanRecipes` | clean |

A complete stage-by-stage explanation is in [Build Steps](build-steps.md).

## Real Examples

### A config recipe (simplest)

`cookbook/recipes-common/hostname/hostname.json` writes `/etc/hostname` and
`/etc/hosts` into the image:

```json
{
    "name": "hostname",
    "type": "config",
    "priority": 0,
    "support": ["linux/amd64", "linux/arm64"],
    "env": { "HOSTNAME_NAME": "reference" },
    "deployRecipes": ["deploy.ts"]
}
```

### A rootfs recipe

`cookbook/recipes-debian/bookworm/bookworm.json` creates the disk, builds the
rootfs, and installs target packages:

```json
{
    "name": "debian-bookworm",
    "type": "rootfs",
    "priority": 0,
    "support": ["linux/amd64", "linux/arm64"],
    "checksum": {
        "linux/amd64": "3f03ff2fca74e47cee05599e36e1f1258d386895a3394b3683df333f404f4e8a",
        "linux/arm64": "53692cdc49e2b0abdd9adf36466b366aaebdbbdbb2e6a7f432e2b4fb7327fd93"
    },
    "env": { "BOOT_LABEL": "BOOT", "ROOT_LABEL": "gaia" },
    "hostDeps": ["mount", "xz-utils", "kpartx", "e2fsprogs", "pipx", "lz4"],
    "targetDeps": ["kmod", "locales", "sudo", "bash", "bash-completion", "..."],
    "fetchRecipes": ["fetch.ts"],
    "buildRecipes": ["disk.ts", "buildRootfs.ts"],
    "deployRecipes": ["update.ts"],
    "sbomRecipes": ["sbom.ts"],
    "cleanRecipes": ["umount.ts"]
}
```

### A kernel recipe

`cookbook/recipes-kernel/linux/linux.json` fetches a git source, builds it, and
deploys it. Note `customData.ref` holds alternate `stable`/`edge` references
used by the `--kernelEdge` flag:

```json
{
    "name": "linux",
    "type": "kernel",
    "priority": 0,
    "source": "https://github.com/gaiaBuildSystem/linux.git",
    "support": ["linux/arm64", "linux/amd64"],
    "ref": {
        "linux/arm64": "8cd9520d35a6c38db6567e97dd93b1f11f185dc6",
        "linux/amd64": "8cd9520d35a6c38db6567e97dd93b1f11f185dc6"
    },
    "customData": {
        "ref": {
            "stable": { "linux/amd64": "...", "linux/arm64": "..." },
            "edge":   { "linux/amd64": "...", "linux/arm64": "..." }
        }
    },
    "hostDeps": ["git", "make"],
    "fetchRecipes": ["fetch.ts"],
    "buildRecipes": ["build.ts"],
    "deployRecipes": ["deploy.ts"],
    "sbomRecipes": ["linux-sbom.ts"]
}
```

## The Script Execution Context

Stage scripts are plain programs (commonly Deno/TypeScript). Gaia sets the
environment before invoking each one. Useful variables a script can rely on:

| Variable | Meaning |
|----------|---------|
| `BUILD_PATH` | `<buildPath>/build-<distro.name>` |
| `MACHINE` / `ARCH` | Target machine and architecture |
| `DISTRO_NAME`, `DISTRO_MAJOR`, `DISTRO_MINOR`, `DISTRO_PATCH`, `DISTRO_BUILD`, `DISTRO_VARIANT`, `DISTRO_CODENAME` | Distro identity |
| `MAX_IMG_SIZE` | Maximum image size (MB) |
| `IMAGE_NAME` | Final image file name |
| `META` | The full JSON of the recipe being executed |
| `HOSTNAME_NAME` (etc.) | Any variables declared in the recipe's `env` block |
| `IMAGE_MNT_BOOT`, `IMAGE_MNT_ROOT` | Mount points for the image boot/root partitions (set by the deploy stage) |

A typical deploy script writes artifacts to a per-recipe staging directory and
copies them into the mounted image:

```ts
const BUILD_PATH = process.env.BUILD_PATH
const MACHINE = process.env.MACHINE
const staging = `${BUILD_PATH}/tmp/${MACHINE}/hostname`
const root =    `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`

FS.mkdirSync(staging, { recursive: true })
FS.writeFileSync(`${staging}/hostname`, `${HOSTNAME_NAME}\n`)
execSync(`sudo -k cp ${staging}/hostname ${root}/etc/hostname`, { stdio: "inherit" })
```

## Overriding a Recipe

To change a recipe for a specific machine without touching the core cookbook,
create a higher-priority override recipe with the same `name` in a vendor
cookbook:

```json
{
    "name": "linux",
    "type": "kernel",
    "priority": 10,
    "support": ["linux/amd64", "linux/arm64"],
    "merge": true,
    "deployRecipes": ["deploy-rpi.ts"]
}
```

- Because its `priority` is higher, its scalar fields win.
- Because `merge` is `true`, `deploy-rpi.ts` is added to (not replaced into) the
  original script set, and same-basename scripts from the higher priority recipe
  win over the lower one.

See [Architecture](architecture.md#how-recipes-are-discovered-and-merged) for
the full merging rules.
