#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync, spawnSync } from "child_process"

// run update in the chroot
logger.info("checking if the distro rootfs is ok ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const DO_SBOM = process.env.DO_SBOM as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${MACHINE}-${DISTRO_MAJOR}-${DISTRO_MINOR}-${DISTRO_PATCH}.img`
process.env.IMAGE_PATH = IMAGE_PATH

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
const SBOM_OUTPUT_PATH = `${BUILD_PATH}/tmp/${MACHINE}/sbom`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

if (DO_SBOM === "true") {
    logger.info("Generating SBOM for Debian Bookworm ...")

    execSync(
        `pipx install debsbom[cdx,spdx,download] && ` +
        `mkdir -p ${SBOM_OUTPUT_PATH}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    // add the pipx debsbom to the path
    process.env.PATH = `${process.env.HOME}/.local/bin:` + process.env.PATH

    // RUN IT!
    execSync(
        `debsbom --progress ` +
        `generate ` +
        `-t cdx ` +
        `-r ${IMAGE_MNT_ROOT}/ ` +
        `--distro-name Debian ` +
        `--distro-version 12 ` +
        `--distro-arch arm64`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            cwd: SBOM_OUTPUT_PATH,
            encoding: "utf-8",
            env: process.env
        }
    )

    logger.success("SBOM generation completed successfully.")
}

process.exit(0)
