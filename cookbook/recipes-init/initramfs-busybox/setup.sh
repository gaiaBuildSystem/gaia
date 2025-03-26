#!/bin/bash

set -e

# go to the target rootfs because we need the binaries in the right architecture
sudo -E chroot $IMAGE_MNT_ROOT /bin/bash -c "
    cd / &&
    pip3 install --break-system-packages setuptools &&
    pip3 install --break-system-packages staticx &&
    staticx /usr/sbin/blkid blkid
"

# copy the static binaries to the initramfs folder
sudo -E mv $IMAGE_MNT_ROOT/blkid $INITRAMFS_PATH/bin/blkid

# clean the target rootfs
sudo -E chroot $IMAGE_MNT_ROOT /bin/bash -c "
    pip3 uninstall --break-system-packages -y setuptools &&
    pip3 uninstall --break-system-packages -y staticx &&
    apt-get purge -y python3-pip python3
"
