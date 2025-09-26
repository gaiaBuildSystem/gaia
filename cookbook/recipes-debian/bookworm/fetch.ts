#!/opt/bun/bin/bun

// TODO: allways check the https://docker.debian.net/ for the latest version

import * as FS from "fs"
import * as CRYPTO from "crypto"

import logger from "node-color-log"
import { execSync } from "child_process"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// read the meta data
const meta = JSON.parse(process.env.META as string)

// parse the url
const filePath = `${BUILD_PATH}/tmp/${MACHINE}/debian/${meta.name}-${MACHINE}.tar`


// if clean we clean
if (process.env.CLEAN_IMAGE === "true") {
    logger.debug("cleaning ...")
    if (FS.existsSync(filePath)) {
        FS.unlinkSync(filePath)
    }
}


// check if the file exists
if (FS.existsSync(filePath)) {
    logger.info(`file ${filePath} already exists`)
} else {
    // if the file does not exists, also the directory must not exists
    if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/debian`)) {
        FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}/debian`, { recursive: true })
    }

    // get it from dockerhub
    let _podmanCmd =
        `podman pull docker.io/debian@sha256:${meta.checksum[ARCH]}` +
        ` && ` +
        `podman create --name temp_debian_image docker.io/debian@sha256:${meta.checksum[ARCH]}` +
        ` && ` +
        `podman export -o ${filePath} temp_debian_image` +
        ` && ` +
        `podman rm temp_debian_image`

    // download the distro tar.gz
    logger.info(`downloading ${filePath} ...`)

    execSync(
        _podmanCmd,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    logger.success(`file ${filePath} downloaded`)
}
