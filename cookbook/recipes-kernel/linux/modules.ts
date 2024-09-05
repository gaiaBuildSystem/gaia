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

// install the modules in the root partition
logger.info("installing kernel modules ...")
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

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `make modules_install ARCH=${LINUX_ARCH} INSTALL_MOD_PATH=${IMAGE_MNT_ROOT}`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("kernel modules installed")
