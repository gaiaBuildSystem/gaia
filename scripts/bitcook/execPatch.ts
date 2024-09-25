import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import { canExecRecipe } from "./utils/recipeMatch"

export function ExecPatch(recipes: Recipe[]): void {
    logger.info("Executing patch ...")

    // directly call the patch scrips from the recipes
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        // check if the recipe has a patch script
        if (recipe.patchRecipes && recipe.patchRecipes.length > 0) {
            logger.info(`Executing patch for ${recipe.name} ...`)

            // execute the patch scripts
            for (const patchRecipe of recipe.patchRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing patch script ${patchRecipe} ...`)
                execSync(
                    `exec ${patchRecipe}`,
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
