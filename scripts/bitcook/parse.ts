import Ajv from "ajv/dist/2019"
import UTIL from "util"
import FS from "fs"
import PATH from "path"

import logger from "node-color-log"

const _validateSchema = (schema: any, data: any) => {
    const ajv = new Ajv({
        strict: false
    })
    ajv.addMetaSchema(require("ajv/dist/refs/json-schema-draft-07.json"))

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
    deployPureRecipes: string[]
    deployRecipes: string[]
    afterDeployRecipes: string[]
    initramfsRecipes: string[]
    afterDeployInitramfsRecipes: string[]
    bundleRecipes: string[]
    afterBundleRecipes: string[]
    cleanRecipes: string[]
    hostAsContainer: boolean,
    support: string[]
    containerImage: {
        image: string
        tag: string
        extraConfig: string
    }
    hostDeps: string[]
    beforeTargetDepsRecipes: string[]
    targetDeps: string[]
    recipeOrigin: string
    paths: [
        {
            path: string,
            priority: number
        }
    ]
    env: ProcessEnv
    merge: boolean,
    version: string
}

function replaceConfigEnvVars (recipe: Recipe, str: string | undefined): string {
    if (str != null) {
        return str.replace(/\${(\w+)}/g, (match, p1) => {
            if (p1 === "recipeOrigin") {
                return recipe.recipeOrigin
            }

            return ""
        })
    } else
        return ""
}

export function ParseRecipes (workingDir: string, distro: any): Recipe[] {
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
                    // must be a file .json and should have the same name
                    // as the directory
                    if (
                        filePath.endsWith(".json") &&
                        PATH.basename(filePath, ".json") === PATH.basename(dir)
                    ) {
                        const _machineSpecificFileName: string = PATH.basename(filePath, ".json") + `-${distro.machine}.json`
                        const _machineSpecificFilePath: string = PATH.join(dir, _machineSpecificFileName)

                        if (FS.existsSync(_machineSpecificFilePath)) {
                            logger.debug(`Found machine specific json for ${_machineSpecificFileName}`)
                            // edge case for the machine specific json
                            jsonFiles.push(_machineSpecificFilePath)
                        } else {
                            // else, we get the default json
                            jsonFiles.push(filePath)
                        }
                    } else if (
                        filePath.endsWith(".json")
                    ) {
                        logger.warn(`Ignoring possible recipe : ${PATH.basename(filePath)}`)
                    }
                }
            }

            return jsonFiles
        }

        let _recipes = getJsonFiles(_pathToSearch, true)


        // check if there is the excludeRecipes key
        if (distro.excludeRecipes == null) {
            // should be the includeRecipes only then
            const includeRecipes = distro.includeRecipes
            let _recipesToInclude: string[] = []
            if (includeRecipes && includeRecipes.length > 0) {
                for (const includeRecipe of includeRecipes) {
                    for (let i = 0; i < _recipes.length; i++) {
                        if (_recipes[i].includes(includeRecipe)) {
                            _recipesToInclude.push(_recipes[i])
                        }
                    }
                }
            }

            // remove the recipes that was not included
            _recipes = _recipesToInclude
        } else {
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
        }

        // append the recipes
        _RECIPES.push(..._recipes)
    }

    // summary
    logger.info(`Found ${_RECIPES.length} raw recipes`)

    // parse then
    for (const recipe of _RECIPES) {
        const meta: Recipe = require(`${recipe}`)
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
        meta.paths = [{
            path: meta.recipeOrigin,
            priority: meta.priority
        }]

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

        if (meta.deployPureRecipes != null) {
            // for all deployPureRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.deployPureRecipes.length; i++) {
                meta.deployPureRecipes[i] = `${meta.recipeOrigin}/${meta.deployPureRecipes[i]}`
            }
        } else {
            meta.deployPureRecipes = []
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

        if (meta.beforeTargetDepsRecipes != null) {
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.beforeTargetDepsRecipes.length; i++) {
                meta.beforeTargetDepsRecipes[i] = `${meta.recipeOrigin}/${meta.beforeTargetDepsRecipes[i]}`
            }
        } else {
            meta.beforeTargetDepsRecipes = []
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

        if (meta.initramfsRecipes != null) {
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.initramfsRecipes.length; i++) {
                meta.initramfsRecipes[i] = `${meta.recipeOrigin}/${meta.initramfsRecipes[i]}`
            }
        } else {
            meta.initramfsRecipes = []
        }

        if (meta.afterDeployInitramfsRecipes != null) {
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.afterDeployInitramfsRecipes.length; i++) {
                meta.afterDeployInitramfsRecipes[i] = `${meta.recipeOrigin}/${meta.afterDeployInitramfsRecipes[i]}`
            }
        } else {
            meta.afterDeployInitramfsRecipes = []
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

        if (meta.afterBundleRecipes != null) {
            // for all deployRecipes, transform in absolute path
            // FIXME: and if the path is already absolute?
            for (let i = 0; i < meta.afterBundleRecipes.length; i++) {
                meta.afterBundleRecipes[i] = `${meta.recipeOrigin}/${meta.afterBundleRecipes[i]}`
            }
        } else {
            meta.afterBundleRecipes = []
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
            // this should infer as Recipe, but we will receibe some
            // objects from json that are not completely typed
            const meta2: any | Recipe = recipe

            if (meta2.priority > _metas[recipeName].priority) {
                _metas[recipeName].paths.push({
                    path: meta2.recipeOrigin,
                    priority: meta2.priority
                })

                // override the meta1 with the meta2
                for (const prop in meta2) {
                    if (
                        (
                            prop.includes("Recipes") ||
                            prop.includes("Deps") ||
                            prop.includes("paths") ||
                            prop.includes("env")
                        ) &&
                        meta2.merge === true
                    ) {
                        // check if the prop is an array
                        if (Array.isArray(_metas[recipeName][prop])) {
                            _metas[recipeName][prop] = [
                                ...meta2[prop],
                                ..._metas[recipeName][prop]
                            ]
                        } else {
                            // so, we have an object, we need to merge the keys
                            for (const key in meta2[prop]) {
                                _metas[recipeName][prop][key] = meta2[prop][key]
                            }
                        }
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
            recipe.env[env] = replaceConfigEnvVars(recipe, recipe.env[env])
            process.env[env] = recipe.env[env]
        }
    }

    return RECIPES
}
