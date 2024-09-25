import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import PATH from "path"

export function ExecBundleIniramfs(recipes: Recipe[]): void {
    logger.info("Executing Bundle InitRamfs ...")

    if (process.env.RECIPE !== undefined) {
        logger.warn("Bundle InitRamfs will be skipped")
        logger.warn("cause: Running with RECIPE env variable set")
        return
    }

    // distro info
    const MACHINE = process.env.MACHINE as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const INITRAMFS_PATH = process.env.INITRAMFS_PATH as string
    const USER_PASSWD = process.env.USER_PASSWD as string
    const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
    const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
    process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
    process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

    // get the actual script path, not the process.cwd
    const _path = PATH.dirname(process.argv[1])

    // get the utils/makeInitramfs script
    const _makeInitramfs = PATH.join(
        _path,
        "..",
        "utils",
        "makeInitramfs"
    )

    /**
     * All the initramfs rootfs will be in the:
     * build-{DISTRO_NAME}/tmp/{MACHINE}/initramfs
     */
    execSync(
        `echo ${USER_PASSWD} | sudo -k -E -S ` +
        `${_makeInitramfs}`,
        {
            cwd: INITRAMFS_PATH,
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
}
