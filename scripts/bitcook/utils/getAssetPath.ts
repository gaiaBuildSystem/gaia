#!/opt/bun/bin/bun

import logger from "node-color-log"
import FS from "fs"

export function getAssetPath (
    assetFilePath: string,
    paths: [{
        path: string,
        priority: number
    }]
): string {
    let _higher = {
        path: "",
        priority: -1
    }
    let _paths = paths.map((p) => p.path).join(", ")

    for (const _obj_path of paths) {
        const _assetPath = `${_obj_path.path}/${assetFilePath}`
        if (FS.existsSync(_assetPath)) {
            if (
                _obj_path.priority > _higher.priority
            ) {
                _higher = _obj_path
            }
        }
    }

    if (_higher.priority === -1) {
        logger.error(`asset ${assetFilePath} not found in paths ${_paths}`)
        throw new Error(`asset ${assetFilePath} not found in paths ${_paths}`)
    } else {
        return `${_higher.path}/${assetFilePath}`
    }
}
