import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"

export function ExecBuild(recipes: Recipe[]): void {
    logger.info("Executing build ...")

    // directly call the build scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.buildRecipes && recipe.buildRecipes.length > 0) {
            logger.info(`Executing build for ${recipe.name} ...`)

            // execute the build scripts
            for (const buildRecipe of recipe.buildRecipes) {
                process.env.META = JSON.stringify(recipe)

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
