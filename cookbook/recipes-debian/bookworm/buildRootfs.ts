#!/opt/bun/bin/bun

/**
 * The true is that this should be a deploy step, not a build step.
 * But, we do not how to prioritize the deploy steps, so we are
 * using the build step to deploy the rootfs and have it ready for the
 * next deploy steps.
 */

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// create the disk image
logger.info("creating disk image ...")

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

// read the meta data
const meta = JSON.parse(process.env.META as string)
const DISTRO_TAR_FILE = `${BUILD_PATH}/tmp/${MACHINE}/debian/${meta.name}-${MACHINE}.tar`
process.env.DISTRO_TAR_FILE = DISTRO_TAR_FILE

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${MACHINE}-${DISTRO_MAJOR}-${DISTRO_MINOR}-${DISTRO_PATCH}.img`
process.env.IMAGE_PATH = IMAGE_PATH

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// unpack the rootfs to the mounted root partition
if (process.env.CLEAN_IMAGE === "true") {
    logger.info("unpacking rootfs ...")

    execSync(
        `sudo -E tar -xv -f $DISTRO_TAR_FILE -C $IMAGE_MNT_ROOT/`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
}
