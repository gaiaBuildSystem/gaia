#!/bin/bash

set -e

_path=$(dirname "$0")

# go to the target rootfs because we need the binaries in the right architecture
echo $USER_PASSWD | sudo -E -S chroot $IMAGE_MNT_ROOT /bin/bash -c "
    cd / &&
    pip3 install --break-system-packages setuptools &&
    pip3 install --break-system-packages staticx &&
    staticx /usr/bin/fbset fbset &&
    staticx /usr/bin/fbi fbi
"

# copy the static binaries to the initramfs folder
echo $USER_PASSWD | sudo -E -S mv $IMAGE_MNT_ROOT/fbset $INITRAMFS_PATH/bin/fbset
echo $USER_PASSWD | sudo -E -S mv $IMAGE_MNT_ROOT/fbi $INITRAMFS_PATH/bin/fbi

# fbi need fonts
echo $USER_PASSWD | sudo -E -S mkdir -p $INITRAMFS_PATH/usr/share/fonts
echo $USER_PASSWD | sudo -E -S cp -r $IMAGE_MNT_ROOT/usr/share/fonts/ $INITRAMFS_PATH/usr/share/fonts/

# deploy the image
# check if the SIMPLE_SPLASH_PATH is set
if [ -z "$SIMPLE_SPLASH_PATH" ]; then
    echo "SIMPLE_SPLASH_PATH is not set, using the default image"
    SIMPLE_SPLASH_PATH=$_path/deimos.png
fi

echo $USER_PASSWD | sudo -E -S cp $SIMPLE_SPLASH_PATH $INITRAMFS_PATH/splash.png

# deploy the script
echo $USER_PASSWD | sudo -E -S cp $_path/busybox/00-splash.sh $INITRAMFS_PATH/scripts/00-splash.sh

# clean the target rootfs
echo ${USER_PASSWD} | sudo -E -S chroot $IMAGE_MNT_ROOT /bin/bash -c "
    pip3 uninstall --break-system-packages -y setuptools &&
    pip3 uninstall --break-system-packages -y staticx &&
    apt-get purge -y python3-pip python3
"
