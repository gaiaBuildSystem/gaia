import { execSync } from "node:child_process"
import logger from "node-color-log"
import { Recipe } from "./parse.ts"

export function CleanLosetupMounts (): void {
    logger.info("Cleaning losetup mounts ...")

    try {
        execSync(
            "sudo losetup -a | grep /mnt/gaia | cut -d: -f1 | xargs -r sudo losetup -d",
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8"
            }
        )
    } catch (error) {
        logger.error("Failed to clean losetup mounts")
        logger.error(error)
    }
}

export function ExecClean (recipes: Recipe[]): void {
    logger.info("Executing Clean ...")

    if (process.env.RECIPE !== undefined) {
        logger.warn("Clean recipes will be skipped")
        logger.warn("cause: Running with RECIPE env variable set")
        return
    }

    // directly call the clean scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.cleanRecipes && recipe.cleanRecipes.length > 0) {
            logger.info(`Executing clean for ${recipe.name} ...`)

            // execute the build scripts
            for (const cleanRecipe of recipe.cleanRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing clean script ${cleanRecipe} ...`)
                execSync(
                    `exec ${cleanRecipe}`,
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
