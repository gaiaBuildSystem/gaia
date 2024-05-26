#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy fastfetch ...")

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

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

process.env.OS_RELEASE_VERSION = `${DISTRO_MAJOR}.${DISTRO_MINOR}.${DISTRO_PATCH}`

// copy the binary to the /usr/bin
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/fastfetch/build/fastfetch ${IMAGE_MNT_ROOT}/usr/bin/fastfetch`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// check if we should also create a symlink to neofetch
if (process.env.ALIAS_NEOFETCH === "true") {
    execSync(
        `echo ${USER_PASSWD} | sudo -E -S ` +
        `chroot ${IMAGE_MNT_ROOT} /bin/bash -c ` +
        `"` +
        `ln -s /usr/bin/fastfetch /usr/bin/neofetch` +
        `"`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
}

logger.success("ok, fastfetch is ok")
