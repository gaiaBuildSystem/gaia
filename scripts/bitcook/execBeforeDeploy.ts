import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecBeforeDeploy(recipes: Recipe[]): void {
    logger.info("Executing Before Deploy ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.beforeDeployRecipes && recipe.beforeDeployRecipes.length > 0) {
            logger.info(`Executing before deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const beforeDeployRecipe of recipe.beforeDeployRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing before deploy script ${beforeDeployRecipe} ...`)
                execSync(
                    `exec ${beforeDeployRecipe}`,
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
