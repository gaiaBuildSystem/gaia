#!/bin/bash

# create the mapping
kpartxret="$(kpartx -av $IMAGE_PATH)"
read PART_LOOP <<<$(grep -o 'loop.' <<<"$kpartxret")

# format it ??
if [ "$CLEAN_IMAGE" == "true" ]; then
    mkfs.vfat -F 32 /dev/mapper/${PART_LOOP}p1
    mkfs.ext4 /dev/mapper/${PART_LOOP}p2
    fatlabel /dev/mapper/${PART_LOOP}p1 'BOOT'
    e2label /dev/mapper/${PART_LOOP}p2 'gaia'
    sync
fi

# mount the partitions
mkdir -p $IMAGE_MNT_BOOT
mkdir -p $IMAGE_MNT_ROOT

mount /dev/mapper/${PART_LOOP}p1 $IMAGE_MNT_BOOT
mount /dev/mapper/${PART_LOOP}p2 $IMAGE_MNT_ROOT

# before mount the bind mounts, we need to create the mount points
mkdir -p $IMAGE_MNT_ROOT/dev
mkdir -p $IMAGE_MNT_ROOT/dev/pts
mkdir -p $IMAGE_MNT_ROOT/proc
mkdir -p $IMAGE_MNT_ROOT/sys

# mount the bind mounts
mount -o bind /dev $IMAGE_MNT_ROOT/dev
mount -o bind /dev/pts $IMAGE_MNT_ROOT/dev/pts
mount -t proc none $IMAGE_MNT_ROOT/proc
mount -t sysfs none $IMAGE_MNT_ROOT/sys
