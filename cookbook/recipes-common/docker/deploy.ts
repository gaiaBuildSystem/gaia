#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
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

logger.info(`Installing ${meta.name} ...`)

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// instructions from https://docs.docker.com/engine/install/debian/
execSync(
    `sudo -k ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `apt-get install -y ` +
    `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// fixup the /etc/init.d/docker
execSync(
    `sudo -k ` +
    `sed -i 's/ulimit -Hn 524288/ulimit -n 524288/' ${IMAGE_MNT_ROOT}/etc/init.d/docker`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })


logger.success(`ok, install ${meta.name} is ok`)
