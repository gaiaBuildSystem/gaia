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
import { ExecAfterPackage } from "./execAfterPackage"
import { ExecPureDeploy } from "./execPureDeploy"
import { ExecAfterBundle } from "./execAfterBundle"
import { ExecSBOM } from "./execSBOM"
import { ExecAfterBundleInitramfs } from "./execAfterBundleInitramfs"

const _validateSchema = (schema: any, data: any, refs: any[] = []) => {
    const ajv = new Ajv({
        strict: false
    })
    ajv.addMetaSchema(require("ajv/dist/refs/json-schema-draft-07.json"))

    for (const ref of refs) {
        ajv.addSchema(ref)
    }

    const validate = ajv.compile(schema)
    const valid = validate(data)

    if (!valid) {
        logger.error(UTIL.inspect(validate.errors))
        process.exit(69)
    }
}

// check the first argument, if it is -h or --help, show the help
if (process.argv[2] === "-h" || process.argv[2] === "--help") {
    logger.info("Usage: gaia [options]")
    logger.info("")
    logger.info("Options:")
    logger.info("  --buildPath          The path where the build artifacts will be stored")
    logger.info("  --clean              Clean the build")
    logger.info("  --dev                Run in development mode, the fetch step will be skipped")
    logger.info("  --distro             The path to the distro.json file")
    logger.info("  --help -h            Shows this help")
    logger.info("  --installHostDeps    Automatically install the host dependencies")
    logger.info("  --noCache            Build from scratch without any cache")
    logger.info("  --onlySbom           Just generate the SBOM files, needs that a build with --sbom was done before")
    logger.info("  --recipe             The recipe to build")
    logger.info("  --sbom               Generate SBOM files for the built artifacts")
    logger.info("  --step               The step to execute")
    logger.info("  --verbose            Print all the recipes parse objects in json format")
    logger.info("  --version -v         Shows the version")
    process.exit(0)
}

// check the first argument, if it is -v or --version, show the version
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
    logger.info("Gaia v0.0.0")
    process.exit(0)
}


// get the path where the script was called
const _path = process.cwd()

// get the path where the script is located
const _script_path = __dirname

// parse arguments
const _args = require("minimist")(process.argv.slice(2))
let BUILD_PATH = _args.buildPath as string
const DISTRO = _args.distro as string
const DEV = _args.dev as boolean
const RECIPE = _args.recipe as string
const STEP = _args.step as string
const CLEAN = _args.clean as boolean
const VERBOSE = _args.verbose as boolean
const INSTALL_HOST_DEPS = _args.installHostDeps as boolean
const SBOM = _args.sbom as boolean
const ONLY_SBOM = _args.onlySbom as boolean
const NO_CACHE = _args.noCache as boolean
let PODMAN_CLEAN = false


process.env.VERBOSE = VERBOSE != null ? VERBOSE.toString() : false.toString()
process.env.RECIPE = RECIPE != null ? RECIPE : undefined
process.env.INSTALL_HOST_DEPS = INSTALL_HOST_DEPS != null ? INSTALL_HOST_DEPS.toString() : false.toString()


if (NO_CACHE === true) {
    process.env.CLEAN_IMAGE = "true"
}

if (SBOM === true) {
    process.env.DO_SBOM = "true"
} else {
    process.env.DO_SBOM = "false"
}

// try to detect if podman need clean libpod & pod
try {
    execSync(
        `sudo -E ` +
        `podman ps`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
} catch (e) {
    logger.warn("podman clearing /var/run/libpod and pods ...")
    PODMAN_CLEAN = true
}

// FIXME: I have my doubts about if NO_CACHE should be used also here
if (PODMAN_CLEAN === true) {
    // clean the cni networks
    execSync(
        `sudo -k ` +
        `rm -rf /var/lib/cni/networks`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8"
        }
    )

    // clean possible /var/run/libpod
    execSync(
        `sudo -E ` +
        `rm -rf /var/run/libpod`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    // clean the /tmp/storage-run
    execSync(
        `sudo -E ` +
        `rm -rf /tmp/storage-run*`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    // clean the pods
    execSync(
        `sudo -E ` +
        `podman pod rm -a`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    // stop all containers
    execSync(
        `sudo -E ` +
        `podman container stop -a`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })
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
// load the base schema (all validation rules) and inject the machine enum from
// whichever schema the distro file declares via $schema (vendor or core).
// We do not pass $ref-based schemas to AJV since it cannot do filesystem resolution.
const _baseSchema = JSON.parse(
    FS.readFileSync(`${_script_path}/../../schema/distro.json`, "utf-8")
)

const _distroSchemaPath = distro["$schema"]
    ? PATH.resolve(distro.path, distro["$schema"])
    : `${_script_path}/../../schema/distro-core.json`

const _distroSchema = JSON.parse(FS.readFileSync(_distroSchemaPath, "utf-8"))
const _machineEnum = _distroSchema?.properties?.machine?.enum

if (Array.isArray(_machineEnum)) {
    _baseSchema.properties.machine.enum = _machineEnum
}

// logger.debug(`final machine schema: ${JSON.stringify(_baseSchema.properties.machine)}`)
_validateSchema(_baseSchema, distro)

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

process.env.IMAGE_NAME =
    `${DISTRO_NAME}-${process.env.MACHINE}-${process.env.DISTRO_MAJOR}-${process.env.DISTRO_MINOR}-${process.env.DISTRO_PATCH}.img`

// debug
if (process.env.VERBOSE === "true") {
    logger.debug("\n\nParsed recipes: \n" + JSON.stringify(recipesParsed, null, 4))

    logger.debug("\n\nEnvironment variables: \n" + JSON.stringify(process.env, null, 4))

    // verbose does not execute the other steps
    process.exit(0)
}

// we need to have support to all the architecures
execSync(
    `sudo -E ` +
    `podman run --rm --privileged docker.io/pergamos/binfmt:9.0.2`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// NO_CACHE implies CLEAN for initramfs
if (NO_CACHE === true && USE_INITRAMFS === true) {
    execSync(
        `sudo rm -rf ${process.env.INITRAMFS_PATH}`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )

    execSync(
        `sudo -E ` +
        `podman pod rm -f -a`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        }
    )
}

if (!CLEAN) {
    try {
        if (!ONLY_SBOM) {
            // now we start
            CheckDependencies(recipesParsed)

            // only execute the fetch step if not in dev mode,
            // in dev mode we assume that the sources are already fetched and
            // we want to skip this step because the sources are being
            // modified and we don't want to overwrite them
            if (DEV !== true) {
                ExecFetch(recipesParsed)
            }

            ExecPatch(recipesParsed)
            ExecBuild(recipesParsed)

            // for pure non debian or rootfs deploy
            ExecPureDeploy(recipesParsed)

            // these steps need to have the chroot applied on the rootfs
            if (process.env.RECIPE === undefined) {
                ExecBeforePackage(recipesParsed)
                ExecPackage(recipesParsed)
                ExecAfterPackage(recipesParsed)
                ExecBeforeDeploy(recipesParsed)
                ExecDeploy(recipesParsed)
                ExecAfterDeploy(recipesParsed)
            }

            if (USE_INITRAMFS) {
                ExecDeployIniramfs(recipesParsed)
                ExecAfterDeployIniramfs(recipesParsed)
                ExecBundleIniramfs(recipesParsed)
                ExecAfterBundleInitramfs(recipesParsed)
            }

            // package the image
            ExecBundle(recipesParsed)
            ExecAfterBundle(recipesParsed)
        }

        if (
            SBOM === true ||
            ONLY_SBOM === true
        ) {
            ExecSBOM(recipesParsed)
        }
    } finally {
        ExecClean(recipesParsed)
    }
}
