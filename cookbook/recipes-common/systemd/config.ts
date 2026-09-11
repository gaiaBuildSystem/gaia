#!/usr/bin/env -S deno run --allow-all

import PATH from "node:path"
import logger from "node-color-log"
import { execSync } from "node:child_process"

// run update in the chroot
logger.info("config systemd ...")

const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// make the symlink
execSync(
    `sudo -k ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `ln -sf /lib/systemd/systemd /sbin/init` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// enable systemd services
execSync(
    `sudo -k ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `stat /sbin/init` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// make some configurations
execSync(
    `sudo -k ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
    `export DEBIAN_FRONTEND=noninteractive && ` +
    `apt-get install -y --reinstall systemd-timesyncd && ` +
    `systemctl unmask systemd-timesyncd && ` +
    `systemctl enable systemd-timesyncd && ` +
    `systemctl enable NetworkManager` +
    `"`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("ok, systemd config is ok")
