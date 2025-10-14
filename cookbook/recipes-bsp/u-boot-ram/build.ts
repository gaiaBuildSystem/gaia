#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import { execSync } from "child_process"
import logger from "node-color-log"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"
import { Recipe } from "../../../scripts/bitcook/parse"

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
const _paths = META.paths
const _getAssetPath = (_filePath: string) => getAssetPath(_filePath, _paths)

process.env.ORIGIN_PATH = _path
process.env.PODMAN_USERNS = "keep-id"

// set the working directory
process.chdir(`${BUILD_PATH}/tmp/${MACHINE}/u-boot-ram`)

// replace the defconfig
logger.info(`Parsing defconfig ${_getAssetPath(`${MACHINE}/${MACHINE}_defconfig.template`)} ...`)
const _defconfig = FS.readFileSync(_getAssetPath(`${MACHINE}/${MACHINE}_defconfig.template`), "utf-8")
    .replace(/{{dName}}/g, DISTRO_NAME)
    .replace(/{{v1}}/g, DISTRO_MAJOR)
    .replace(/{{v2}}/g, DISTRO_MINOR)
    .replace(/{{v3}}/g, DISTRO_PATCH)
FS.writeFileSync(`${BUILD_PATH}/tmp/${MACHINE}/u-boot-ram/configs/${MACHINE}_defconfig`, _defconfig)
logger.success(`defconfig ${MACHINE}_defconfig parsed`)

logger.info(`Building u-boot-ram for ${MACHINE} :: ${ARCH} ...`)

// get how many cores we have
process.env.JOBS = require("os").cpus().length

logger.info(`Configuring ...`)
execSync(
    `sudo -k -E ` +
    `podman-compose -f ${_getAssetPath(`compose.yaml`)} run --rm u-boot-ram-config`,
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
    `sudo -k -E ` +
    `podman-compose -f ${_getAssetPath(`compose.yaml`)} run --rm u-boot-ram-build`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`Build done`)
