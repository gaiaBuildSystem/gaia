#!/bin/bash

set -e

_path=$(dirname "$0")


cd /
staticx /usr/bin/fbset fbset
staticx /usr/bin/fbi fbi


# copy the static binaries to the initramfs folder
mv /fbset $INITRAMFS_PATH/bin/fbset
mv /fbi $INITRAMFS_PATH/bin/fbi

# fbi need fonts
mkdir -p $INITRAMFS_PATH/usr/share/fonts

cp -r /usr/share/fonts/ $INITRAMFS_PATH/usr/share/fonts/

# deploy the image
# check if the SIMPLE_SPLASH_PATH is set
if [ -z "$SIMPLE_SPLASH_PATH" ]; then
    echo "SIMPLE_SPLASH_PATH is not set, using the default image"
    SIMPLE_SPLASH_PATH=$_path/deimos.png
fi

cp $SIMPLE_SPLASH_PATH $INITRAMFS_PATH/splash.png

# deploy the script
cp $_path/busybox/10-splash.sh $INITRAMFS_PATH/scripts/10-splash.sh
