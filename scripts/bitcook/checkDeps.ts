import FS from "fs"
import PATH from "path"
import { execSync } from "child_process"
import logger from "node-color-log"

import { Recipe } from "./parse"

export function CheckDependencies(recipes: Recipe[]): void {
    logger.info("Checking dependencies ...")

    const USER_PASSWD = process.env.USER_PASSWD as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const ARCH = process.env.ARCH as string

    // check if the recipes have the required dependencies
    for (const recipe of recipes) {
        // check if the recipe has a fetch script
        if (recipe.hostDeps && recipe.hostDeps.length > 0) {
            logger.info(`Checking dependencies for ${recipe.name} ...`)

            if (recipe.hostAsContainer === true) {
                // check if the container exists or create it
                // and then check if the dependencies are installed
                let _hostContainerExists = false
                try {
                    execSync(
                        `echo ${USER_PASSWD} | sudo -E -S ` +
                        `podman inspect ${recipe.name}-host`,
                        {
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8"
                        }
                    )
                    _hostContainerExists = true
                } catch (error) {
                    _hostContainerExists = false
                }

                // if not create it and install the dependencies
                if (!_hostContainerExists) {
                    logger.info(`Creating container ${recipe.name}-host for platform ${ARCH} ...`)

                    let _pathsBinding = ""
                    for (const _path of recipe.paths) {
                        _pathsBinding += `-v ${_path}:${_path} `
                    }

                    execSync(
                        `echo ${USER_PASSWD} | sudo -E -S ` +
                        `podman run -d --name ${recipe.name}-host --platform ${ARCH} ` +
                        `-v ${BUILD_PATH}:${BUILD_PATH} ` +
                        `${_pathsBinding}` +
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
                } else {
                    logger.info(`Container ${recipe.name}-host exists`)
                }

                // make sure the container is running
                execSync(
                    `echo ${USER_PASSWD} | sudo -E -S ` +
                    `podman start ${recipe.name}-host `,
                    {
                        shell: "/bin/bash",
                        stdio: "inherit",
                        encoding: "utf-8"
                    }
                )

                // install the dependencies
                try {
                    execSync(
                        `echo ${USER_PASSWD} | sudo -E -S ` +
                        `podman exec -it ${recipe.name}-host ` +
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
                } catch (error) {
                    logger.error(`Dependencies for ${recipe.name} :: error during dependency install`)
                    throw new Error(`Dependencies for ${recipe.name} :: error during dependency install`)
                }
            } else {
                // WARN: we do not mess up with the host system
                // check if the dependencies are installed but not install it
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
                    } catch (error) {
                        // dependency not installed
                        logger.error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                        throw new Error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                    }
                }
            }
        }
    }
}
