import FS from "fs"
import PATH from "path"
import { execSync } from "child_process"
import logger from "node-color-log"

import { Recipe } from "./parse"

export function CheckDependencies(recipes: Recipe[]): void {
    logger.info("Checking dependencies ...")

    // check if the recipes have the required dependencies
    for (const recipe of recipes) {
        // check if the recipe has a fetch script
        if (recipe.hostDeps && recipe.hostDeps.length > 0) {
            logger.info(`Checking dependencies for ${recipe.name} ...`)

            // check if the dependencies are installed
            for (const dep of recipe.hostDeps) {
                logger.info(`Checking dependency ${dep} ...`)
                // use dpkg to check if the dependency is installed
                try {
                    execSync(
                        `dpkg -s ${dep}`,
                        {
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8"
                        }
                    )
                } catch (error) {
                    // dependency not installed
                    logger.error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                    throw new Error(`Dependency for ${recipe.name} :: ${dep} not installed`)
                }
            }
        }
    }
}
