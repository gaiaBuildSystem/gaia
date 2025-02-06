#!/opt/bun/bin/bun

import fs from "fs"
import logger from "node-color-log"
import { execSync, ExecException } from "child_process"

interface Folder {
    path: string
    name: string
}

interface JsonSchema {
    fileMatch: string[]
    url: string
}

interface Settings {
    "window.title": string,
    "json.validate.enable": boolean,
    "json.schemas": JsonSchema[]
}

class Config {
    folders: Folder[]
    settings: Settings
}

interface Repository {
    name: string
    path: string
    url: string
    revision: string
}

interface Manifest {
    name: string,
    description: string,
    maintainer: string,
    repositories: Repository[]
}

logger.info("_________________________________________________________________")
logger.info("Configuring repository for Gaia Project builds")
logger.info("_________________________________________________________________")

// 1. check if the __pwd__/manifest.json file exists
if (!fs.existsSync("__pwd__/manifest.json")) {
    logger.error("The __pwd__/manifest.json file does not exist")
    process.exit(404)
}

// 2. read the __pwd__/manifest.json file
const _manifest: Manifest = JSON.parse(
    fs.readFileSync("__pwd__/manifest.json", "utf8")
)

// 3. clone the repositories into the __pwd__ directory
function _execRepoInit (repo: Repository) {
    if (fs.existsSync(`${repo.path}/init`)) {
        logger.info(`Repository ${repo.name} have an init script`)
        const init = `cd ${repo.path} && ./init`
        logger.debug(`Running command: ${init}`)

        try {
            const result = execSync(init, { stdio: "inherit" })
        } catch (error) {
            const _error = error as ExecException
            logger.error(`Failed to run init script for repository ${repo.name}`)
            // I choosed to ignore the error and continue
            // the user could continue and try to fix the init after the Gaia init
        }
    }
}

process.chdir("__pwd__")


if (!fs.existsSync("__pwd__/gaia")) {
    logger.info("Cloning Gaia repository")
    const clone = "git clone https://github.com/gaiaBuildSystem/gaia.git gaia"

    logger.debug(`Running command: ${clone}`)

    try {
        const result = execSync(clone, { stdio: "inherit" })
    } catch (error) {
        const _error = error as ExecException
        logger.error("Failed to clone Gaia repository")
        process.exit(500)
    }

    // exec the init
    _execRepoInit({
        name: "gaia",
        path: "gaia",
        url: "",
        revision: ""
    } as Repository)
} else {
    logger.info("Updating Gaia repository")
    const command = "cd __pwd__/gaia && git fetch origin && git reset --hard origin/main"

    logger.debug(`Running command: ${command}`)

    try {
        const result = execSync(command, { stdio: "inherit" })
    } catch (error) {
        const _error = error as ExecException
        logger.error("Failed to update Gaia repository")
        process.exit(500)
    }

    // exec the init
    _execRepoInit({
        name: "gaia",
        path: "gaia",
        url: "",
        revision: ""
    } as Repository)
}

for (const repo of _manifest.repositories) {
    // check if the repository already exists
    if (fs.existsSync(repo.path)) {
        logger.info(`Repository ${repo.name} already exists`)
        logger.debug(`Fetching latest changes from ${repo.url} and updating to revision ${repo.revision}`)
        const command = `cd ${repo.path} && git fetch origin && git checkout ${repo.revision}`

        logger.debug(`Running command: ${command}`)
        try {
            const result = execSync(command, { stdio: "inherit" })
        } catch (error) {
            const _error = error as ExecException
            logger.error(`Failed to update repository ${repo.name}`)
            process.exit(500)
        }

        // exec the init
        _execRepoInit(repo)

        continue
    }

    logger.info(`Cloning repository ${repo.name} from ${repo.url}`)

    const clone = `git clone ${repo.url} ${repo.path}`
    const checkout = `cd ${repo.path} && git checkout ${repo.revision}`
    const command = `${clone} && ${checkout}`

    logger.debug(`Running command: ${command}`)

    try {
        const result = execSync(command, { stdio: "inherit" })
    } catch (error) {
        const _error = error as ExecException
        logger.error(`Failed to clone repository ${repo.name}`)
        process.exit(500)
    }

    // exec the init
    _execRepoInit(repo)
}

// 4. create the __pwd__/gaia.code-workspace file
const _config = new Config()
_config.settings = {} as Settings
_config.settings["window.title"] = _manifest.name
_config.settings["json.validate.enable"] = true
_config.settings["json.schemas"] = []
_config.settings["json.schemas"].push(
    {
        "fileMatch": [
            "/distro-*.json"
        ],
        "url": "./gaia/schema/distro.json"
    },
    {
        "fileMatch": [
            "/*.json",
            "!/distro-*.json",
            "!/.vscode/*.json",
            "!/package.json",
            "!/package-lock.json",
            "!/settings.json"
        ],
        "url": "./gaia/schema/recipe.json"
    }
)

_config.folders = []

// add the hardcoded Gaia repository
_config.folders.push(
    {
        "path": "./gaia",
        "name": "Gaia Core"
    }
)

for (const repo of _manifest.repositories) {
    _config.folders.push(
        {
            "path": `./ ${repo.path}`,
            "name": repo.name
        }
    )
}

fs.writeFileSync(
    "__pwd__/gaia.code-workspace",
    JSON.stringify(
        _config,
        null,
        4
    )
)

// 5. the end
logger.success("Repository configured successfully")
