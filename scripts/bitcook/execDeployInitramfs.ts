import { execSync } from "child_process"
import logger from "node-color-log"
import { Recipe } from "./parse"
import { canExecRecipe } from "./utils/recipeMatch"

export function ExecDeployIniramfs(recipes: Recipe[]): void {
    logger.info("Executing Deploy InitRamfs ...")

    execSync(
        `mkdir -p ${process.env.INITRAMFS_PATH}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    execSync(
        `mkdir -p {scripts,bin,etc,lib,root,sbin,usr,tmp,proc,sys,dev,run,usr/bin,mnt/root}`,
        {
            cwd: `${process.env.INITRAMFS_PATH}`,
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        if (!canExecRecipe(recipe.name)) continue

        // check if the recipe has a build script
        if (recipe.initramfsRecipes && recipe.initramfsRecipes.length > 0) {
            logger.info(`Executing deploy initramfs for ${recipe.name} ...`)

            // execute the build scripts
            for (const iniramfsRecipe of recipe.initramfsRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing deploy initramfs script ${iniramfsRecipe} ...`)
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
