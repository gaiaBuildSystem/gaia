import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecPureDeploy (recipes: Recipe[]): void {
    logger.info("Executing Pure Deploy ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.deployPureRecipes && recipe.deployPureRecipes.length > 0) {
            logger.info(`Executing pure deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const deployPureRecipe of recipe.deployPureRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing deploy script ${deployPureRecipe} ...`)
                execSync(
                    `exec ${deployPureRecipe}`,
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
