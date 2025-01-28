#!/opt/bun/bin/bun

import * as FS from "fs"

import logger from "node-color-log"
import { execSync } from "child_process"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// read the meta data
const meta = JSON.parse(process.env.META as string)

// parse the url
const fileURL = `${meta.source}/${meta.file}`
const filePath = `${BUILD_PATH}/tmp/${MACHINE}/microsoft/powershell/${meta.file}`

// check if the file exists
if (!FS.existsSync(filePath)) {
    // create the path only in case
    FS.mkdirSync(
        `${BUILD_PATH}/tmp/${MACHINE}/microsoft/powershell`, { recursive: true }
    )

    logger.info(`Fetching ${meta.source} ...`)
    execSync(
        `wget ${fileURL} -O ${filePath}`,
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
