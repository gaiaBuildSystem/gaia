#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"

// run update in the chroot
logger.info("creating userlogin ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// specific env vars
const USER = process.env.USER_LOGIN_USER as string
const PSWD = process.env.USER_LOGIN_PASSWORD as string
const ROOT_NO_PASSWD = process.env.USER_ROOT_PASSWORDLESS as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// configure root to be passwordless
if (ROOT_NO_PASSWD === "true") {
    const root_no_passwd =
        `echo ${USER_PASSWD} | sudo -E -S ` +
        `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "passwd -d root"`

    execSync(root_no_passwd,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
    logger.debug("root is passwordless")
}

const str_cmd =
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `id -u ${USER} &>/dev/null || ` + // Check if user exists
    `useradd -m ${USER} && ` +
    `echo -e "${USER}:${PSWD}" | chpasswd ${USER} && ` +
    `usermod -aG sudo ${USER} && ` +
    `echo ${PSWD} | su - ${USER} -c 'whoami'` +
    `"`

execSync(str_cmd,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, user login is ok")
