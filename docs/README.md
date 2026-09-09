# Gaia Core Documentation

This set of documents covers how the Gaia Build System works, how to author recipes and distro manifests, and how to set up a development environment.

> [!NOTE]
> If you are looking for quick start instructions, see the project
> [README.md](../README.md). If you are an AI agent or you are looking for the
> exact build command contract, see the [AGENTS.md](../AGENTS.md) file.

## What is Gaia?

Gaia is a build system that creates Debian based Linux distributions. It uses Debian packages and Docker/Podman Debian containers to produce reproducible builds. The tool is written in TypeScript and runs under Deno (the `bitcook` wrapper drives `gaia.ts`).

## Table of Contents

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | How the build system works: the pipeline, the roles, and the ecosystem. |
| [Recipes](recipes.md) | The recipe format: every property, the recipe types, and the build stages. |
| [Distro Manifest](distro.md) | The `distro.json` format: how a target distribution is described. |
| [Build Steps](build-steps.md) | A detailed walkthrough of each build stage and what happens in it. |
| [Mimir](mimir.md) | The AI chat assistant that can help you build a distribution. |
| [Development](development.md) | Development environment, devcontainer, and how to contribute. |

## Concepts at a Glance

- **Recipe**: a unit of work that builds a single component (a package, the kernel, the rootfs, the bootloader) through a sequence of stages.
- **Distro Manifest**: a JSON file that describes the target distribution, its name, machine, architecture, version, and which recipes to include or exclude.
- **Cookbook**: a collection of recipes plus the tooling that turns them into a bootable image.
- **Build Pipeline**: the ordered stages Gaia runs for every recipe: `fetch → patch → build → deploy → bundle` (plus optional `initramfs`, `clean`, and `sbom` stages).

## Ecosystem

- **Gaia Core**: this repository. The build engine.
- **DeimOS**: the reference distribution Gaia builds (Debian + OS, named after the Greek god Deimos).
- **PhobOS**: a Debian based, Toradex Torizon compatible distribution (Deimos' brother, Phobos).
- **PergamOS**: a library of Debian based container images used to build and as a base for applications.

> Torizon™ is a registered trademark of Toradex Group AG. The Gaia project does
> not speak on behalf of Toradex or of any Toradex product.
