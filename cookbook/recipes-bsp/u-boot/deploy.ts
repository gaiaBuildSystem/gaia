#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("install the u-boot assets ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

// in this step there is already a mounted image
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// if the machine is the qemux86-64, we need to install the EFI payload
// so, we skip this script
if (MACHINE === "qemux86-64") {
    logger.debug(`Skipping default u-boot deploy flow for ${MACHINE}`)
    logger.debug(`${MACHINE} should use the efi-payload script instead`)
    process.exit(0)
}

logger.info("installing u-boot image ...")
execSync(
    `sudo -k ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/u-boot/u-boot.bin ${IMAGE_MNT_BOOT}/`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
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
