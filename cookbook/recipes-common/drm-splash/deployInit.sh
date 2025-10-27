#!/bin/bash

set -e

if [ -n "$DRM_SPLASH_NO_DEPLOY_INITRAMFS" ]; then
    exit 0
fi

_path=$(dirname "$0")

# copy the static binaries to the initramfs folder
cp $BUILD_PATH/tmp/$MACHINE/drm-splash/drm_display $INITRAMFS_PATH/bin/drmi

# deploy the image
# check if the DRM_SPLASH_PATH is set
if [ -z "$DRM_SPLASH_PATH" ]; then
    echo "DRM_SPLASH_PATH is not set, using the default image"
    DRM_SPLASH_PATH=$_path/deimos.png
fi

cp $DRM_SPLASH_PATH $INITRAMFS_PATH/splash.png

# deploy the script
cp $_path/busybox/00-splash.sh $INITRAMFS_PATH/scripts/00-splash.sh
