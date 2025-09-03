#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"
import { Recipe } from "../../../scripts/bitcook/parse"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"

// deploy the firmware blobs
logger.info("Deplying linux-firmware blobs ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const META = JSON.parse(process.env.META as string) as Recipe

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _paths = META.paths
const _getAssetPath = (_filePath: string) => getAssetPath(_filePath, _paths)

// in this step there is already a mounted image
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT


// hey, let's copy the firmware files
let _firmwareList = META.customData?.firmwares
// sanity check
if (_firmwareList == null) {
    logger.warn("No firmware files to install ...")
    process.exit(0)
}

for (let _fw of _firmwareList) {
    // search if the file is under one of the recipes listed
    const _filePath = _getAssetPath(_fw)
    console.log(`Copying firmware file ${_filePath} to ${IMAGE_MNT_ROOT}/lib/firmware/`)
    // copy the file to the image
    execSync(
        `sudo -k ` +
        `cp ${_filePath} ` +
        `${IMAGE_MNT_ROOT}/lib/firmware/`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
}


logger.success(`linux-firmware installed`)
