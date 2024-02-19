#!/opt/bun/bin/bun

import * as FS from "fs"

import { execSync } from "child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// read the meta data
const meta = JSON.parse(process.env.META as string)

if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/neofetch`)) {
    // clone
    logger.info(`cloning ${meta.source} ...`)
    execSync(
        `git clone ${meta.source} ${BUILD_PATH}/tmp/${MACHINE}/neofetch`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
} else {
    // reset all
    logger.info(`resetting ${meta.name} ...`)
    execSync(
        `git -C ${BUILD_PATH}/tmp/${MACHINE}/neofetch reset --hard`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )

    // fetch
    logger.info(`fetching ${meta.name} ...`)
    execSync(
        `git -C ${BUILD_PATH}/tmp/${MACHINE}/neofetch fetch`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        })
}

// set the working directory
process.chdir(`${BUILD_PATH}/tmp/${MACHINE}/neofetch`)

// checkout
logger.info(`checkout ${meta.ref[ARCH]} ...`)
execSync(
    `git checkout ${meta.ref[ARCH]}`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8"
    }
)

logger.success(`${meta.name} cloned to ${BUILD_PATH}/tmp/${MACHINE}/neofetch`)
