#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import FS from "node:fs"
import logger from "node-color-log"
import { execSync } from "node:child_process"

// run update in the chroot
logger.info("install the u-boot assets ...")

const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

// in this step there is already a mounted image
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// for machines that use EFI this will not exists
const UBOOT_BIN = `${BUILD_PATH}/tmp/${MACHINE}/u-boot/u-boot.bin`

if (FS.existsSync(UBOOT_BIN)) {
    logger.info("installing u-boot image ...")
    execSync(
        `sudo -k ` +
        `cp ${UBOOT_BIN} ${IMAGE_MNT_BOOT}/`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
    logger.success("u-boot image installed")
} else {
    logger.warn(`uboot.bin not found at ${UBOOT_BIN}, skipping u-boot installation`)
}

logger.info("installing boot script ...")
execSync(
    `sudo -k ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/u-boot/boot.scr.uimg ${IMAGE_MNT_BOOT}/`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    }
)
logger.success(`boot script installed`)
