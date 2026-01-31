#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { PackageURL } from 'packageurl-js'
import * as CDX from "@cyclonedx/cyclonedx-library"
import { execSync, spawnSync } from "child_process"


const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const DO_SBOM = process.env.DO_SBOM as string

// get the actual script path, not the process.cwd
const _path = PATH.dirname(process.argv[1])

const IMAGE_PATH =
    `${BUILD_PATH}/tmp/${MACHINE}/deploy/${MACHINE}-${DISTRO_MAJOR}-${DISTRO_MINOR}-${DISTRO_PATCH}.img`
process.env.IMAGE_PATH = IMAGE_PATH

const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
const SBOM_OUTPUT_PATH = `${BUILD_PATH}/tmp/${MACHINE}/sbom`
process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

if (DO_SBOM === "true") {
    logger.info("Generating SBOM for Kernel Linux ...")

    // get the kernel version
    // run the make kernelversion command in the kernel source directory
    const kernel_src_path = PATH.join(
        BUILD_PATH,
        "tmp",
        `${MACHINE}`,
        "linux"
    )

    switch (ARCH) {
        case "linux/amd64":
            process.env.ARCH = "x86"
            break

        case "linux/arm64":
            process.env.ARCH = "arm64"
            break

        default:
            break
    }

    let kernel_version = "unknown"
    kernel_version = execSync(
        "make kernelversion",
        {
            cwd: kernel_src_path,
            encoding: "utf-8",
            env: process.env
        }
    ).trim()

    const _cdx_sbom = new CDX.Models.Bom()
    _cdx_sbom.metadata.component = new CDX.Models.Component(
        CDX.Enums.ComponentType.OperatingSystem,
        "Linux Kernel",
        {
            version: `${kernel_version}`,
        }
    )
    const _tools_component = new CDX.Models.Component(
        CDX.Enums.ComponentType.Application,
        "gaia"
    )
    _tools_component.version = "0.0.0"
    _tools_component.externalReferences.add(
        new CDX.Models.ExternalReference(
            "https://github.com/gaiaBuildSystem/gaia",
            CDX.Enums.ExternalReferenceType.Website,
        )
    )
    _cdx_sbom.metadata.tools.components.add(
        _tools_component
    )
    _cdx_sbom.components.add(
        new CDX.Models.Component(
            CDX.Enums.ComponentType.Library,
            "linux_kernel",
            {
                version: `${kernel_version}`,
                cpe: `cpe:2.3:*:*:linux_kernel:${kernel_version}:*:*:*:*:*:*:*`,
                purl: PackageURL.fromString(`pkg:generic/linux_kernel@${kernel_version}`)
            }
        )
    )

    // write the SBOM to file
    if (!FS.existsSync(SBOM_OUTPUT_PATH)) {
        FS.mkdirSync(SBOM_OUTPUT_PATH, { recursive: true })
    }

    const sbom_file_path = PATH.join(
        SBOM_OUTPUT_PATH,
        `linux-kernel-sbom.json`
    )

    const serialized = new CDX.Serialize.JsonSerializer(
        new CDX.Serialize.JSON.Normalize.Factory(
            CDX.Spec.Spec1dot6
        )
    ).serialize(_cdx_sbom)

    FS.writeFileSync(
        sbom_file_path,
        JSON.stringify(JSON.parse(serialized), null, 2),
        "utf-8"
    )

    logger.success("SBOM generation for Kernel Linux completed successfully.")
}

process.exit(0)
