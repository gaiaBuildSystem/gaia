import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"



export function ExecPackage(recipes: Recipe[]): void {
    logger.info("Executing Packages ...")

    const ARCH = process.env.ARCH as string
    const MACHINE = process.env.MACHINE as string
    const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
    const DISTRO_MINOR = process.env.DISTRO_MINOR as string
    const DISTRO_PATCH = process.env.DISTRO_PATCH as string
    const USER_PASSWD = process.env.USER_PASSWD as string

    const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
    const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
    process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
    process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

    var _apt_updated: boolean = false

    // directly call the clean scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.targetDeps && recipe.targetDeps.length > 0) {
            logger.info(`Executing packages for ${recipe.name} ...`)

            // only for the first target package
            if (!_apt_updated) {
                // update the sources
                execSync(
                    `echo ${USER_PASSWD} | sudo -k -S ` +
                    `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "apt-get update"`,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8",
                        env: process.env
                    })
                _apt_updated = true
            }

            // put the deps in a string space separated
            const deps = recipe.targetDeps.join(" ")

            // install the deps
            execSync(
                `echo ${USER_PASSWD} | sudo -k -S ` +
                `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "apt-get install -y ${deps}"`,
                {
                    shell: "/bin/bash",
                    stdio: "inherit",
                    encoding: "utf-8",
                    env: process.env
                })
        }
    }
}
