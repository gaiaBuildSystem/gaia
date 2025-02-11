import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import { canExecRecipe } from "./utils/recipeMatch"

export function ExecAfterDeployIniramfs(recipes: Recipe[]): void {
    logger.info("Executing After Deploy InitRamfs ...")

    // We have the premise that the initramfs folder already exists

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        // check if the recipe has a build script
        if (recipe.afterDeployInitramfsRecipes && recipe.afterDeployInitramfsRecipes.length > 0) {
            logger.info(`Executing after deploy initramfs for ${recipe.name} ...`)

            // execute the build scripts
            for (const iniramfsRecipe of recipe.afterDeployInitramfsRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing after deploy initramfs script ${iniramfsRecipe} ...`)
                execSync(
                    `exec ${iniramfsRecipe}`,
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
