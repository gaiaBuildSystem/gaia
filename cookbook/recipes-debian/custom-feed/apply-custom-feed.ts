#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { execSync } from "child_process"
import { Recipe } from "../../../scripts/bitcook/parse"
import { getAssetPath } from "../../../scripts/bitcook/utils/getAssetPath"

// deploy the firmware blobs
logger.info("Applying custom Debian feed ...")

const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const DISTRO_NAME = process.env.DISTRO_NAME as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const META = JSON.parse(process.env.META as string) as Recipe

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])
const _paths = META.paths
const _getAssetPath = (_filePath: string) => getAssetPath(_filePath, _paths)

// in this step there is already a mounted image
const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT


interface DebianFeedConfig {
    feeds?: [{
        name: string
        feedUrl: string
        feedUri: string
        suites: string
        components: string
        gpgKeyUrl: string
        pinPriority: number
    }]
}

const CUSTOM_FEED_DATA = META.customData[MACHINE] as DebianFeedConfig

if (CUSTOM_FEED_DATA == undefined) {
    logger.warn("No Custom Debian feed data found, skipping...")
    process.exit(0)
}

const DEBIAN_FEEDS_PATH = PATH.join(
    BUILD_PATH, "tmp", MACHINE, "deb-feeds"
)

// for ostree based distros the apt preferences file is located in
// /usr instead of the root
const _ostree = (DISTRO_NAME == "PhobOS") ? "/usr" : ""

if (
    CUSTOM_FEED_DATA.feeds != undefined &&
    CUSTOM_FEED_DATA.feeds.length > 0
) {
    FS.mkdirSync(DEBIAN_FEEDS_PATH, { recursive: true })

    // make sure we have curl and gnupg in the image to apply the feeds
    execSync(
        `sudo -k ` +
        `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
        `apt-get update && apt-get install -y curl gnupg` +
        `"`,
        {
            shell: "/bin/bash",
            stdio: "inherit",
            encoding: "utf-8",
            env: process.env
        })

    for (const feed of CUSTOM_FEED_DATA.feeds) {
        // replace the custom-feeds.template file
        const _feed_template_path = _getAssetPath(
            "files/custom-feeds.template"
        )

        const _feed_output_path = PATH.join(
            DEBIAN_FEEDS_PATH,
            `${feed.name}`
        )
        let _feed_template = FS.readFileSync(
            _feed_template_path, "utf-8"
        )

        _feed_template = _feed_template
            .replace(/{{feedUrl}}/g, feed.feedUrl)
            .replace(/{{pinPriority}}/g, feed.pinPriority.toString())
        FS.writeFileSync(
            _feed_output_path,
            _feed_template,
            "utf-8"
        )

        // copy it to the rootfs
        execSync(
            `sudo -k ` +
            `cp ${_feed_output_path} ` +
            `${IMAGE_MNT_ROOT}/etc/apt/preferences.d/${feed.name}`,
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8",
                env: process.env
            })

        // replace also the custom.sources.template
        const _sources_template_path = _getAssetPath(
            "files/custom.sources.template"
        )
        const _sources_output_path = PATH.join(
            DEBIAN_FEEDS_PATH,
            `${feed.name}.sources`
        )

        let _sources_template = FS.readFileSync(
            _sources_template_path, "utf-8"
        )

        const _gpgKeyFileName =
            PATH.basename(
                feed.gpgKeyUrl
            ).replace(
                ".asc",
                ".gpg"
            )

        _sources_template = _sources_template
            .replace(/{{feedUri}}/g, feed.feedUri)
            .replace(/{{suites}}/g, feed.suites)
            .replace(/{{components}}/g, feed.components)
            .replace(/{{gpgKeyUrl}}/g, _gpgKeyFileName)

        FS.writeFileSync(
            _sources_output_path,
            _sources_template,
            "utf-8"
        )

        // copy it to the rootfs
        execSync(
            `sudo -k ` +
            `cp ${_sources_output_path} ` +
            `${IMAGE_MNT_ROOT}/etc/apt/sources.list.d/${feed.name}.sources`,
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8",
                env: process.env
            })

        // apply the gpg key
        execSync(
            `sudo -k ` +
            `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
            `curl -fsSL ${feed.gpgKeyUrl} | gpg --dearmor > /usr/share/keyrings/${_gpgKeyFileName}` +
            `"`,
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8",
                env: process.env
            })

        // run a os upgrade to apply the feed
        execSync(
            `sudo -k ` +
            `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
            `apt-get update && apt-get upgrade -y && apt-get dist-upgrade -y` +
            `"`,
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8",
                env: process.env
            })

        // TODO: THIS IS A FUCKING UGLY HACK, THIS STINKS LIKE A 1 YEAR BODY LEAVED TO ROT
        execSync(
            `sudo -k ` +
            `chroot ${IMAGE_MNT_ROOT} /bin/bash -c "` +
            `sed -i 's/systemd (<< 256~rc4-1~), //g' ${_ostree}/var/lib/dpkg/status && sed -i 's/systemd (<< 256~rc4-1~)//g' ${_ostree}/var/lib/dpkg/status && rm -rf ${_ostree}/var/lib/apt/lists/* && apt-get update` +
            `"`,
            {
                shell: "/bin/bash",
                stdio: "inherit",
                encoding: "utf-8",
                env: process.env
            })
    }
} else {
    logger.warn("No Custom Debian feed data found, skipping...")
    process.exit(0)
}

logger.success(`Custom Debian feed applied successfully!`)
