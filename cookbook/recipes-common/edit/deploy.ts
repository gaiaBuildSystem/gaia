#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy Microsoft edit ...")

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// read the meta data
const meta = JSON.parse(process.env.META as string)
const _file_path = `${BUILD_PATH}/tmp/${MACHINE}/edit`


execSync(
    `sudo -k ` +
    `cp ${_file_path}/edit ${IMAGE_MNT_ROOT}/usr/bin/edit`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, Microsoft edit deployed!")
