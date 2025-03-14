#!/bin/bash

set -e

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
sleep 1
kpartx -dv $IMAGE_PATH
sleep 1

# detach the loop device
LOOP_DEVICE=$(losetup -j "$IMAGE_PATH" | awk -F: '{print $1}')
if [ ! -z "$LOOP_DEVICE" ]; then
  losetup -d "$LOOP_DEVICE"
fi

# Remove any remaining /dev/mapper entries
if [ -d /dev/mapper ]; then
  for device in /dev/mapper/*; do
    if [[ "$device" != "/dev/mapper/control" ]]; then
      echo "Trying to remove mapper device: $device"
      # if this errors out, it's fine, nothing to worry about
      dmsetup remove "$device" || true
    fi
  done
fi
