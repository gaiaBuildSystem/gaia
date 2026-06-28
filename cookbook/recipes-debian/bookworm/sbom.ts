#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import logger from "node-color-log"
import { execSync } from "node:child_process"
import process from "node:process";

// run update in the chroot
logger.info("checking if the distro rootfs is ok ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const IMAGE_NAME = process.env.IMAGE_NAME as string
const DO_SBOM = process.env.DO_SBOM as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${IMAGE_NAME}`
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
        `--distro-arch ${ARCH}`,
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
