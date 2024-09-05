#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import { execSync } from "child_process"
import logger from "node-color-log"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_NAME = process.env.DISTRO_NAME as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
process.env.ORIGIN_PATH = _path

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

// move the script to the chroot
execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${_path}/setupInit.sh ${IMAGE_MNT_ROOT}/setupInit.sh`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${_path}/init.sh ${IMAGE_MNT_ROOT}/init.sh`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${_path}/init.php ${IMAGE_MNT_ROOT}/init.php`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${_path}/noStress.png ${IMAGE_MNT_ROOT}/noStress.png`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// execute
execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `chroot ${IMAGE_MNT_ROOT} /bin/bash /setupInit.sh`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// move the initramfs to the boot partition
execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `mv ${IMAGE_MNT_ROOT}/initramfs.cpio.gz ${IMAGE_MNT_BOOT}/`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `mkdir -p ${BUILD_PATH}/tmp/${MACHINE}/initramfs`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

execSync(
    `echo ${USER_PASSWD} | sudo -k -E -S ` +
    `cp ${IMAGE_MNT_BOOT}/initramfs.cpio.gz ${BUILD_PATH}/tmp/${MACHINE}/initramfs/initramfs.cpio.gz`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("ok, initramfs is ok")
