#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import FS from "node:fs"
import logger from "node-color-log"
import { execSync } from "node:child_process"

// run update in the chroot
logger.info("install the u-boot EFI assets ...")

const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

// in this step there is already a mounted image
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT


logger.info("installing u-boot image ...")

const UBOOT_DIR = `${BUILD_PATH}/tmp/${MACHINE}/u-boot`
const efiFiles = FS.readdirSync(UBOOT_DIR).filter(f => f.startsWith("u-boot-") && f.endsWith(".efi"))

if (efiFiles.length > 0) {
    const EFI_SRC = `${UBOOT_DIR}/${efiFiles[0]}`
    const EFI_DST = `${IMAGE_MNT_BOOT}/EFI/BOOT/${efiFiles[0]}`

    logger.info(`deploying u-boot EFI payload: ${efiFiles[0]} → ${EFI_DST}`)

    execSync(
        `sudo -k mkdir -p ${EFI_DST} && sudo -k cp ${EFI_SRC} ${EFI_DST}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    logger.success("u-boot EFI payload installed")
} else {
    logger.debug(`No u-boot *.efi found in ${UBOOT_DIR}, skipping EFI deploy`)
}

logger.success("u-boot image installed")

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
