#!/bin/bash

set -e

echo "Building drm-splash..."

cd $BUILD_PATH/tmp/$MACHINE/drm-splash
chmod +x phobos-build.sh
./phobos-build.sh
