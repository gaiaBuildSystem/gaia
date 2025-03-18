#!/opt/bun/bin/bun

import logger from "node-color-log"
import { ParseRecipes } from "./parse"
import { ExecFetch } from "./execFetch"
import { CheckDependencies } from "./checkDeps"
import { ExecBuild } from "./execBuild"
import { ExecDeploy } from "./execDeploy"
import { ExecClean } from "./execClean"
import Ajv from "ajv/dist/2019"
import FS from "fs"
import PATH from "path"
import READLINE from "readline"
import UTIL from "util"
import { ExecPackage } from "./execPackage"
import { ExecBundle } from "./execBundle"
import { ExecPatch } from "./execPatch"
import { ExecBeforeDeploy } from "./execBeforeDeploy"
import { ExecAfterDeploy } from "./execAfterDeploy"
import { execSync } from "child_process"
import { ExecDeployIniramfs } from "./execDeployInitramfs"
import { ExecBundleIniramfs } from "./execBundleInitramfs"
import { ExecAfterDeployIniramfs } from "./execAfterDeployInitramfs"
import { ExecBeforePackage } from "./execBeforePackage"

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

const _readPassword = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
        const rl = READLINE.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        const backUp = (rl as any)._writeToOutput

        rl.question("Input your password: ", (answer) => {
            (rl as any)._writeToOutput = backUp
            rl.write("\n")

            if (!answer || answer === "") {
                reject("Password cannot be empty")
            }

            rl.close()
            resolve(answer)
        });

        // prevent the password to be displayed
        // JAVASCRIPT IS LOVE 😍
        (rl as any)._writeToOutput = () => {
            (rl as any).output.write("*")
        }
    })
}

// check the first argument, if it is -h or --help, show the help
if (process.argv[2] === "-h" || process.argv[2] === "--help") {
    logger.info("Usage: gaia [options]")
    logger.info("")
    logger.info("Options:")
    logger.info("  --help -h            Shows this help")
    logger.info("  --version -v         Shows the version")
    logger.info("  --buildPath          The path where the build artifacts will be stored")
    logger.info("  --distro             The path to the distro.json file")
    logger.info("  --installHostDeps    Automatically install the host dependencies")
    logger.info("  --noCache            Build from scratch without any cache")
    logger.info("  --recipe             The recipe to build")
    logger.info("  --verbose            Print all the recipes parse objects in json format")
    logger.info("  --step               The step to execute")
    logger.info("  --clean              Clean the build")
    process.exit(0)
}

// check the first argument, if it is -v or --version, show the version
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
    logger.info("Gaia v0.0.0")
    process.exit(0)
}

// ask for the user the root password if not set
if (!process.env.USER_PASSWD && process.stdin.isTTY) {
    logger.warn("We need your user root password to continue")
    logger.warn("This is needed to create the disk image device loopback")

    const answer = await _readPassword()
    process.env.USER_PASSWD = answer
} else if (!process.env.USER_PASSWD) {
    logger.warn("USER_PASSWD is not set, you must set it in the environment")
    process.exit(69)
}

// get the path where the script was called
const _path = process.cwd()

// get the path where the script is located
const _script_path = __dirname

// parse arguments
const _args = require("minimist")(process.argv.slice(2))
let BUILD_PATH = _args.buildPath as string
const DISTRO = _args.distro as string
const RECIPE = _args.recipe as string
const STEP = _args.step as string
const CLEAN = _args.clean as boolean
const VERBOSE = _args.verbose as boolean
const INSTALL_HOST_DEPS = _args.installHostDeps as boolean
const NO_CACHE = _args.noCache as boolean


process.env.VERBOSE = VERBOSE != null ? VERBOSE.toString() : false.toString()
process.env.RECIPE = RECIPE != null ? RECIPE : undefined
process.env.INSTALL_HOST_DEPS = INSTALL_HOST_DEPS != null ? INSTALL_HOST_DEPS.toString() : false.toString()

if (NO_CACHE === true) {
    process.env.CLEAN_IMAGE = "true"
}

if (process.env.RECIPE !== undefined) {
    logger.debug(`Running only the recipe ${RECIPE}`)
}

// if not BUILD_PATH is set, use the _path/build
if (!BUILD_PATH) {
    BUILD_PATH = `${_path}`
}

// parse the distro.json
// first check if the file exists
if (!DISTRO) {
    logger.error("You must specify the distro.json file")
    process.exit(69)
} else {
    if (!FS.existsSync(`${_path}/${DISTRO}`)) {
        logger.error(`The file ${DISTRO} does not exist`)
        process.exit(69)
    }
}


logger.info(`Reading ${_path}/${DISTRO} ...`)
const distro = require(`${_path}/${DISTRO}`)

// we need to get the distro file path, because the search for recipes
// is relative to it
distro.path = PATH.dirname(`${_path}/${DISTRO}`)

// validate the distro JSON with their schema
_validateSchema(
    require(`${_script_path}/../../schema/distro.json`),
    distro
)

// set the name of the build path with the distro name
BUILD_PATH = `${BUILD_PATH}/build-${distro.name}`
process.env.BUILD_PATH = BUILD_PATH

// also make sure that the build path exists
if (!FS.existsSync(BUILD_PATH)) {
    FS.mkdirSync(BUILD_PATH, { recursive: true })
}

const DISTRO_NAME = distro.name
process.env.DISTRO_NAME = DISTRO_NAME

// the distro must have the following properties
const required = ["machine", "arch"]
for (const prop of required) {
    if (!distro[prop] || distro[prop] === "") {
        throw new Error(`distro.json must have the property ${prop}`)
    }

    // set the environment variable
    process.env[prop.toUpperCase()] = distro[prop]
}

// set the environment variable for the version
process.env.DISTRO_MAJOR = distro.version?.major || "0"
process.env.DISTRO_MINOR = distro.version?.minor || "0"
process.env.DISTRO_PATCH = distro.version?.patch || "0"
process.env.DISTRO_BUILD = distro.version?.build || "0"

if (distro.version?.variant) {
    process.env.DISTRO_VARIANT = distro.version.variant
}

if (distro.version?.codename) {
    process.env.DISTRO_CODENAME = distro.version.codename
}

// set the environment variable for the maximum size of the img
process.env.MAX_IMG_SIZE = distro.maxImgSize || "1024"

// check if we should add the initramfs
process.env.USE_INITRAMFS = distro.useInitramfs || "false"
const USE_INITRAMFS = distro.useInitramfs || false

// parse the recipes
const recipesParsed = ParseRecipes(_path, distro)

if (USE_INITRAMFS) {
    // set the INITRAMFS_PATH
    const MACHINE = process.env.MACHINE as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    process.env.INITRAMFS_PATH = `${BUILD_PATH}/tmp/${MACHINE}/initramfs`
}

// debug
if (process.env.VERBOSE === "true") {
    logger.debug("\n\nParsed recipes: \n" + JSON.stringify(recipesParsed, null, 4))

    logger.debug("\n\nEnvironment variables: \n" + JSON.stringify(process.env, null, 4))

    // verbose does not execute the other steps
    process.exit(0)
}

// we need to have support to all the architecures
execSync(
    `echo ${process.env.USER_PASSWD} | sudo -E -S ` +
    `podman run --rm --privileged docker.io/pergamos/binfmt:9.0.2`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

if (!CLEAN) {
    try {
        // now we start
        CheckDependencies(recipesParsed)
        ExecFetch(recipesParsed)
        ExecPatch(recipesParsed)
        ExecBuild(recipesParsed)

        // these steps need to have the chroot applied on the rootfs
        if (process.env.RECIPE === undefined) {
            ExecBeforePackage(recipesParsed)
            ExecPackage(recipesParsed)
            ExecBeforeDeploy(recipesParsed)
            ExecDeploy(recipesParsed)
            ExecAfterDeploy(recipesParsed)
        }

        if (USE_INITRAMFS) {
            ExecDeployIniramfs(recipesParsed)
            ExecAfterDeployIniramfs(recipesParsed)
            ExecBundleIniramfs(recipesParsed)
        }

        // package the image
        ExecBundle(recipesParsed)
    } finally {
        ExecClean(recipesParsed)
    }
}
