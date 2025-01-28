#!/opt/bun/bin/bun

import PATH from "path"
import { execSync } from "child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const INITRAMFS_PATH = process.env.INITRAMFS_PATH as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
process.env.ORIGIN_PATH = _path

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${_path}/init.sh ${INITRAMFS_PATH}/init`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `chmod +x ${INITRAMFS_PATH}/init`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// copy the busybox static to the initramfs
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${IMAGE_MNT_ROOT}/usr/bin/busybox ${INITRAMFS_PATH}/bin/busybox`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// copy the common scripts to the initramfs
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${_path}/scripts/* ${INITRAMFS_PATH}/scripts/`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// give them the right permissions
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `chmod +x ${INITRAMFS_PATH}/scripts/*`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("ok, initramfs is ok")
