#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("deploy resize-helper service ...")

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

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${_path}/files/resize-helper ${IMAGE_MNT_ROOT}/usr/sbin/resize-helper`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${_path}/files/resize-helper.service ${IMAGE_MNT_ROOT}/etc/systemd/system/resize-helper.service`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `chmod +x /usr/sbin/resize-helper && systemctl enable resize-helper.service` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("ok, resize-helper service config is ok")
