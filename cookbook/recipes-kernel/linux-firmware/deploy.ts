#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import logger from "node-color-log"
import { execSync } from "node:child_process"
import { Recipe } from "../../../scripts/bitcook/parse.ts"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath.ts"


// deploy the firmware blobs
logger.info("Deploying linux-firmware blobs ...")

const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
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
const _firmwareList = META.customData?.firmwares
// sanity check
if (_firmwareList == null) {
    logger.warn("No firmware files to install ...")
    process.exit(0)
}

for (const _fw of _firmwareList) {
    // search if the file is under one of the recipes listed
    const _filePath = _getAssetPath(_fw)
    // keep the relative path (e.g. qcom/qcs8300/qupv3fw.elf), it is the
    // path the kernel requests under /lib/firmware
    const _destDir = PATH.join(`${IMAGE_MNT_ROOT}/lib/firmware`, PATH.dirname(_fw))
    console.log(`Copying firmware file ${_filePath} to ${_destDir}/`)
    // copy the file to the image
    execSync(
        `sudo -k mkdir -p ${_destDir} && ` +
        `sudo -k ` +
        `cp ${_filePath} ` +
        `${_destDir}/`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
}


logger.success(`linux-firmware installed`)
