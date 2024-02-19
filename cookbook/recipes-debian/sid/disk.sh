#!/bin/bash

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
parted $IMAGE_PATH -s mktable msdos
parted $IMAGE_PATH -s mkpart primary fat32 1 50 \
    set 1 lba on align-check optimal 1 \
    mkpart primary ext4 51 $(($MAX_IMG_SIZE - 51))
