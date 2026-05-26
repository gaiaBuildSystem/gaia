import process from "node:process";
import FS from "node:fs"
import PATH from "node:path"
import { execSync } from "node:child_process"
import logger from "node-color-log"

import { Recipe } from "./parse.ts"
import { canExecRecipe } from "./utils/recipeMatch.ts"

function _getCookbookDir (recipeOrigin: string): string {
    let _cookbookDir = ""
    _cookbookDir = recipeOrigin.substring(
        0,
        recipeOrigin.indexOf("/cookbook/")
    )

    return `${_cookbookDir}/`
}

export function CheckDependencies (recipes: Recipe[]): void {
    logger.info("Checking dependencies ...")

    const USER_PASSWD = process.env.USER_PASSWD as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const ARCH = process.env.ARCH as string
    const FARCH = ARCH.replace("/", "-")
    const DISTRO_NAME = process.env.DISTRO_NAME as string
    const INSTALL_HOST_DEPS = process.env.INSTALL_HOST_DEPS as string
    const NO_CACHE = process.env.CLEAN_IMAGE as string
    const MACHINE = process.env.MACHINE as string
    const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
    const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`

    if (INSTALL_HOST_DEPS === "true") {
        logger.debug(`INSTALL_HOST_DEPS=${INSTALL_HOST_DEPS}`)
    }

    // check if the recipes have the required dependencies
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        const HOST_CONTAINER_NAME = `${recipe.name}-${DISTRO_NAME}-${FARCH}-host`

        if (recipe.hostAsContainer === true) {
            logger.info(`Checking container for ${recipe.name} ...`)

            // check if the container exists or create it
            let _hostContainerExists = false
            try {
                execSync(
                    `sudo -k ` +
                    `podman inspect ${HOST_CONTAINER_NAME}`,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8"
                    }
                )
                _hostContainerExists = true
            } catch (_error) {
                _hostContainerExists = false
            }

            // if not create it and install the dependencies
            if (!_hostContainerExists) {
                logger.info(`Creating container ${HOST_CONTAINER_NAME} for platform ${ARCH} ...`)

                let _pathsBinding = ``
                const _pathsToInit: string[] = []

                for (const _path of recipe.paths) {
                    const _pathCookbookDir = _getCookbookDir(_path.path)
                    logger.debug(`Path ${_path} :: Cookbook path ${_pathCookbookDir}`)

                    _pathsToInit.push(_pathCookbookDir)
                    _pathsBinding += `-v ${_pathCookbookDir}:${_pathCookbookDir} `
                }

                // mount also the root and boot
                if (FS.existsSync(IMAGE_MNT_ROOT)) {
                    _pathsBinding += `-v ${IMAGE_MNT_ROOT}:${IMAGE_MNT_ROOT}:slave `
                }

                if (FS.existsSync(IMAGE_MNT_BOOT)) {
                    _pathsBinding += `-v ${IMAGE_MNT_BOOT}:${IMAGE_MNT_BOOT}:slave `
                }

                let _extraConfig = ""
                if (recipe.containerImage.extraConfig) {
                    _extraConfig = recipe.containerImage.extraConfig
                }

                logger.debug(`Mount bindings: ${_pathsBinding}`)

                execSync(
                    `sudo -k ` +
                    `podman run -d --name ${HOST_CONTAINER_NAME} --replace --platform ${ARCH} --net=host ` +
                    `-v ${BUILD_PATH}:${BUILD_PATH} ` +
                    `${_pathsBinding}` +
                    `${_extraConfig} ` +
                    `${recipe.containerImage.image}:${recipe.containerImage.tag} ` +
                    `/bin/bash -c "` +
                    `tail -f /dev/null` +
                    `"`,
                    {
                        cwd: recipe.recipeOrigin,
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8",
                        env: process.env
                    }
                )

                // install at least some utils
                execSync(
                    `sudo -k ` +
                    `podman exec -it ${HOST_CONTAINER_NAME} ` +
                    `/bin/bash -c "` +
                    `apt-get update && apt-get install sudo` +
                    `"`,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8"
                    }
                )

                for (const _cookbookdir of _pathsToInit) {
                    logger.debug(`Checking if init exists for Cookbook path [${_cookbookdir}]`)

                    if (FS.existsSync(PATH.join(_cookbookdir, "init"))) {
                        logger.info(`Run init for Cookbook path [${_cookbookdir}]`)

                        try {
                            execSync(
                                `sudo -k ` +
                                `podman exec -it ${HOST_CONTAINER_NAME} ` +
                                `/bin/bash -c "` +
                                `cd ${_cookbookdir} && ./init` +
                                `"`,
                                {
                                    shell: "/bin/bash",
                                    stdio: "inherit",
                                    encoding: "utf-8"
                                }
                            )
                        } catch (_error) {
                            // destroy the container
                            execSync(
                                `sudo -k ` +
                                `podman rm -vf ${HOST_CONTAINER_NAME}`,
                                {
                                    shell: "/bin/bash",
                                    stdio: "inherit",
                                    encoding: "utf-8"
                                }
                            )

                            throw new Error(`Init for Cookbook path [${_cookbookdir}] failed`)
                        }
                    }
                }
            } else {
                logger.info(`Container ${HOST_CONTAINER_NAME} exists`)
            }

            // make sure the container is running
            logger.debug(`Stopping state ${HOST_CONTAINER_NAME}`)
            execSync(
                `sudo -k ` +
                `podman stop ${HOST_CONTAINER_NAME} `,
                {
                    shell: "/bin/bash",
                    stdio: "inherit",
                    encoding: "utf-8"
                }
            )

            logger.debug(`Starting state ${HOST_CONTAINER_NAME}`)
            try {
                execSync(
                    `sudo -k ` +
                    `podman start ${HOST_CONTAINER_NAME} `,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8"
                    }
                )
            } catch (_error) {
                logger.warn(`Container ${HOST_CONTAINER_NAME} state is broken, trying again ...`)
                execSync(
                    `sudo -k ` +
                    `podman start ${HOST_CONTAINER_NAME} `,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8"
                    }
                )
            }

            // install the dependencies if any
            if (recipe.hostDeps && recipe.hostDeps.length > 0) {
                logger.info(`Checking dependencies for ${recipe.name} ...`)
                try {
                    execSync(
                        `sudo -k ` +
                        `podman exec -it ${HOST_CONTAINER_NAME} ` +
                        `/bin/bash -c "` +
                        `apt-get update && ` +
                        `apt-get install -y ${recipe.hostDeps.join(" ")}` +
                        `"`,
                        {
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8"
                        }
                    )
                } catch (_error) {
                    logger.error(`Dependencies for ${recipe.name} :: error during dependency install`)
                    throw new Error(`Dependencies for ${recipe.name} :: error during dependency install`)
                }
            }
        } else if (recipe.hostDeps && recipe.hostDeps.length > 0) {
            logger.info(`Checking dependencies for ${recipe.name} ...`)

            // check if the recipe need a init
            const _pathsToInit: string[] = []
            for (const _path of recipe.paths) {
                const _pathCookbookDir = _getCookbookDir(_path.path)
                logger.debug(`Path ${_path} :: Cookbook path ${_pathCookbookDir}`)

                _pathsToInit.push(_pathCookbookDir)
            }

            for (const _cookbookdir of _pathsToInit) {
                logger.debug(`Checking if init exists for Cookbook path [${_cookbookdir}]`)

                if (FS.existsSync(PATH.join(_cookbookdir, "init"))) {
                    logger.info(`Run init for Cookbook path [${_cookbookdir}]`)

                    try {
                        execSync(
                            `sudo -k ` +
                            `/bin/bash -c "` +
                            `cd ${_cookbookdir} && ./init` +
                            `"`,
                            {
                                shell: "/bin/bash",
                                stdio: "inherit",
                                encoding: "utf-8"
                            }
                        )
                    } catch (_error) {
                        logger.error(`Init for Cookbook path [${_cookbookdir}] failed`)
                        throw new Error(`Init for Cookbook path [${_cookbookdir}] failed`)
                    }
                }
            }

            // WARN: we do not mess up with the host system
            // check if the dependencies are installed but not install it
            // unless the user wants to
            for (const dep of recipe.hostDeps) {
                logger.info(`Checking dependency ${dep} ...`)
                // use dpkg to check if the dependency is installed
                try {
                    execSync(
                        `dpkg -s ${dep}`,
                        {
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8"
                        }
                    )
                } catch (_error) {
                    // dependency not installed
                    if (INSTALL_HOST_DEPS === "false") {
                        logger.error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                        throw new Error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                    } else {
                        // the user want it
                        logger.info(`Installing host dependency ${dep} ...`)

                        // install the dependency
                        try {
                            execSync(
                                `sudo -k ` +
                                `/bin/bash -c "` +
                                `apt-get update && ` +
                                `apt-get install -y ${dep}` +
                                `"`,
                                {
                                    shell: "/bin/bash",
                                    stdio: "inherit",
                                    encoding: "utf-8"
                                }
                            )
                        } catch (_error) {
                            logger.error(`Dependencies for ${recipe.name} :: error during dependency install`)
                            throw new Error(`Dependencies for ${recipe.name} :: error during dependency install`)
                        }
                    }
                }
            }
        }
    }
}
