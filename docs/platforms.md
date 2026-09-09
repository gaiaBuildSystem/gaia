# Adding a New Platform or Board

This guide covers two scenarios:

1. **New vendor cookbook**: creating a full `cookbook-<vendor>/` repository
2. **New board in existing cookbook**: adding a machine to an existing vendor repo

> [!IMPORTANT]
> Recipe scripts use **Xonsh** (`.xsh`). This is the recommended approach for new platforms.
> The `deno.json` and `tsconfig.json` are still present for schema validation (ajv) and optional SBOM scripts.

## New Vendor Cookbook

### Directory Structure

```
cookbook-<vendor>/
├── README.md
├── deno.json
├── tsconfig.json
├── .gitignore
├── init
├── schema/
│   └── distro.json
├── distro-ref-<machine1>.json
├── distro-ref-<machine2>.json
└── cookbook/
    ├── recipes-bsp/
    │   ├── u-boot/
    │   │   ├── u-boot.json
    │   │   ├── env.xsh
    │   │   ├── <machine1>/
    │   │   └── <machine2>/
    │   └── <firmware>/
    │       ├── <firmware>.json
    │       ├── fetch.xsh
    │       ├── deploy.xsh
    │       ├── <machine1>/
    │       └── <machine2>/
    ├── recipes-kernel/
    │   └── linux/
    │       ├── linux.json
    │       ├── dtb.xsh
    │       ├── <machine1>/<machine1>_defconfig.template
    │       └── <machine2>/<machine2>_defconfig.template
    ├── recipes-common/
    │   └── fstab/
    │       ├── fstab.json
    │       ├── <machine1>/fstab
    │       └── <machine2>/fstab
    └── recipes-debian/
        └── custom-feed/
            └── custom-feed.json
```

### Project Files

#### `deno.json`

Used for schema validation (ajv) and optional SBOM TypeScript scripts:

```json
{
    "imports": {
        "ajv/dist/2019.js": "npm:ajv@^8.12.0/dist/2019.js",
        "ajv/dist/refs/json-schema-draft-07.json": "npm:ajv@^8.12.0/dist/refs/json-schema-draft-07.json",
        "node-color-log": "npm:node-color-log@^11.0.0",
        "packageurl-js": "npm:packageurl-js@^2.0.1"
    },
    "compilerOptions": { "strict": true },
    "nodeModulesDir": "auto"
}
```

#### `tsconfig.json`

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true
    }
}
```

#### `init`

Installs Xonsh and its dependencies via `pipx`, then installs Deno for schema validation:

```bash
#!/bin/bash

##
# INSTALL DEPS FOR THIS COOKBOOK
##

sudo apt-get update
sudo apt-get install -y \
    python3 \
    python3-pip \
    pipx

pipx install xonsh==0.23.7
pipx ensurepath
pipx inject xonsh distro
pipx inject xonsh shtab
pipx inject xonsh pyyaml
pipx inject xonsh psutil
pipx inject xonsh torizon-templates-utils
pipx inject xonsh GitPython
pipx inject xonsh python-lsp-server
pipx inject xonsh pylsp-rope

/root/.deno/bin/deno install

# check where xonsh was installed and make an symlink to /usr/bin
if [ -f ~/.local/bin/xonsh ]; then
    if [ ! -L /usr/bin/xonsh ]; then
        sudo ln -s ~/.local/bin/xonsh /usr/bin/xonsh
    fi
fi
```

### Schema

`schema/distro.json` extends the core Gaia schema and constrains the `machine` field:

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "<Vendor> Distro Manifest Schema",
    "allOf": [ { "$ref": "../../gaia/schema/distro.json" } ],
    "properties": {
        "machine": {
            "description": "The machine type",
            "type": "string",
            "enum": ["<machine1>", "<machine2>"]
        }
    }
}
```

### Distro-Ref Manifest

One file per board: `distro-ref-<machine>.json`

```json
{
    "name": "DeimOS-Reference",
    "machine": "<machine1>",
    "arch": "linux/arm64",
    "version": { "major": 0, "minor": 0, "patch": 0, "build": 0 },
    "maxImgSize": 3072,
    "useInitramfs": true,
    "searchForRecipesOn": [
        "../gaia/cookbook",
        "./cookbook"
    ],
    "excludeRecipes": [
        "grub",
        "u-boot-ram",
        "microsoft",
        "powershell",
        "docker"
    ],
    "$schema": "./schema/distro.json"
}
```

Key rules:

- `searchForRecipesOn` **must** list `../gaia/cookbook` first (core recipes), then `./cookbook` (vendor overrides)
- `excludeRecipes` lists core recipes you do not want (e.g. `grub` on ARM boards using u-boot)
- `machine` must match a value in the schema `enum`

### Recipes

All recipe phase scripts use **Xonsh** (`.xsh`).

#### Xonsh Script Boilerplate

Every `.xsh` script starts with this common header:

```xonsh
#!/usr/bin/env xonsh

# use the xonsh environment to update the OS environment
$UPDATE_OS_ENVIRON = True
# always return if a cmd fails
$XONSH_SUBPROC_CMD_RAISE_ERROR = True

import os
import json
import os.path
from torizon_templates_utils.colors import print, BgColor, Color
from torizon_templates_utils.errors import Error_Out, Error

# get the common variables
_ARCH = os.environ.get('ARCH')
_MACHINE = os.environ.get('MACHINE')
_MAX_IMG_SIZE = os.environ.get('MAX_IMG_SIZE')
_BUILD_PATH = os.environ.get('BUILD_PATH')
_DISTRO_MAJOR = os.environ.get('DISTRO_MAJOR')
_DISTRO_MINOR = os.environ.get('DISTRO_MINOR')
_DISTRO_PATCH = os.environ.get('DISTRO_PATCH')
_USER_PASSWD = os.environ.get('USER_PASSWD')

# read the meta data
meta = json.loads(os.environ.get('META', '{}'))

# get the actual script path, not the process.cwd
_path = os.path.dirname(os.path.abspath(__file__))

_IMAGE_MNT_BOOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/boot"
_IMAGE_MNT_ROOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/root"
os.environ['IMAGE_MNT_BOOT'] = _IMAGE_MNT_BOOT
os.environ['IMAGE_MNT_ROOT'] = _IMAGE_MNT_ROOT
```

Key Xonsh features used:

- **`@()` subexpression interpolation**: inline Python expressions in shell commands: `cp @(_path)/@(_MACHINE)/file`
- **`$(...)` command substitution**: capture command output: `_out = $(sfdisk --json @(_image))`
- **Direct shell commands**: `sudo cp`, `mkdir -p`, `wget`, `git clone`, `tar`, `dd`, etc. run natively
- **Python control flow mixed with shell**: `if/else`, `for` loops, `os.walk()`
- **`sudo -k`**: resets sudo timestamp before operations (ensures fresh auth)

#### Bootloader (u-boot override)

`cookbook/recipes-bsp/u-boot/u-boot.json`:

```json
{
    "name": "u-boot",
    "type": "bootloader",
    "support": ["linux/arm64"],
    "source": "https://github.com/gaiaBuildSystem/u-boot",
    "hostDeps": ["xxd"],
    "ref": { "linux/arm64": "<commit-hash>" },
    "priority": 1,
    "patchRecipes": ["env.xsh"],
    "merge": true
}
```

The `priority: 1` + `"merge": true` overrides the core recipe (priority 0).

`cookbook/recipes-bsp/u-boot/env.xsh`:

```xonsh
#!/usr/bin/env xonsh

# use the xonsh environment to update the OS environment
$UPDATE_OS_ENVIRON = True
# always return if a cmd fails
$XONSH_SUBPROC_CMD_RAISE_ERROR = True

import os
import json
import os.path
from torizon_templates_utils.colors import print, BgColor, Color
from torizon_templates_utils.errors import Error_Out, Error

print("patching u-boot env ...", color=Color.WHITE, bg_color=BgColor.GREEN)

# get the common variables
_ARCH = os.environ.get('ARCH')
_MACHINE = os.environ.get('MACHINE')
_MAX_IMG_SIZE = os.environ.get('MAX_IMG_SIZE')
_BUILD_PATH = os.environ.get('BUILD_PATH')
_DISTRO_MAJOR = os.environ.get('DISTRO_MAJOR')
_DISTRO_MINOR = os.environ.get('DISTRO_MINOR')
_DISTRO_PATCH = os.environ.get('DISTRO_PATCH')
_USER_PASSWD = os.environ.get('USER_PASSWD')

# read the meta data
meta = json.loads(os.environ.get('META', '{}'))

# get the actual script path, not the process.cwd
_path = os.path.dirname(os.path.abspath(__file__))

_IMAGE_MNT_BOOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/boot"
_IMAGE_MNT_ROOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/root"
os.environ['IMAGE_MNT_BOOT'] = _IMAGE_MNT_BOOT
os.environ['IMAGE_MNT_ROOT'] = _IMAGE_MNT_ROOT

if _MACHINE == "<machine1>" or _MACHINE == "<machine2>":
    sudo -k cp -f @(_path)/@(_MACHINE)/default.env @(_BUILD_PATH)/tmp/@(_MACHINE)/u-boot/board/<vendor>/default.env
else:
    Error_Out(
        f"Machine [{_MACHINE}] is not supported",
        Error.EINVAL
    )

print("patching u-boot env, OK", color=Color.WHITE, bg_color=BgColor.GREEN)
```

Place board-specific files in `cookbook/recipes-bsp/u-boot/<machine>/`.

#### Board Firmware

`cookbook/recipes-bsp/<firmware>/<firmware>.json`:

```json
{
    "name": "<firmware>",
    "type": "bootloader",
    "priority": 0,
    "support": ["linux/arm64"],
    "source": "https://github.com/<vendor>/firmware/releases/download/",
    "file": "<file>.tar.xz",
    "ref": { "linux/arm64": "<version>" },
    "fetchRecipes": ["fetch.xsh"],
    "deployRecipes": ["deploy.xsh"]
}
```

`cookbook/recipes-bsp/<firmware>/fetch.xsh`:

```xonsh
#!/usr/bin/env xonsh

# use the xonsh environment to update the OS environment
$UPDATE_OS_ENVIRON = True
# always return if a cmd fails
$XONSH_SUBPROC_CMD_RAISE_ERROR = True

import os
import json
import os.path
from torizon_templates_utils.colors import print, BgColor, Color
from torizon_templates_utils.errors import Error_Out, Error

print("Fetching <firmware> ...", color=Color.WHITE, bg_color=BgColor.GREEN)

# get the common variables
_ARCH = os.environ.get('ARCH')
_MACHINE = os.environ.get('MACHINE')
_MAX_IMG_SIZE = os.environ.get('MAX_IMG_SIZE')
_BUILD_PATH = os.environ.get('BUILD_PATH')
_DISTRO_MAJOR = os.environ.get('DISTRO_MAJOR')
_DISTRO_MINOR = os.environ.get('DISTRO_MINOR')
_DISTRO_PATCH = os.environ.get('DISTRO_PATCH')
_USER_PASSWD = os.environ.get('USER_PASSWD')

# read the meta data
meta = json.loads(os.environ.get('META', '{}'))

# get the actual script path, not the process.cwd
_path = os.path.dirname(os.path.abspath(__file__))

_IMAGE_MNT_BOOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/boot"
_IMAGE_MNT_ROOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/root"
os.environ['IMAGE_MNT_BOOT'] = _IMAGE_MNT_BOOT
os.environ['IMAGE_MNT_ROOT'] = _IMAGE_MNT_ROOT

_FETCH_DIR = f"{_BUILD_PATH}/tmp/{_MACHINE}/<firmware>"
os.environ['FETCH_DIR'] = _FETCH_DIR

mkdir -p @(_FETCH_DIR)

# check if we already have the file
if not os.path.exists(f"{_FETCH_DIR}/{meta['name']}-{_MACHINE}.tar.xz"):
    wget @(f"{meta['source']}/{meta['ref'][_ARCH]}/{meta['file']}") \
        -O @(_FETCH_DIR)/@(_MACHINE)-firmware.tar.xz

print("Fetching <firmware>, OK", color=Color.WHITE, bg_color=BgColor.GREEN)
```

`cookbook/recipes-bsp/<firmware>/deploy.xsh`:

```xonsh
#!/usr/bin/env xonsh

# use the xonsh environment to update the OS environment
$UPDATE_OS_ENVIRON = True
# always return if a cmd fails
$XONSH_SUBPROC_CMD_RAISE_ERROR = True

import os
import json
import os.path
from torizon_templates_utils.colors import print, BgColor, Color
from torizon_templates_utils.errors import Error_Out, Error

print("Deploying <firmware> ...", color=Color.WHITE, bg_color=BgColor.GREEN)

# get the common variables
_ARCH = os.environ.get('ARCH')
_MACHINE = os.environ.get('MACHINE')
_MAX_IMG_SIZE = os.environ.get('MAX_IMG_SIZE')
_BUILD_PATH = os.environ.get('BUILD_PATH')
_DISTRO_MAJOR = os.environ.get('DISTRO_MAJOR')
_DISTRO_MINOR = os.environ.get('DISTRO_MINOR')
_DISTRO_PATCH = os.environ.get('DISTRO_PATCH')
_USER_PASSWD = os.environ.get('USER_PASSWD')

# read the meta data
meta = json.loads(os.environ.get('META', '{}'))

# get the actual script path, not the process.cwd
_path = os.path.dirname(os.path.abspath(__file__))

_IMAGE_MNT_BOOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/boot"
_IMAGE_MNT_ROOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/root"
os.environ['IMAGE_MNT_BOOT'] = _IMAGE_MNT_BOOT
os.environ['IMAGE_MNT_ROOT'] = _IMAGE_MNT_ROOT

if _MACHINE == "<machine1>" or _MACHINE == "<machine2>":
    # extract the firmware
    _fetch_dir = f"{_BUILD_PATH}/tmp/{_MACHINE}/<firmware>"
    sudo -k tar -xv --strip-components=1 -f @(_fetch_dir)/@(_MACHINE)-firmware.tar.xz -C @(_fetch_dir)/

    # deploy boot artifacts
    sudo -k cp -r @(_fetch_dir)/boot/* @(_IMAGE_MNT_BOOT)/

    # deploy board-specific boot config
    sudo -k cp -f @(_path)/@(_MACHINE)/config.txt @(_IMAGE_MNT_BOOT)/config.txt
else:
    Error_Out(
        f"Machine [{_MACHINE}] is not supported",
        Error.EINVAL
    )

print("Deploying <firmware>, OK", color=Color.WHITE, bg_color=BgColor.GREEN)
```

Place board-specific boot config in `cookbook/recipes-bsp/<firmware>/<machine>/` (e.g. `config.txt`, `cmdline.txt`).

#### Kernel

`cookbook/recipes-kernel/linux/linux.json`:

```json
{
    "name": "linux",
    "type": "kernel",
    "priority": 1,
    "source": "https://github.com/gaiaBuildSystem/linux",
    "support": ["linux/arm64"],
    "ref": { "linux/arm64": "<commit-hash>" },
    "afterDeployRecipes": ["dtb.xsh"],
    "merge": true
}
```

`cookbook/recipes-kernel/linux/dtb.xsh`:

```xonsh
#!/usr/bin/env xonsh

# use the xonsh environment to update the OS environment
$UPDATE_OS_ENVIRON = True
# always return if a cmd fails
$XONSH_SUBPROC_CMD_RAISE_ERROR = True

import os
import json
import os.path
from torizon_templates_utils.colors import print, BgColor, Color
from torizon_templates_utils.errors import Error_Out, Error

print("Deploying DTB artifacts ...", color=Color.WHITE, bg_color=BgColor.GREEN)

# get the common variables
_ARCH = os.environ.get('ARCH')
_MACHINE = os.environ.get('MACHINE')
_MAX_IMG_SIZE = os.environ.get('MAX_IMG_SIZE')
_BUILD_PATH = os.environ.get('BUILD_PATH')
_DISTRO_MAJOR = os.environ.get('DISTRO_MAJOR')
_DISTRO_MINOR = os.environ.get('DISTRO_MINOR')
_DISTRO_PATCH = os.environ.get('DISTRO_PATCH')
_USER_PASSWD = os.environ.get('USER_PASSWD')

# read the meta data
meta = json.loads(os.environ.get('META', '{}'))

# get the actual script path, not the process.cwd
_path = os.path.dirname(os.path.abspath(__file__))

_IMAGE_MNT_BOOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/boot"
_IMAGE_MNT_ROOT = f"{_BUILD_PATH}/tmp/{_MACHINE}/mnt/root"
os.environ['IMAGE_MNT_BOOT'] = _IMAGE_MNT_BOOT
os.environ['IMAGE_MNT_ROOT'] = _IMAGE_MNT_ROOT

if _MACHINE == "<machine1>" or _MACHINE == "<machine2>":
    # copy the device tree blob
    sudo -k cp -f \
        @(_BUILD_PATH)/tmp/@(_MACHINE)/linux/arch/arm64/boot/dts/<vendor>/<dtb>.dtb \
        @(_IMAGE_MNT_BOOT)/

    # copy overlays if present
    sudo -k mkdir -p @(_IMAGE_MNT_BOOT)/overlays
    sudo -k cp \
        @(_BUILD_PATH)/tmp/@(_MACHINE)/linux/arch/arm64/boot/dts/overlays/*.dtbo \
        @(_IMAGE_MNT_BOOT)/overlays/
else:
    Error_Out(
        f"Machine [{_MACHINE}] is not supported",
        Error.EINVAL
    )

print("Deploying DTB artifacts, OK", color=Color.WHITE, bg_color=BgColor.GREEN)
```

Place the kernel defconfig at `cookbook/recipes-kernel/linux/<machine>/<machine>_defconfig.template`.

#### Fstab

`cookbook/recipes-common/fstab/fstab.json`:

```json
{
    "name": "fstab",
    "type": "config",
    "priority": 1,
    "support": ["linux/arm64"],
    "merge": true
}
```

Place the board's fstab at `cookbook/recipes-common/fstab/<machine>/fstab`.

### Verify

```bash
./gaia/bitcook \
  --buildPath /home/user/workdir \
  --distro ./cookbook-<vendor>/distro-ref-<machine1>.json \
  --noCache \
  --installHostDeps
```

---

## New Board in Existing Cookbook

1. Add the machine to `schema/distro.json` `enum`
2. Create `distro-ref-<new-machine>.json` (copy an existing one, change `machine`)
3. Create `<new-machine>/` subdirectories in each recipe that is board-aware:
   - `recipes-bsp/u-boot/<new-machine>/`
   - `recipes-bsp/<firmware>/<new-machine>/`
   - `recipes-kernel/linux/<new-machine>/`
   - `recipes-common/fstab/<new-machine>/`
4. Update the `if _MACHINE ==` conditional branches in all `.xsh` scripts
5. Update `README.md` supported boards table
6. Verify with `bitcook`

---

## Reference

### Environment Variables in Scripts

| Variable | Description |
|----------|-------------|
| `MACHINE` | Target machine name (e.g. `"rpi5b"`) |
| `ARCH` | Target architecture (e.g. `"linux/arm64"`) |
| `BUILD_PATH` | Absolute path to the build output directory |
| `MAX_IMG_SIZE` | Maximum image size in MB |
| `DISTRO_MAJOR` | Distribution version major |
| `DISTRO_MINOR` | Distribution version minor |
| `DISTRO_PATCH` | Distribution version patch |
| `USER_PASSWD` | User password for the image |
| `META` | JSON string of the recipe's own metadata |
| `CLEAN_IMAGE` | `"true"` if in clean mode |
| `IMAGE_MNT_BOOT` | Set by scripts, path to mounted boot partition |
| `IMAGE_MNT_ROOT` | Set by scripts, path to mounted root partition |

### Recipe Phase Keys

| JSON Key | Phase | Description |
|----------|-------|-------------|
| `fetchRecipes` | fetch | Download/fetch source or binary artifacts |
| `buildRecipes` | build | Compile/build the source |
| `deployRecipes` | deploy | Install artifacts into the rootfs |
| `patchRecipes` | patch | Patch source during build (e.g. u-boot env) |
| `afterDeployRecipes` | after-deploy | Post-deploy tasks (e.g. DTB copy) |
| `initramfsRecipes` | initramfs | Add modules/scripts to initramfs |
| `afterBundleRecipes` | after-bundle | Final packaging (e.g. boot.img creation) |
| `sbomRecipes` | sbom | Generate SBOM (can be `.ts`) |

### Xonsh Syntax Quick Reference

| Syntax | Usage | Example |
|--------|-------|---------|
| `@()` | Subexpression, inline Python in shell | `cp @(_path)/@(_MACHINE)/file` |
| `$(...)` | Command substitution | `_out = $(sfdisk --json @(_img))` |
| `$VAR = val` | Set xonsh env var | `$BUILD_ROOT = _BUILD_ROOT` |
| Direct commands | Run shell natively | `sudo cp -f src dest` |
| `\` | Line continuation | Multi-line commands |
| `Error_Out(msg, err)` | Fatal error with message | `Error_Out(f"...", Error.EINVAL)` |

### Build Paths

```
$BUILD_PATH/
├── tmp/
│   └── <machine>/
│       ├── <recipe-name>/       # recipe build artifacts
│       ├── linux/               # kernel source
│       ├── u-boot/              # u-boot source
│       └── mnt/
│           ├── boot/            # mounted boot partition
│           └── root/            # mounted root partition
└── output/
    └── <machine>/
        └── <distro>-<machine>.img
```

### Priority and Merge

```
gaia/cookbook/           → core recipes (priority: 0)
cookbook-<vendor>/       → vendor overrides (priority: 1, merge: true)
```

- Higher `priority` wins for the same recipe `name`
- `"merge": true` means fields are merged (arrays like `patchRecipes` are appended)
- A vendor recipe without `"merge"` fully replaces the core recipe

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Cookbook directory | `cookbook-<vendor>` | `cookbook-rpi` |
| Distro file | `distro-ref-<machine>.json` | `distro-ref-rpi5b.json` |
| Machine name | lowercase alphanumeric | `rpi5b`, `imx8mp-verdin` |
| Recipe directory | `<name>/` | `u-boot/` |
| Board subdir | `<machine>/` | `rpi5b/` |
| Defconfig | `<machine>_defconfig.template` | `rpi5b_defconfig.template` |
| Script files | `<phase>.xsh` | `fetch.xsh`, `deploy.xsh` |

### Checklist

- [ ] `init` script installs xonsh + `torizon-templates-utils`
- [ ] `schema/distro.json` has the machine in its `enum`
- [ ] `distro-ref-<machine>.json` exists and validates
- [ ] `searchForRecipesOn` includes both core and vendor cookbooks
- [ ] Bootloader recipe with board-specific config (`.xsh`)
- [ ] Firmware recipe with fetch + deploy `.xsh` (if applicable)
- [ ] Kernel recipe with defconfig and DTB deploy `.xsh`
- [ ] Fstab config
- [ ] All `.xsh` scripts handle the new `MACHINE` value
- [ ] `README.md` updated
- [ ] Build completes: `./gaia/bitcook --buildPath /tmp/test --distro ./cookbook-<vendor>/distro-ref-<machine>.json --noCache`
