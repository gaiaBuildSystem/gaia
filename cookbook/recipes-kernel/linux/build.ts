#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "../../../scripts/bitcook/parse"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_NAME = process.env.DISTRO_NAME as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// get the recipe metadata
const META = JSON.parse(process.env.META as string) as Recipe

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _paths = META.paths.toString()
process.env.ORIGIN_PATH = _path
process.env.PODMAN_USERNS = "keep-id"

const _getAssetPath = (_filePath) => getAssetPath(_filePath, _paths)

// set the working directory
process.chdir(`${BUILD_PATH}/tmp/${MACHINE}/linux`)

// set the arch/<ARH>/defconfig
// WARNING: WE DO NOT SUPPORT 32 BITS ARCHITECTURES!!!!
//          PLEASE DOES NOT INXIST ON IT
let LINUX_ARCH = ARCH
let COMPILER = ""
let IMAGE_TYPE = ""

switch (ARCH) {
    case "linux/amd64":
        LINUX_ARCH = "x86"
        COMPILER = "x86_64-linux-gnu-"
        IMAGE_TYPE = "bzImage"
        break

    case "linux/arm64":
        LINUX_ARCH = "arm64"
        COMPILER = "aarch64-linux-gnu-"
        IMAGE_TYPE = "Image"
        break

    default:
        break
}

process.env.LINUX_ARCH = LINUX_ARCH
process.env.COMPILER = COMPILER
process.env.IMAGE_TYPE = IMAGE_TYPE

// replace the defconfig
const _templateDefConfigPath = _getAssetPath(`${MACHINE}/${MACHINE}_defconfig.template`)
logger.info(`Parsing defconfig ${_templateDefConfigPath} ...`)
const _defconfig = FS.readFileSync(`${_templateDefConfigPath}`, "utf-8")
    .replace(/{{dName}}/g, DISTRO_NAME)
    .replace(/{{v1}}/g, DISTRO_MAJOR)
    .replace(/{{v2}}/g, DISTRO_MINOR)
    .replace(/{{v3}}/g, DISTRO_PATCH)
FS.writeFileSync(`${BUILD_PATH}/tmp/${MACHINE}/linux/arch/${LINUX_ARCH}/configs/${MACHINE}_defconfig`, _defconfig)
logger.success(`defconfig ${MACHINE}_defconfig parsed`)

logger.info(`Building Linux Kernel for ${MACHINE} :: ${ARCH} ...`)

// get how many cores we have
process.env.JOBS = require("os").cpus().length

logger.info(`Updating builder image ...`)
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `podman-compose -f ${_path}/compose.yaml pull`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Builder image updated`)

logger.info(`Configuring ...`)
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
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
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `podman-compose -f ${_path}/compose.yaml run --rm linux-build`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Build done`)

if (process.env.KERNEL_LINUX_BUILD_MODULES === "false") {
    logger.warn(`Skipping modules build`)
} else {
    logger.info(`Building modules ...`)
    execSync(
        `echo ${USER_PASSWD} | sudo -k -S ` +
        `podman-compose -f ${_path}/compose.yaml run --rm linux-modules`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
    logger.success(`Modules built`)
}

// ? need to build the dtbs ?
if (LINUX_ARCH === "arm64") {
    logger.info(`Building dtbs ...`)
    execSync(
        `echo ${USER_PASSWD} | sudo -k -S ` +
        `podman-compose -f ${_path}/compose.yaml run --rm linux-dtb`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
    logger.success(`dtbs built`)
}
