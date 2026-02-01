import { execSync } from "child_process"
import logger from "node-color-log"
import FS from "fs"
import PATH from "path"
import * as CDX from "@cyclonedx/cyclonedx-library"
import { Recipe } from "./parse"



export function ExecSBOM (recipes: Recipe[]): void {
    logger.info("Executing SBOM ...")

    const ARCH = process.env.ARCH as string
    const MACHINE = process.env.MACHINE as string
    const MAX_IMG_SIZE = process.env.MAX_IMG_SIZE as string
    const DISTRO_NAME = process.env.DISTRO_NAME as string
    const BUILD_PATH = process.env.BUILD_PATH as string
    const DISTRO_MAJOR = process.env.DISTRO_MAJOR as string
    const DISTRO_MINOR = process.env.DISTRO_MINOR as string
    const DISTRO_PATCH = process.env.DISTRO_PATCH as string
    const DISTRO_BUILD = process.env.DISTRO_BUILD as string
    const USER_PASSWD = process.env.USER_PASSWD as string
    const DO_SBOM = process.env.DO_SBOM as string

    const IMAGE_MNT_BOOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/boot`
    const IMAGE_MNT_ROOT = `${BUILD_PATH}/tmp/${MACHINE}/mnt/root`
    process.env.IMAGE_MNT_BOOT = IMAGE_MNT_BOOT
    process.env.IMAGE_MNT_ROOT = IMAGE_MNT_ROOT

    // execute the sbom recipes
    // directly call the deploy scrips from the recipes
    for (const recipe of recipes) {
        // check if the recipe has a build script
        if (recipe.sbomRecipes && recipe.sbomRecipes.length > 0) {
            logger.info(`Executing SBOM for ${recipe.name} ...`)

            // execute the build scripts
            for (const sbomRecipe of recipe.sbomRecipes) {
                process.env.META = JSON.stringify(recipe)

                logger.info(`Executing SBOM script ${sbomRecipe} ...`)
                execSync(
                    `exec ${sbomRecipe}`,
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

    // merge SBOMs
    logger.info("Merging SBOMs ...")

    // then create the final SBOM file
    const finalSbomPath = `${BUILD_PATH}/tmp/${MACHINE}/sbom/${DISTRO_NAME}-${MACHINE}-sbom.cdx.json`
    const _cdx_sbom = new CDX.Models.Bom()
    _cdx_sbom.metadata.component = new CDX.Models.Component(
        CDX.Enums.ComponentType.OperatingSystem,
        `${DISTRO_NAME}`,
        {
            version: `${DISTRO_MAJOR}.${DISTRO_MINOR}.${DISTRO_PATCH}.${DISTRO_BUILD}`,
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

    // now we iterate over all SBOMs in the sbom directory
    const sbomDir = `${BUILD_PATH}/tmp/${MACHINE}/sbom`
    const sbomFiles = FS.readdirSync(sbomDir)
        .filter(file =>
            file.endsWith(".json") &&
            !file.includes(`${DISTRO_NAME}-${MACHINE}-sbom.cdx.json`) // skip the final output file if it exists
        )
        .map(file => PATH.join(sbomDir, file))

    for (const sbomFile of sbomFiles) {
        logger.info(`Merging SBOM file ${sbomFile} ...`)

        const sbomJson = JSON.parse(FS.readFileSync(sbomFile, "utf-8"))

        // merge components from the JSON
        if (sbomJson.components && Array.isArray(sbomJson.components)) {
            for (const compData of sbomJson.components) {
                const component = new CDX.Models.Component(
                    compData.type || CDX.Enums.ComponentType.Library,
                    compData.name,
                    {
                        version: compData.version,
                        group: compData.group,
                        description: compData.description,
                        cpe: compData.cpe || undefined,
                        purl: compData.purl || undefined
                    }
                )

                // Copy bom-ref if present
                if (compData['bom-ref']) {
                    component.bomRef.value = compData['bom-ref']
                }

                // do not add duplicate components
                let duplicate = false
                for (const existingComp of _cdx_sbom.components) {
                    if (
                        existingComp.name === component.name &&
                        existingComp.version === component.version &&
                        existingComp.type === component.type
                    ) {
                        duplicate = true
                        break
                    }
                }

                if (!duplicate)
                    _cdx_sbom.components.add(component)
            }
        }
    }

    // that's all folks, write the final SBOM file
    const serialized = new CDX.Serialize.JsonSerializer(
        new CDX.Serialize.JSON.Normalize.Factory(
            CDX.Spec.Spec1dot6
        )
    ).serialize(_cdx_sbom)

    FS.writeFileSync(
        finalSbomPath,
        JSON.stringify(
            JSON.parse(serialized), null, 2
        ),
        "utf-8"
    )

    logger.success("SBOM generation and merging completed successfully.")
}
