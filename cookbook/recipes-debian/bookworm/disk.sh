#!/bin/bash

set -e

mkdir -p "$BUILD_PATH/tmp/$MACHINE/deploy"

# if the file already exists
if [ "$CLEAN_IMAGE" == "true" ]; then
    if [ -f "$IMAGE_PATH" ]; then
        rm -f "$IMAGE_PATH"
    fi
else
    if [ -f "$IMAGE_PATH" ]; then
        echo "Reusing existing image file: $IMAGE_PATH"
        exit 0
    fi
fi

# create the image file
dd if=/dev/zero of=$IMAGE_PATH \
    bs=1048576 count=${MAX_IMG_SIZE} status=progress

# create the partition table
# Start partitions at 8MB to leave space for bootloaders (e.g., i.MX platforms need ~2-4MB at 32KB)
parted $IMAGE_PATH -s mktable msdos
parted $IMAGE_PATH -s mkpart primary fat32 8 158 \
    set 1 lba on align-check optimal 1 \
    mkpart primary ext4 159 $(($MAX_IMG_SIZE - 151))
