#!/bin/bash

set -e

# before unmounting the partitions, we need to sync the data
sync

# these can return error, let's ignore them
set +e

# umount the bind mounts
umount $IMAGE_MNT_ROOT/dev/pts
umount $IMAGE_MNT_ROOT/dev
umount $IMAGE_MNT_ROOT/proc
umount $IMAGE_MNT_ROOT/sys

# umount
echo "Unmounting $IMAGE_MNT_BOOT and $IMAGE_MNT_ROOT"
umount $IMAGE_MNT_BOOT
umount $IMAGE_MNT_ROOT

set -e

# first check if the image exists
if [ ! -f $IMAGE_PATH ]; then
    echo "Image file $IMAGE_PATH does not exist"
    exit 0
fi

# remove the mapping
sleep 1
kpartx -dv $IMAGE_PATH
sleep 1

# for each /dev/loopX device, remove the mapping
for device in /dev/loop*; do
  if [[ "$device" != "/dev/loop-control" ]]; then
    echo "Trying to remove loop device: $device"
    # if this errors out, it's fine, nothing to worry about
    losetup -d "$device" || true
  fi
done

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
