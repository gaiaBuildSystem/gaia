#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import { execSync } from "child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_NAME = process.env.DISTRO_NAME as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
process.env.ORIGIN_PATH = _path
process.env.PODMAN_USERNS = "keep-id"

// set the working directory
process.chdir(`${BUILD_PATH}/tmp/${MACHINE}/linux`)

// set the arch/<ARH>/defconfig
// WARNING: WE DO NOT SUPPORT 32 BITS ARCHITECTURES!!!!
//          PLEASE DOES NOT INXIST ON IT
let LINUX_ARCH = ARCH
let COMPILER = ""
switch (ARCH) {
    case "linux/amd64":
        LINUX_ARCH = "x86"
        COMPILER = "x86_64-linux-gnu-"
        break

    case "linux/arm64":
        LINUX_ARCH = "arm64"
        COMPILER = "aarch64-linux-gnu-"
        break

    default:
        break
}
process.env.LINUX_ARCH = LINUX_ARCH
process.env.COMPILER = COMPILER

// replace the defconfig
logger.info(`Parsing defconfig ${_path}/${MACHINE}/defconfig.template ...`)
const _defconfig = FS.readFileSync(`${_path}/${MACHINE}/${MACHINE}_defconfig.template`, "utf-8")
    .replace(/{{dName}}/g, DISTRO_NAME)
    .replace(/{{v1}}/g, DISTRO_MAJOR)
    .replace(/{{v2}}/g, DISTRO_MINOR)
    .replace(/{{v3}}/g, DISTRO_PATCH)
FS.writeFileSync(`${BUILD_PATH}/tmp/${MACHINE}/linux/arch/${LINUX_ARCH}/configs/${MACHINE}_defconfig`, _defconfig)
logger.success(`defconfig ${MACHINE}_defconfig parsed`)

logger.info(`Building Linux Kernel for ${MACHINE} :: ${ARCH} ...`)

// get how many cores we have
process.env.JOBS = require("os").cpus().length

logger.info(`Configuring ...`)
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `podman-compose -f ${_path}/compose.yaml run --rm linux-config`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Configuration done`)

logger.info(`Building ...`)
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `podman-compose -f ${_path}/compose.yaml run --rm linux-build`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Build done`)

logger.info(`Building modules ...`)
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `podman-compose -f ${_path}/compose.yaml run --rm linux-modules`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Modules built`)

// ? need to build the dtbs ?
if (LINUX_ARCH === "arm64") {
    logger.info(`Building dtbs ...`)
    execSync(
        `echo ${USER_PASSWD} | sudo -E -S ` +
        `podman-compose -f ${_path}/compose.yaml run --rm linux-dtbs`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
    logger.success(`dtbs built`)
}
