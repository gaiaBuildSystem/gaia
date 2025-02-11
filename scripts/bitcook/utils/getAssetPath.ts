#!/opt/bun/bin/bun

import logger from "node-color-log"
import FS from "fs"

export function getAssetPath(
    assetFilePath: string,
    paths: string
): string {
    const _paths = paths.split(",")

    for (const _path of _paths) {
        const _assetPath = `${_path}/${assetFilePath}`
        if (FS.existsSync(_assetPath)) {
            return _assetPath
        }
    }

    logger.error(`asset ${assetFilePath} not found in paths ${_paths}`)
    throw new Error(`asset ${assetFilePath} not found in paths ${_paths}`)
}
