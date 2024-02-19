import Ajv from "ajv"
import UTIL from "util"
import FS from "fs"
import PATH from "path"

import logger from "node-color-log"

const _validateSchema = (schema: any, data: any) => {
    const ajv = new Ajv()

    const validate = ajv.compile(schema)
    const valid = validate(data)

    if (!valid) {
        logger.error(UTIL.inspect(validate.errors))
        process.exit(69)
    }
}

export interface Dict<T> {
    [key: string]: T | undefined
}

export interface ProcessEnv extends Dict<string> {
}

export interface Recipe {
    name: string
    type: string
    priority: number
    fetchRecipes: string[]
    patchRecipes: string[]
    buildRecipes: string[]
    beforeDeployRecipes: string[]
    deployRecipes: string[]
    afterDeployRecipes: string[]
    bundleRecipes: string[]
    cleanRecipes: string[]
    hostDeps: string[]
    targetDeps: string[]
    recipeOrigin: string
    env: ProcessEnv
    merge: boolean
}

export function ParseRecipes(workingDir: string, distro: any): Recipe[] {
    logger.info("Parsing recipes ...")
    let _RECIPES: string[] = []
    let RECIPES: Recipe[] = []
    const _schema = require(`${__dirname}/../../schema/recipe.json`)

    for (const _pathToSearch of distro.searchForRecipesOn) {
        const getJsonFiles = (dir: string, relativeToDistro: boolean = false): string[] => {
            // the searchForRecipesOn is relative to the distro path
            if (relativeToDistro) {
                dir = PATH.join(distro.path, dir)
            }

            const files = FS.readdirSync(dir)
            const jsonFiles: string[] = []

            for (const file of files) {
                const filePath = PATH.join(dir, file)
                const stat = FS.statSync(filePath)

                if (stat.isDirectory()) {
                    jsonFiles.push(...getJsonFiles(filePath))
                } else {
                    if (
                        filePath.endsWith(".json") &&
                        !filePath.includes("distro-")
                    ) {
                        jsonFiles.push(filePath)
                    }
                }
            }

            return jsonFiles
        }

        const _recipes = getJsonFiles(_pathToSearch, true)

        // exclude the excludeRecipes
        const excludeRecipes = distro.excludeRecipes
        let _recipesToExclude: string[] = []
        if (excludeRecipes && excludeRecipes.length > 0) {
            for (const excludeRecipe of excludeRecipes) {
                for (let i = 0; i < _recipes.length; i++) {
                    if (_recipes[i].includes(excludeRecipe)) {
                        _recipesToExclude.push(_recipes[i])
                    }
                }
            }
        }

        // remove the recipes that was excluded
        _recipesToExclude.forEach((recipe) => {
            _recipes.splice(_recipes.indexOf(recipe), 1)
        })

        // append the recipes
        _RECIPES.push(..._recipes)
    }

    // summary
    logger.info(`Found ${_RECIPES.length} raw recipes`)

    // parse then
    for (const recipe of _RECIPES) {
        const meta = require(`${recipe}`)
        logger.info(`Parsing recipe ${recipe} ...`)

        // validate the recipe JSON with their schema
        _validateSchema(_schema, meta)

        // also check if the recipe has support for the machine arch
        let _supported = false
        for (const _arch of meta.support) {
            if (_arch === distro.arch) {
                _supported = true
                break
            }
        }

        if (!_supported) {
            throw new Error(`recipe ${meta.name} does not support the architecture ${distro.arch}`)
        } else {
            logger.info(`Recipe ${meta.name} supports the architecture ${distro.arch}`)
        }

        // add the recipe origin
        meta.recipeOrigin = PATH.dirname(`${recipe}`)

        if (meta.fetchRecipes != null) {
            // for all fetchRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.fetchRecipes.length; i++) {
                meta.fetchRecipes[i] = `${meta.recipeOrigin}/${meta.fetchRecipes[i]}`
            }
        } else {
            meta.fetchRecipes = []
        }

        if (meta.patchRecipes != null) {
            // for all patchRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.patchRecipes.length; i++) {
                meta.patchRecipes[i] = `${meta.recipeOrigin}/${meta.patchRecipes[i]}`
            }
        } else {
            meta.patchRecipes = []
        }

        if (meta.buildRecipes != null) {
            // for all buildRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.buildRecipes.length; i++) {
                meta.buildRecipes[i] = `${meta.recipeOrigin}/${meta.buildRecipes[i]}`
            }
        } else {
            meta.buildRecipes = []
        }

        if (meta.deployRecipes != null) {
            // for all deployRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.deployRecipes.length; i++) {
                meta.deployRecipes[i] = `${meta.recipeOrigin}/${meta.deployRecipes[i]}`
            }
        } else {
            meta.deployRecipes = []
        }

        if (meta.beforeDeployRecipes != null) {
            // for all deployRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.beforeDeployRecipes.length; i++) {
                meta.beforeDeployRecipes[i] = `${meta.recipeOrigin}/${meta.beforeDeployRecipes[i]}`
            }
        } else {
            meta.beforeDeployRecipes = []
        }

        if (meta.afterDeployRecipes != null) {
            // for all deployRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.afterDeployRecipes.length; i++) {
                meta.afterDeployRecipes[i] = `${meta.recipeOrigin}/${meta.afterDeployRecipes[i]}`
            }
        } else {
            meta.afterDeployRecipes = []
        }

        if (meta.bundleRecipes != null) {
            // for all deployRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.bundleRecipes.length; i++) {
                meta.bundleRecipes[i] = `${meta.recipeOrigin}/${meta.bundleRecipes[i]}`
            }
        } else {
            meta.bundleRecipes = []
        }

        if (meta.cleanRecipes != null) {
            // for all cleanRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.cleanRecipes.length; i++) {
                meta.cleanRecipes[i] = `${meta.recipeOrigin}/${meta.cleanRecipes[i]}`
            }
        } else {
            meta.cleanRecipes = []
        }

        if (meta.env == null) {
            meta.env = {}
        }

        // add it to the array
        RECIPES.push(meta)
    }

    // and if we get some override ??
    let _metas: any = []

    for (const recipe of RECIPES) {
        const recipeName = recipe.name

        if (_metas[recipeName] == null) {
            _metas[recipeName] = recipe
        } else {
            // merge the data
            const meta2 = recipe

            if (meta2.priority > _metas[recipeName].priority) {
                // override the meta1 with the meta2
                for (const prop in meta2) {
                    if (
                        (
                            prop.includes("Recipes") ||
                            prop.includes("Deps")
                        ) &&
                        meta2.merge === true
                    ) {
                        _metas[recipeName][prop] = [
                            ...meta2[prop],
                            ..._metas[recipeName][prop]
                        ]
                    } else {
                        _metas[recipeName][prop] = meta2[prop]
                    }
                }
            }
        }
    }

    // now put metas in RECIPES
    RECIPES = []
    for (const recipe in _metas) {
        RECIPES.push(_metas[recipe])
    }

    // show the recipe names
    logger.info(`Parsed ${RECIPES.length} recipes`)
    logger.info("Found the following recipes:")
    for (const recipe of RECIPES) {
        logger.info(`\t- ${recipe.name}`)
    }

    // also inject the environment variables
    for (const recipe of RECIPES) {
        for (const env in recipe.env) {
            process.env[env] = recipe.env[env]
        }
    }

    if (process.env.VERBOSE === "true") {
        logger.debug("\n\nParsed recipes: \n" + JSON.stringify(RECIPES, null, 4))

        logger.debug("\n\nEnvironment variables: \n" + JSON.stringify(process.env, null, 4))

        // verbose does not execute the other steps
        process.exit(0)
    }

    return RECIPES
}
