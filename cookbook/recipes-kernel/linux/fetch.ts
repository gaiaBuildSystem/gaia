#!/usr/bin/env -S deno run --allow-all

import * as FS from "node:fs"

import { execSync } from "node:child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const GAIA_WORKSPACE = process.env.GAIA_WORKSPACE as string
const KERNEL_EDGE = process.env.KERNEL_EDGE === "true"

// read the meta data
const meta = JSON.parse(process.env.META as string)

// resolve which ref to fetch: --kernelEdge picks customData.ref.edge,
// otherwise customData.ref.stable is used. Recipes without a customData.ref
// (backward compatibility) fall back to the top level ref.
if (KERNEL_EDGE && meta.customData?.ref?.edge == null) {
    logger.warn(`--kernelEdge was set but ${meta.name} has no customData.ref.edge, falling back to stable`)
}

const _refSet = (KERNEL_EDGE ? meta.customData?.ref?.edge : null) ??
    meta.customData?.ref?.stable ??
    meta.ref

const _ref = _refSet[ARCH]

// Derive a filesystem-safe directory name from the source URL so that
// different kernel repos coexist under .common-fetch without collisions.
// e.g. "https://github.com/gaiaBuildSystem/linux.git" → "github.com-gaiaBuildSystem-linux"
const _sourceKey = meta.source
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/\//g, "-")

// The common repo is shared across ALL machines that use the same source URL.
// Only the heavy git objects are stored here — downloaded once.
const COMMON_REPO_PATH = `${GAIA_WORKSPACE}/.common-fetch/${_sourceKey}`

// The machine-specific path stays exactly where build.ts / deploy.ts / compose.yaml
// expect it, but it is now a git worktree backed by the common repo.
const MACHINE_LINUX_PATH = `${BUILD_PATH}/tmp/${MACHINE}/linux`

// --- Common repo: clone once, then just fetch ---

if (!FS.existsSync(COMMON_REPO_PATH)) {
    FS.mkdirSync(COMMON_REPO_PATH, { recursive: true })
    logger.info(`cloning ${meta.source} into common cache ${COMMON_REPO_PATH} ...`)
    execSync(
        `git clone ${meta.source} ${COMMON_REPO_PATH}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
} else {
    logger.info(`fetching ${meta.source} in common cache ...`)
    execSync(
        `git -C ${COMMON_REPO_PATH} fetch`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
}

// --- Machine worktree: add once, then just checkout ---

if (!FS.existsSync(MACHINE_LINUX_PATH)) {
    // Ensure the parent directory exists before adding the worktree
    FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}`, { recursive: true })

    logger.info(`adding git worktree for ${MACHINE} at ${MACHINE_LINUX_PATH} (${KERNEL_EDGE ? "edge" : "stable"}: ${_ref}) ...`)
    execSync(
        `git -C ${COMMON_REPO_PATH} worktree add -f --detach ${MACHINE_LINUX_PATH} ${_ref}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
} else {
    logger.info(`checkout ${_ref} (${KERNEL_EDGE ? "edge" : "stable"}) in worktree ${MACHINE_LINUX_PATH} ...`)
    execSync(
        `git -C ${MACHINE_LINUX_PATH} checkout ${_ref}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
}

logger.success(`${meta.name} ready at ${MACHINE_LINUX_PATH} (common cache: ${COMMON_REPO_PATH})`)
