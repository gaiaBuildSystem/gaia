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
const _file_path = `${BUILD_PATH}/tmp/${MACHINE}/microsoft/${meta.file}`

// check if the file exists
if (!FS.existsSync(_file_path)) {
    // create the path only in case
    FS.mkdirSync(
        `${BUILD_PATH}/tmp/${MACHINE}/microsoft`, { recursive: true }
    )

    logger.info(`Fetching ${meta.source} ...`)
    execSync(
        `wget ${meta.source} -O ${_file_path}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
    logger.success(`Fetched ${meta.name}!`)
} else {
    logger.success(`Using cached ${meta.name}!`)
}
