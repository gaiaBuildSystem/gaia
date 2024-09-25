import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecBeforePackage(recipes: Recipe[]): void {
    logger.info("Executing Before Packages ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.beforeTargetDepsRecipes && recipe.beforeTargetDepsRecipes.length > 0) {
            logger.info(`Executing before deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const beforeTargetRecipe of recipe.beforeTargetDepsRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing before package script ${beforeTargetRecipe} ...`)
                execSync(
                    `exec ${beforeTargetRecipe}`,
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
