import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecBuild(recipes: Recipe[]): void {
    logger.info("Executing build ...")

    const USER_PASSWD = process.env.USER_PASSWD as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const ARCH = process.env.ARCH as string
    const DISTRO_NAME = process.env.DISTRO_NAME as string

    // directly call the build scrips from the recipes
    for (const recipe of recipes) {
        process.env.META = JSON.stringify(recipe)

        // check if the recipe has a build script
        if (recipe.buildRecipes && recipe.buildRecipes.length > 0) {
            logger.info(`Executing build for ${recipe.name} ...`)

            if (recipe.hostAsContainer === true) {
                // set the env context
                let _containerEnv = ""
                for (const [_envName, _envValue] of Object.entries(process.env)) {
                    _containerEnv += `-e ${_envName}="${_envValue}" `
                }

                for (const buildRecipe of recipe.buildRecipes) {
                    // here we need to believe that the container is already created
                    // by the parse step
                    try {
                        execSync(
                            `echo ${USER_PASSWD} | sudo -E -S ` +
                            `podman exec -it ${_containerEnv} ${recipe.name}-${DISTRO_NAME}-host ` +
                            `/bin/bash -c "` +
                            `exec ${buildRecipe}` +
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
                for (const buildRecipe of recipe.buildRecipes) {
                    logger.info(`Executing build script ${buildRecipe} ...`)
                    execSync(
                        `exec ${buildRecipe}`,
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
