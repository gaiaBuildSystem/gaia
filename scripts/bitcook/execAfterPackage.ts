import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecAfterPackage (recipes: Recipe[]): void {
    logger.info("Executing After Packages ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.afterTargetDepsRecipes && recipe.afterTargetDepsRecipes.length > 0) {
            logger.info(`Executing after deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const afterTargetRecipe of recipe.afterTargetDepsRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing after package script ${afterTargetRecipe} ...`)
                execSync(
                    `exec ${afterTargetRecipe}`,
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
