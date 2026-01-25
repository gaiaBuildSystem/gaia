#!/bin/bash

set -e

# Make sure root is shared
mount --make-rshared /

# create the mapping
kpartxret="$(kpartx -av "$IMAGE_PATH")"

# ensure device nodes are ready before proceeding
udevadm settle || true

# derive the base loop device reliably (supports multi-digit loop numbers)
DEV_LOOP=$(losetup -j "$IMAGE_PATH" | awk -F ':' '{print $1}' | xargs basename)

if [ -z "$DEV_LOOP" ]; then
    # fallback to parsing kpartx output if losetup returns nothing
    DEV_LOOP=$(echo "$kpartxret" | awk '/add map/ {print $3}' | head -n1 | sed -E 's/p[0-9]+$//')
fi
if [ -z "$DEV_LOOP" ]; then
    echo "Failed to determine loop device for $IMAGE_PATH"
    exit 1
fi

PART_LOOP="$DEV_LOOP"

# format it ??
if [ "$CLEAN_IMAGE" == "true" ]; then
    echo "Formatting the partitions"

    mkfs.vfat -F 32 /dev/mapper/${PART_LOOP}p1
    mkfs.ext4 /dev/mapper/${PART_LOOP}p2
    fatlabel /dev/mapper/${PART_LOOP}p1 $BOOT_LABEL
    e2label /dev/mapper/${PART_LOOP}p2 $ROOT_LABEL
    sync
fi

# mount the partitions
mkdir -p $IMAGE_MNT_BOOT
mkdir -p $IMAGE_MNT_ROOT


mount /dev/mapper/${PART_LOOP}p1 $IMAGE_MNT_BOOT
mount /dev/mapper/${PART_LOOP}p2 $IMAGE_MNT_ROOT

mount --make-shared $IMAGE_MNT_BOOT
mount --make-shared $IMAGE_MNT_ROOT


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

if [ "$MOUNT_DEBUG" == "true" ]; then
    # debug interactive shell
    echo "Entering debug shell. Type 'exit' to continue."
    /bin/bash -i
fi
