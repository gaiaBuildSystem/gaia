#!/bin/bash

set -e

_path=$(dirname "$0")

# go to the target rootfs because we need the binaries in the right architecture
sudo -E chroot $IMAGE_MNT_ROOT /bin/bash -c "
    cd / &&
    pip3 install --break-system-packages setuptools &&
    pip3 install --break-system-packages staticx &&
    staticx /usr/bin/fbset fbset &&
    staticx /usr/bin/fbi fbi
"

# copy the static binaries to the initramfs folder
sudo -E mv $IMAGE_MNT_ROOT/fbset $INITRAMFS_PATH/bin/fbset
sudo -E mv $IMAGE_MNT_ROOT/fbi $INITRAMFS_PATH/bin/fbi

# fbi need fonts
sudo -E mkdir -p $INITRAMFS_PATH/usr/share/fonts
sudo -E cp -r $IMAGE_MNT_ROOT/usr/share/fonts/ $INITRAMFS_PATH/usr/share/fonts/

# deploy the image
# check if the SIMPLE_SPLASH_PATH is set
if [ -z "$SIMPLE_SPLASH_PATH" ]; then
    echo "SIMPLE_SPLASH_PATH is not set, using the default image"
    SIMPLE_SPLASH_PATH=$_path/deimos.png
fi

sudo -E cp $SIMPLE_SPLASH_PATH $INITRAMFS_PATH/splash.png

# deploy the script
sudo -E cp $_path/busybox/00-splash.sh $INITRAMFS_PATH/scripts/00-splash.sh

# clean the target rootfs
sudo -E chroot $IMAGE_MNT_ROOT /bin/bash -c "
    pip3 uninstall --break-system-packages -y setuptools &&
    pip3 uninstall --break-system-packages -y staticx &&
    apt-get purge -y python3-pip python3
"
