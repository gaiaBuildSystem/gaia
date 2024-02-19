import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecAfterDeploy(recipes: Recipe[]): void {
    logger.info("Executing After Deploy ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.afterDeployRecipes && recipe.afterDeployRecipes.length > 0) {
            logger.info(`Executing after deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const afterDeployRecipe of recipe.afterDeployRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing after deploy script ${afterDeployRecipe} ...`)
                execSync(
                    `exec ${afterDeployRecipe}`,
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
