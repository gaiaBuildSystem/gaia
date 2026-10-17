#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import logger from "node-color-log"
import { execSync, spawnSync } from "node:child_process"

// run update in the chroot
logger.info("checking if the distro rootfs is ok ...")

const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const IMAGE_NAME = process.env.IMAGE_NAME as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${IMAGE_NAME}`
process.env.IMAGE_PATH = IMAGE_PATH

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

execSync(
    `sudo -k ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "apt-get update"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, distro rootfs is ok")

if (process.env.ROOTFS_DEBUG != null) {
    logger.debug("rootfs debug enabled")

    // interactive shell to chroot
    spawnSync(
        `/bin/bash`,
        {
            env: process.env,
            stdio: "inherit",
            encoding: "utf-8"
        }
    )

    logger.debug("exited from rootfs debug")
}
