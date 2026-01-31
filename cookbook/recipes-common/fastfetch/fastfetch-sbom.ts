#!/opt/bun/bin/bun

import PATH from "path"
import FS from "fs"
import logger from "node-color-log"
import { PackageURL } from 'packageurl-js'
import * as CDX from "@cyclonedx/cyclonedx-library"
import { execSync, spawnSync } from "child_process"
import { Recipe } from "../../../scripts/bitcook/parse"


const ARCH = process.env.ARCH as string
const MACHINE = process.env.MACHINE as string
const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
const BUILD_PATH = process.env.BUILD_PATH as string
const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
const DISTRO_MINOR = process.env.DISTRO_MINOR as string
const DISTRO_PATCH = process.env.DISTRO_PATCH as string
const USER_PASSWD = process.env.USER_PASSWD as string
const DO_SBOM = process.env.DO_SBOM as string
const META = JSON.parse(process.env.META as string) as Recipe

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
    logger.info("Generating SBOM for fastfetch ...")

    // get the version
    // the version from msedit comes from the recipe json file

    let fastfetch_version = META.version

    const _cdx_sbom = new CDX.Models.Bom()
    _cdx_sbom.metadata.component = new CDX.Models.Component(
        CDX.Enums.ComponentType.OperatingSystem,
        "fastfetch",
        {
            version: `${fastfetch_version}`,
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
            "fastfetch",
            {
                version: `${fastfetch_version}`,
                cpe: `cpe:2.3:*:*:fastfetch:${fastfetch_version}:*:*:*:*:*:*:*`,
                purl: PackageURL.fromString(`pkg:generic/fastfetch@${fastfetch_version}`)
            }
        )
    )

    // write the SBOM to file
    if (!FS.existsSync(SBOM_OUTPUT_PATH)) {
        FS.mkdirSync(SBOM_OUTPUT_PATH, { recursive: true })
    }

    const sbom_file_path = PATH.join(
        SBOM_OUTPUT_PATH,
        `fastfetch-sbom.json`
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

    logger.success("SBOM generation for fastfetch completed successfully.")
}

process.exit(0)
