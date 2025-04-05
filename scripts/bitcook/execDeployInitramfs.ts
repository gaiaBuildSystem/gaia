import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import { canExecRecipe } from "./utils/recipeMatch"

export function ExecDeployIniramfs (recipes: Recipe[]): void {
    logger.info("Executing Deploy InitRamfs ...")

    const ARCH = process.env.ARCH as string
    const FARCH = ARCH.replace("/", "-")
    const DISTRO_NAME = process.env.DISTRO_NAME as string

    execSync(
        `mkdir -p ${process.env.INITRAMFS_PATH}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    execSync(
        `mkdir -p {scripts,bin,etc,lib,root,sbin,usr,tmp,proc,sys,dev,run,usr/bin,mnt/root}`,
        {
            cwd: `${process.env.INITRAMFS_PATH}`,
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        // check if the recipe has a build script
        if (recipe.initramfsRecipes && recipe.initramfsRecipes.length > 0) {
            logger.info(`Executing deploy initramfs for ${recipe.name} ...`)

            if (recipe.hostAsContainer === true) {
                // set the env context
                let _containerEnv = ""
                for (const [_envName, _envValue] of Object.entries(process.env)) {
                    _containerEnv += `-e ${_envName}='${_envValue}' `
                }

                for (const iniramfsRecipe of recipe.initramfsRecipes) {
                    const HOST_CONTAINER_NAME = `${recipe.name}-${DISTRO_NAME}-${FARCH}-host`

                    // here we need to believe that the container is already created
                    // by the parse step
                    try {
                        execSync(
                            `sudo -k ` +
                            `podman exec -it ${_containerEnv} ${HOST_CONTAINER_NAME} ` +
                            `/bin/bash -c "` +
                            `exec ${iniramfsRecipe}` +
                            `"`,
                            {
                                shell: "/bin/bash",
                                stdio: "inherit",
                                encoding: "utf-8"
                            }
                        )
                    } catch (error) {
                        logger.error(`Build for ${recipe.name} :: error during containerized build`)
                        throw new Error(`Build for ${recipe.name} :: error during containerized build`)
                    }
                }
            } else {
                // execute the build scripts
                for (const iniramfsRecipe of recipe.initramfsRecipes) {
                    process.env.META = JSON.stringify(recipe)

                    logger.info(`Executing deploy initramfs script ${iniramfsRecipe} ...`)
                    execSync(
                        `exec ${iniramfsRecipe}`,
                        {
                            cwd: recipe.recipeOrigin,
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8",
                            env: process.env
                        }
                    )
                }
            }
        }
    }
}
