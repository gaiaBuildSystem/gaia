#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy configured issue ...")

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

logger.info(`Parsing issue ${_path}/issue.template ...`)
const _issue = FS.readFileSync(`${_path}/issue.template`, "utf-8")
    .replace(/{{ISSUE_LINE}}/g, process.env.ISSUE_LINE!)

// create the issue directory if it does not exist
if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/issue`)) {
    FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}/issue`, { recursive: true })
}

// dump the issue file
FS.writeFileSync(
    `${BUILD_PATH}/tmp/${MACHINE}/issue/issue`,
    _issue
)

// copy the issue file to the rootfs
execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/issue/issue ${IMAGE_MNT_ROOT}/etc/issue`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, issue is ok")
