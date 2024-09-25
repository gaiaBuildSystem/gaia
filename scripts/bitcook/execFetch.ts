import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import { canExecRecipe } from "./utils/recipeMatch"

export function ExecFetch(recipes: Recipe[]): void {
    logger.info("Executing fetch ...")

    // directly call the fetch scrips from the recipes
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        // check if the recipe has a fetch script
        if (recipe.fetchRecipes && recipe.fetchRecipes.length > 0) {
            logger.info(`Executing fetch for ${recipe.name} ...`)

            // execute the fetch scripts
            for (const fetchRecipe of recipe.fetchRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing fetch script ${fetchRecipe} ...`)
                execSync(
                    `exec ${fetchRecipe}`,
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
