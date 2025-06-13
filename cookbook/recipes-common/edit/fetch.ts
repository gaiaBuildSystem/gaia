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
const _file_path = `${BUILD_PATH}/tmp/${MACHINE}/edit`

let _source = `none`
if (ARCH === "linux/amd64") {
    _source = `https://github.com/microsoft/edit/releases/download/v${meta.version}/edit-${meta.version}-x86_64-linux-gnu.tar.zst`
} else {
    _source = `https://github.com/microsoft/edit/releases/download/v${meta.version}/edit-${meta.version}-aarch64-linux-gnu.tar.zst`
}

// check if the file exists
if (!FS.existsSync(_file_path)) {
    // create the path only in case
    FS.mkdirSync(
        `${_file_path}`, { recursive: true }
    )

    logger.info(`Fetching ${meta.source} ...`)
    execSync(
        `wget ${_source} -O ${_file_path}/edit.tar.zst`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
    logger.success(`Fetched ${meta.name}!`)
    logger.info(`Uncompressing ${meta.name} ...`)

    execSync(
        `tar -I zstd -xf ${_file_path}/edit.tar.zst -C ${_file_path}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )
    logger.success(`Uncompressed ${meta.name}!`)
} else {
    logger.success(`Using cached ${meta.name}!`)
}
