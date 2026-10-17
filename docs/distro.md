# Distro Manifest

The **distro manifest** is the top-level description of the distribution you want to build. It is a JSON file (for example `distro-ref-qemux86-64.json`) passed to the build engine with `--distro`. It selects the machine, architecture, version, and, most importantly, **which recipes participate** in the build.

The manifest is validated against `schema/distro.json`. The core distribution
adds `schema/distro-core.json` on top of it (for example to constrain the
`machine` to the supported set).

## Example

`distro-ref-qemux86-64.json`:

```json
{
    "name": "DeimOS-Reference",
    "machine": "qemux86-64",
    "arch": "linux/amd64",
    "version": {
        "major": 0,
        "minor": 1,
        "patch": 0,
        "build": 0
    },
    "maxImgSize": 1524,
    "useInitramfs": true,
    "searchForRecipesOn": ["cookbook"],
    "excludeRecipes": [
        "u-boot-ram",
        "microsoft",
        "docker",
        "powershell",
        "neofetch",
        "simple-splash"
    ],
    "$schema": "./schema/distro-core.json"
}
```

## Reference

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `name` | `string` | yes | The name of the distribution. Used to name the output image and the `build-<name>` working folder. |
| `machine` | `string` | yes | The target machine type (for example `qemux86-64`, `qemuarm64`, or a vendor machine name). |
| `arch` | `string` | yes | Target architecture. One of `linux/amd64`, `linux/arm64`. |
| `version` | `object` | yes | Distribution version. See below. |
| `debian` | `string` | no | Debian release used as base. One of `bookworm`, `trixie`, `forky`. Default `bookworm`. See [Debian Release](#debian-release). |
| `maxImgSize` | `number` | yes | Maximum image size in megabytes. |
| `searchForRecipesOn` | `string[]` | yes | Directories (relative to the manifest) to search for recipes. |
| `includeRecipes` | `string[]` | one-of | Whitelist of recipe names to include. **Exactly one** of this or `excludeRecipes` must be present. |
| `excludeRecipes` | `string[]` | one-of | Blacklist of recipe names to exclude. **Exactly one** of this or `includeRecipes` must be present. |
| `useInitramfs` | `boolean` | no | Default `true`. Whether to build an initramfs. |
| `$schema` | `string` | no | Editor/validation hint pointing to the schema file. |

### `version`

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `major` | `number` | yes | Major version. |
| `minor` | `number` | yes | Minor version. |
| `patch` | `number` | yes | Patch version. |
| `build` | `number` | yes | Build number. |
| `variant` | `string` | no | One of `ota`, `bootc`, `dev`, `prod`. |
| `codename` | `string` | no | Optional release codename. |

> The version components are exposed to recipes as `DISTRO_MAJOR`,
> `DISTRO_MINOR`, `DISTRO_PATCH`, `DISTRO_BUILD`, `DISTRO_VARIANT`, and
> `DISTRO_CODENAME`.

## Recipe Selection

The manifest drives **which recipes** are parsed:

1. The engine walks each directory in `searchForRecipesOn` (relative to the
   manifest location) collecting recipe JSON files (a file matching its parent
   directory name, with a machine-specific override taking precedence).
2. It then filters them:
   - If `excludeRecipes` is set, any recipe whose path contains one of those
     names is removed.
   - Otherwise, if `includeRecipes` is set, **only** recipes whose path matches
     one of those names are kept.
3. Debian release recipes are handled apart from that filter, see
   [Debian Release](#debian-release).
4. Recipes sharing a name are merged by priority (see [Recipes →
   Overriding a Recipe](recipes.md#overriding-a-recipe)).

The schema enforces that `includeRecipes` and `excludeRecipes` are **mutually
exclusive** and that exactly one of them is present.

### Debian Release

A recipe whose directory name is a Debian release codename (one of the
`debian` enum values, for example `recipes-debian/bookworm/`) is a **Debian
release recipe**. These recipes are special:

- Only the recipe matching the distro `debian` property (default `bookworm`)
  is used. Recipes for every other release are dropped.
- `includeRecipes` and `excludeRecipes` do not apply to them. The selected
  release is always included.
- If no search path has a recipe for the selected release, the build fails.

Other recipes under `recipes-debian` (for example `custom-feed`) are ordinary
recipes and follow the normal filter.

The selected release is exposed to recipes as `DISTRO_DEBIAN`.

Recipes can also declare `targetDeps`, `hostDeps` and `containerImage` per
release, as an object keyed by codename. See [Recipes](recipes.md).

To support a new release, add its codename to the `debian` enum in
`schema/distro.json`, to the `targetDeps`, `hostDeps` and `containerImage`
object keys in `schema/recipe.json`, and to `DEBIAN_RELEASES` in
`scripts/bitcook/parse.ts`.

## Multi-Cookbook Builds

A single distro may need recipes from several cookbooks. To assemble those, use
a `manifest.json` in the working directory and the `repo` util:

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

Then run `./gaia/scripts/init` to build the dev container and clone the listed
repositories. After that, point `searchForRecipesOn` at the additional cookbook
folders in your distro manifest.

> This flow requires Docker and the Docker Compose plugin.
