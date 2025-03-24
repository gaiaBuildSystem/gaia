#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"
import { Recipe } from "../../../scripts/bitcook/parse"

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const meta = JSON.parse(process.env.META as string) as Recipe

logger.info(`Installing ${meta.name} ...`)

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
const BUILD_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/environment`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT


// create the BUILD_ROOT directory
FS.mkdirSync(`${BUILD_ROOT}`, { recursive: true })

// create the environment file
const envFile = `${BUILD_ROOT}/environment`
// clean up the file
FS.writeFileSync(envFile, "", { flag: "w" })

// for each env key on meta.env
const envKeys = Object.keys(meta.env)
for (const key of envKeys) {
    // write the key value to the file using ts
    let value = meta.env[key]

    // the value can containe some global Gaia env, so let's resolve it
    // replace the global env with the actual value
    if (value && value.includes("$")) {
        value = value.replace("$", "")
        value = value.replace(
            value,
            process.env[value] as string
        )
    }

    const line = `${key}=${value}`

    FS.writeFileSync(
        envFile,
        line + "\n",
        {
            flag: "a"
        }
    )
}

// now deploy it to the /etc/environment
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `cp ${envFile} ${IMAGE_MNT_ROOT}/etc/environment`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

// set the permissions
execSync(
    `echo ${USER_PASSWD} | sudo -k -S ` +
    `chmod 644 ${IMAGE_MNT_ROOT}/etc/environment`,
    {
        shell: "/bin/bash",
        stdio: "inherit",
        encoding: "utf-8",
        env: process.env
    })

logger.success(`ok, install ${meta.name} is ok`)
