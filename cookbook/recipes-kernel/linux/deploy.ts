#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("checking if the distro rootfs is ok ...")

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

// install the kernel image on the boot partition
let LINUX_IMAGE = "vmlinuz"
let LINUX_ARCH = ARCH
if (ARCH === "linux/arm64") {
    LINUX_ARCH = "arm64"
    LINUX_IMAGE = "Image"
} else if (ARCH === "linux/amd64") {
    LINUX_ARCH = "x86"
    LINUX_IMAGE = "bzImage"
}

logger.info("installing kernel image ...")
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/linux/arch/${LINUX_ARCH}/boot/${LINUX_IMAGE} ${IMAGE_MNT_BOOT}/`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("kernel image installed")
