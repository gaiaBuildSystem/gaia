#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "../../../scripts/bitcook/parse"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"

// gaia need to previously set arhitecture and machine
const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const META = JSON.parse(process.env.META as string) as Recipe

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _paths = META.paths.toString()
const ORIGIN_PATH = _path
process.env.ORIGIN_PATH = _path

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${MACHINE}-${DISTRO_MAJOR}-${DISTRO_MINOR}-${DISTRO_PATCH}.img`
process.env.IMAGE_PATH = IMAGE_PATH

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

const _getAssetPath = (_filePath) => getAssetPath(_filePath, _paths)

logger.info(`Parsing grub.cfg ${_path}/grub.cfg.template ...`)

// get it from the recipe origin or from here
const _grub_cfg_template_Path = _getAssetPath(`grub.cfg.template`)

const _grubCFG = FS.readFileSync(`${_grub_cfg_template_Path}`, "utf-8")
    .replace(/{{GRUB_KERNEL_CMDLINE}}/g, process.env.GRUB_KERNEL_CMDLINE!)

// create the issue directory if it does not exist
if (!FS.existsSync(`${BUILD_PATH}/tmp/${MACHINE}/grub`)) {
    FS.mkdirSync(`${BUILD_PATH}/tmp/${MACHINE}/grub`, { recursive: true })
}

// dump the parsed file
FS.writeFileSync(
    `${BUILD_PATH}/tmp/${MACHINE}/grub/grub.cfg`,
    _grubCFG
)

// chroot into the rootfs and install the grub
logger.info("installing grub ...")

// get the loop device
const DEV_LOOP = execSync(
    `losetup -j ${IMAGE_PATH} | awk -F ':' '{print $1}'`,
    {
        shell: "/bin/bash",
        stdio: "pipe",
        encoding: "utf-8",
        env: process.env
    }).trim()

logger.debug(`Loop device is: `)
logger.debug(`  ${DEV_LOOP}`)

execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `grub-install --target=x86_64-efi ` +
    `--efi-directory=${IMAGE_MNT_BOOT} ` +
    `--boot-directory=${IMAGE_MNT_BOOT} ` +
    `--recheck ` +
    `--no-nvram ` +
    `--removable ` +
    `${DEV_LOOP}`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.info("installing bootloader splash screen ...")

// move the splash image to the boot partition
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${process.env.GRUB_SPLASH_PATH} ` +
    `${IMAGE_MNT_BOOT}/splash.png`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.info("installing grub configuration ...")

// move the grub.cfg to the boot partition
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${BUILD_PATH}/tmp/${MACHINE}/grub/grub.cfg ` +
    `${IMAGE_MNT_BOOT}/EFI/BOOT/grub.cfg`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success("grub installed successfully")
