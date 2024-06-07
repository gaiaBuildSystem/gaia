#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy os-release ...")

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

logger.info(`Parsing os-release ${_path}/os-release.template ...`)
const _os_release = FS.readFileSync(`${_path}/os-release.template`, "utf-8")
    .replace(/{{PRETTY_NAME}}/g, process.env.OS_RELEASE_PRETTY_NAME!)
    .replace(/{{NAME}}/g, process.env.OS_RELEASE_NAME!)
    .replace(/{{ID}}/g, process.env.OS_RELEASE_ID!)
    .replace(/{{VERSION}}/g, process.env.OS_RELEASE_VERSION!)
    .replace(/{{VERSION_CODENAME}}/g, process.env.OS_RELEASE_VERSION_CODENAME!)
    .replace(/{{HOME_URL}}/g, process.env.OS_RELEASE_HOME_URL!)
    .replace(/{{SUPPORT_URL}}/g, process.env.OS_RELEASE_SUPPORT_URL!)
    .replace(/{{BUG_REPORT_URL}}/g, process.env.OS_RELEASE_BUG_REPORT_URL!)
    .replace(/{{VARIANT}}/g, process.env.OS_RELEASE_VARIANT!)

// create the os-release directory if it does not exist
if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/os-release`)) {
    FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}/os-release`, { recursive: true })
}

// dump the os-release file
FS.writeFileSync(
    `${BUILD_PATH}/tmp/${MACHINE}/os-release/os-release`,
    _os_release
)

// copy the fstab file to the rootfs
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/os-release/os-release ${IMAGE_MNT_ROOT}/etc/os-release`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, os-release is ok")
