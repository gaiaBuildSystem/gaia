# Development

How to set up a workspace, run builds, and contribute to Gaia.

For the **user-facing** build commands and warnings, see [AGENTS.md](../AGENTS.md)
and [build-steps.md](./build-steps.md). This page focuses on developer workflow.

## Prerequisites

| Tool | Why |
|------|-----|
| **Deno** | The build engine, recipes tooling, and Mimir are Deno/TypeScript scripts. |
| **Docker + the Compose plugin** | Required to build the devcontainer and to build distributions (Gaia builds inside containers). The Compose *plugin* is required, not the legacy `docker-compose`. |
| **Git** | To fetch the core and any cookbook repositories. |

The host dependencies needed *inside* a build container are installed on demand by
passing `--installHostDeps` to `bitcook` (a one-time, cached operation).

## Getting the source

### Single repository (Gaia Core + DeimOS)

Clone the core repository and build from its root:

```bash
git clone https://github.com/gaiaBuildSystem/gaia.git
cd gaia
./bitcook --buildPath /absolute/path/to/workdir \
          --distro ./distro-ref-qemux86-64.json \
          --noCache --installHostDeps
```

> `--buildPath` must be an **absolute** path; `--distro` must be a **relative**
> path to a `distro-*.json` file. The build system creates a
> `build-<distro>` folder inside the build path.

### Multi-cookbook (manifest + repo util)

For targets that need additional cookbooks (e.g. PhobOS, vendor trees), lay out a
workdir that contains the `gaia` repository, the other cookbook repositories, and a
`manifest.json` describing them.

`manifest.json` (schema enforced by `scripts/utils/repo.ts`):

```json
{
    "name": "Rasp DeimOS",
    "description": "Raspberry Pi DeimOS repo cookbook manifest",
    "maintainer": "you@example.org",
    "repositories": [
        {
            "name": "Cookbook RPi",
            "path": "cookbook-rpi",
            "url": "https://github.com/gaiaBuildSystem/cookbook-rpi.git",
            "revision": "<commit-sha>"
        }
    ]
}
```

Then run the init script (from the workdir root, where `./gaia` and
`./manifest.json` live):

```bash
./gaia/scripts/init
```

`scripts/init` does the following:

1. **Substitutes placeholders**: replaces `__pwd__`, `__uid__`, `__gid__`, and
   `__dgid__` in `.devcontainer/*`, `.vscode/settings.json`, and
   `scripts/utils/repo.ts` with your actual workspace path and user/group/docker
   group ids. This avoids Docker-in-Docker mount and ownership problems.
2. **Builds the devcontainer** image (`pergamos/gaia-workspace-dev:latest`).
3. **Syncs repositories**: if a `manifest.json` exists, it runs the `repo`
   service (`scripts/utils/repo.ts`), which clones (or updates) each listed
   repository to its `revision`, runs each repo's optional `./init` script, and
   generates a `gaia.code-workspace` file in the workdir root with JSON-schema
   validation wired to `schema/distro.json` and `schema/recipe.json`.
4. **Re-substitutes** the placeholders (repo syncing can overwrite them) and
   **starts the dev shell**.

> The recommended working directory when running `bitcook` is the **root of the
> workdir**, not the root of the `gaia` repository.

## The devcontainer

Defined under `.devcontainer/`:

| File | Role |
|------|------|
| `Containerfile` | Builds `pergamos/gaia-workspace-dev:latest` from `pergamos/podman:trixie`; installs host deps, Deno, and a non-root `gaia` user (uid 1000). |
| `docker-compose.yml` | Services: `build` (builds the image), `repo` (runs the repo util), `dev` (privileged shell with host network/pid/cgroup). |
| `devcontainer.json` | VS Code Dev Container config: mounts the workspace + Docker socket, runs as the `gaia` user, and installs the recommended extensions (Deno, Docker, Python, YAML, etc.). |

The container is **privileged** with `--net=host` and `--cgroupns=host` because
Gaia builds images inside the container. It mounts the workspace (its parent
directory) and `/var/run/docker.sock` so nested builds can reach the host Docker
daemon.

## Code conventions

- **Runtime & language**: Deno + TypeScript in **strict** mode (`deno.json`).
- **Import map**: third-party modules are pinned in the `deno.json` `imports` map:
  `@melker/melker` (JSR), `@xterm/headless`, `ajv`, and `node-color-log` (npm),
  with `nodeModulesDir: "auto"`.
- **Scripts**: entry points use the shebang
  `#!/usr/bin/env -S deno run --allow-all` and are executable, so they can be run
  directly (e.g. `./bitcook`, `deno run scripts/bitcook/mimirOpentui.ts`).
- **Keep docs in sync**: when you change behavior, update the matching page in
  [docs/](./README.md) and [AGENTS.md](../AGENTS.md).

## Repository layout

| Path | Purpose |
|------|---------|
| `bitcook` | The wrapper that runs the build engine (`scripts/bitcook/gaia.ts`). |
| `scripts/bitcook/` | Build engine, build steps, and the Mimir assistant. |
| `scripts/utils/` | Helpers (repo util, dep installer, asset path, recipe matching). |
| `distro/` | DeimOS distro definitions (`distro-ref-*.json`). |
| `schema/` | JSON Schemas for `distro-*.json` and recipes. |
| `templates/` | Build templates (e.g. `DeimOS-base/`). |
| `tests/` | Test fixtures / test distro (`test-distro.json`). |
| `docs/` | This documentation. |

## Contributing

1. Follow the existing patterns and file conventions in the area you touch.
2. Validate `distro-*.json` and recipes against `schema/` (the generated
   `.code-workspace` enforces this in VS Code).
3. Run the affected build step with `bitcook --step <step>` when iterating.
4. Update the relevant doc page and keep [AGENTS.md](../AGENTS.md) accurate.
