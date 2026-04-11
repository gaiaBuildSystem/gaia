#!/opt/bun/bin/bun

import * as FS from "fs"

import { execSync } from "child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const GAIA_WORKSPACE = process.env.GAIA_WORKSPACE as string

// read the meta data
const meta = JSON.parse(process.env.META as string)

// Derive a filesystem-safe directory name from the source URL so that
// different u-boot repos coexist under .common-fetch without collisions.
// e.g. "https://github.com/gaiaBuildSystem/u-boot.git" → "github.com-gaiaBuildSystem-u-boot"
const _sourceKey = meta.source
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/\//g, "-")

// The common repo is shared across ALL machines that use the same source URL.
// Only the heavy git objects are stored here — downloaded once.
const COMMON_REPO_PATH = `${GAIA_WORKSPACE}/.common-fetch/${_sourceKey}`

// The machine-specific path stays exactly where build.ts / deploy.ts / compose.yaml
// expect it, but it is now a git worktree backed by the common repo.
const MACHINE_UBOOT_PATH = `${BUILD_PATH}/tmp/${MACHINE}/u-boot`

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

if (!FS.existsSync(MACHINE_UBOOT_PATH)) {
    // Ensure the parent directory exists before adding the worktree
    FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}`, { recursive: true })

    logger.info(`adding git worktree for ${MACHINE} at ${MACHINE_UBOOT_PATH} ...`)
    execSync(
        `git -C ${COMMON_REPO_PATH} worktree add --detach ${MACHINE_UBOOT_PATH} ${meta.ref[ARCH]}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
} else {
    logger.info(`checkout ${meta.ref[ARCH]} in worktree ${MACHINE_UBOOT_PATH} ...`)
    execSync(
        `git -C ${MACHINE_UBOOT_PATH} checkout ${meta.ref[ARCH]}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
}

logger.success(`${meta.name} ready at ${MACHINE_UBOOT_PATH} (common cache: ${COMMON_REPO_PATH})`)
