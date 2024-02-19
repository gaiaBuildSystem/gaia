#!/opt/bun/bin/bun

import PATH from "path"
import logger from "node-color-log"
import { execSync } from "child_process"

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
const meta = JSON.parse(process.env.META as string)

logger.info(`Addin source for ${meta.name} ...`)

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

let DPKG_ARCH = ""
switch (ARCH) {
    case "linux/amd64":
        DPKG_ARCH = "amd64"
        break

    case "linux/arm64":
        DPKG_ARCH = "aarch64"
        break

    default:
        break
}

// instructions from https://docs.docker.com/engine/install/debian/
execSync(
    `echo ${USER_PASSWD} | sudo -E -S ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `apt-get update && ` +
    `apt-get install -y ca-certificates curl && ` +
    `install -m 0755 -d /etc/apt/keyrings && ` +
    `curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && ` +
    `chmod a+r /etc/apt/keyrings/docker.asc && ` +
    `echo 'deb [arch=${DPKG_ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable' | ` +
    `tee /etc/apt/sources.list.d/docker.list > /dev/null && ` +
    `apt-get update` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success(`ok, source for ${meta.name} is ok`)
