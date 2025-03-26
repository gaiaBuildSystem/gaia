#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy hostname ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// recipe env
const HOSTNAME_NAME = process.env.HOSTNAME_NAME as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _deployPath = `${BUILD_PATH}/tmp/${MACHINE}/hostname`

// check if the deploy path exists
if (!FS.existsSync(_deployPath)) {
    logger.info("deploy path does not exists, creating ...")
    FS.mkdirSync(_deployPath, { recursive: true })
}

// write the HOSTNAME_NAME to the hostname file
FS.writeFileSync(`${_deployPath}/hostname`, `${HOSTNAME_NAME}\n`)

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT


execSync(
    `sudo -k ` +
    `cp ${_deployPath}/hostname ${IMAGE_MNT_ROOT}/etc/hostname`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// also we need to update the /etc/hosts file
execSync(
    `sudo -k bash -c '` +
    `echo "127.0.0.1\t${HOSTNAME_NAME}" >> ${IMAGE_MNT_ROOT}/etc/hosts` +
    `'`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("ok, hostname is ok")
