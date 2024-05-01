#!/opt/bun/bin/bun

// TODO: allways check the https://docker.debian.net/ for the latest version

import * as FS from "fs"
import * as CRYPTO from "crypto"

import logger from "node-color-log"
import fetch from "node-fetch"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// read the meta data
const meta = JSON.parse(process.env.META as string)

// parse the url
const distroURL = `${meta.source}/raw/${meta.ref[ARCH]}/${meta.file}`
const filePath = `${BUILD_PATH}/tmp/${MACHINE}/debian/${meta.name}-${MACHINE}.tar.xz`

function checkHashsum(): boolean {
    const hashsum = CRYPTO.createHash("sha256")
    const fileData = FS.readFileSync(filePath)

    hashsum.update(fileData)
    const hash = hashsum.digest("hex")

    if (hash === meta.checksum[ARCH]) {
        return true
    } else {
        throw new Error(`hashsum mismatch: ${hash} != ${meta.checksum[ARCH]}`)
    }
}

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
    // check the hashsum
    if (checkHashsum()) {
        logger.success("hashsum ok")
    }
} else {
    // if the file does not exists, also the directory must not exists
    if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/debian`)) {
        FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}/debian`, { recursive: true })
    }

    // download the distro tar.gz
    logger.info(`downloading ${distroURL} ...`)

    const res = await fetch(distroURL)
    const buffer = await res.arrayBuffer()

    // write the file
    FS.writeFileSync(filePath, Buffer.from(buffer))

    // check the hashsum
    if (checkHashsum()) {
        logger.success("hashsum ok")
    }
}
