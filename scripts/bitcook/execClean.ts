import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecClean(recipes: Recipe[]): void {
    logger.info("Executing Clean ...")

    // directly call the clean scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.cleanRecipes && recipe.cleanRecipes.length > 0) {
            logger.info(`Executing deploy for ${recipe.name} ...`)

            // execute the build scripts
            for (const cleanRecipe of recipe.cleanRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing deploy script ${cleanRecipe} ...`)
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
