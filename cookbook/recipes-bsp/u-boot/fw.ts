#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"
import { Recipe } from "../../../scripts/bitcook/parse"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"

// run update in the chroot
logger.info("Deploy fw_env.config ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const META = JSON.parse(process.env.META as string) as Recipe

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _paths = META.paths

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

const _fw_env_Path = getAssetPath(
    `${MACHINE}/fw_env.config`, _paths
)
logger.debug(`the fw_env.config is under [${_fw_env_Path}]`)

// check if the fw_env.config exists
if (!FS.existsSync(`${_fw_env_Path}`)) {
    logger.warn(`fw_env.config not found for ${MACHINE}, aborting deploy`)
    process.exit(0)
}

// apply the /etc/fw_env.config
execSync(
    `sudo -k ` +
    `cp -f ${_fw_env_Path} ${IMAGE_MNT_ROOT}/etc/fw_env.config`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })
logger.success("ok, fw_env.config deployed")
