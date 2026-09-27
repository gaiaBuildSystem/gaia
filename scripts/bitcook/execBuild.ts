import { execSync } from "node:child_process"
import logger from "node-color-log"
import { Recipe } from "./parse.ts"
import { canExecRecipe } from "./utils/recipeMatch.ts"


export function ExecBuild (recipes: Recipe[]): void {
    logger.info("Executing build ...")

    const ARCH = process.env.ARCH as string
    const FARCH = ARCH.replace("/", "-")
    const DISTRO_NAME = process.env.DISTRO_NAME as string

    const buildRecipeScripts = (recipe: Recipe): void => {
        process.env.META = JSON.stringify(recipe)

        // check if the recipe has a build script
        if (recipe.buildRecipes && recipe.buildRecipes.length > 0) {
            logger.info(`Executing build for ${recipe.name} ...`)

            if (recipe.hostAsContainer === true) {
                // set the env context
                let _containerEnv = ""
                for (const [_envName, _envValue] of Object.entries(process.env)) {
                    _containerEnv += `-e ${_envName}='${_envValue}' `
                }

                for (const buildRecipe of recipe.buildRecipes) {
                    const HOST_CONTAINER_NAME = `${recipe.name}-${DISTRO_NAME}-${FARCH}-host`

                    // here we need to believe that the container is already created
                    // by the parse step
                    try {
                        execSync(
                            `sudo -k ` +
                            `podman exec ${_containerEnv} ${HOST_CONTAINER_NAME} ` +
                            `/bin/bash -c "` +
                            `exec ${buildRecipe}` +
                            `"`,
                            {
                                shell: "/bin/bash",
                                stdio: "inherit",
                                encoding: "utf-8"
                            }
                        )
                    } catch (_error) {
                        logger.error(`Build for ${recipe.name} :: error during containerized build`)
                        throw new Error(`Build for ${recipe.name} :: error during containerized build`)
                    }
                }
            } else {
                // execute the build scripts
                for (const buildRecipe of recipe.buildRecipes) {
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

    // single recipe mode is meant to build one component in isolation, so
    // its buildDependencies are assumed to already be built from a previous run
    if (process.env.RECIPE != null) {
        for (const recipe of recipes) {
            if (!canExecRecipe(recipe.name)) continue
            buildRecipeScripts(recipe)
        }
        return
    }

    // dependency-aware build: recipes with unmet buildDependencies are
    // deferred to the next round until every recipe is built or no
    // progress can be made anymore
    const builtRecipes = new Set<string>()
    let pendingRecipes = recipes.filter((recipe) => canExecRecipe(recipe.name))

    while (pendingRecipes.length > 0) {
        const deferredRecipes: Recipe[] = []
        let progressed = false

        for (const recipe of pendingRecipes) {
            const unmetDependencies = (recipe.buildDependencies ?? [])
                .filter((dependency) => !builtRecipes.has(dependency))

            if (unmetDependencies.length > 0) {
                logger.warn(`Deferring build of ${recipe.name}, waiting on: ${unmetDependencies.join(", ")}`)
                deferredRecipes.push(recipe)
                continue
            }

            buildRecipeScripts(recipe)
            builtRecipes.add(recipe.name)
            progressed = true
        }

        if (!progressed && deferredRecipes.length > 0) {
            const unresolved = deferredRecipes.map((recipe) => {
                const unmetDependencies = (recipe.buildDependencies ?? [])
                    .filter((dependency) => !builtRecipes.has(dependency))
                return `${recipe.name} (needs: ${unmetDependencies.join(", ")})`
            })

            throw new Error(`Unable to resolve build dependencies for: ${unresolved.join("; ")}`)
        }

        pendingRecipes = deferredRecipes
    }
}

