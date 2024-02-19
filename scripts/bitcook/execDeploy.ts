import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecDeploy(recipes: Recipe[]): void {
    logger.info("Executing Deploy ...")

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.deployRecipes && recipe.deployRecipes.length > 0) {
            logger.info(`Executing deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const deployRecipe of recipe.deployRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing deploy script ${deployRecipe} ...`)
                execSync(
                    `exec ${deployRecipe}`,
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
