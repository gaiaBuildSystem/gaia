#!/opt/bun/bin/bun

import logger from "node-color-log"

export function canExecRecipe(
    recipeName: string
): boolean {
    if (process.env.RECIPE === undefined || process.env.RECIPE === recipeName) {
        return true
    } else {
        logger.warn(`recipe ${recipeName} will be skipped`)
        return false
    }
}
