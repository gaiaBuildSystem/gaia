#!/bin/bash

# before unmounting the partitions, we need to sync the data
sync

# umount the bind mounts
umount $IMAGE_MNT_ROOT/dev/pts
umount $IMAGE_MNT_ROOT/dev
umount $IMAGE_MNT_ROOT/proc
umount $IMAGE_MNT_ROOT/sys

# umount
umount $IMAGE_MNT_BOOT
umount $IMAGE_MNT_ROOT

# first check if the image exists
if [ ! -f $IMAGE_PATH ]; then
    echo "Image file $IMAGE_PATH does not exist"
    exit 0
fi

# remove the mapping
kpartx -dv $IMAGE_PATH
