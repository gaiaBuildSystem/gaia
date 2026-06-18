#!/bin/busybox sh

echo "[initramfs] initializing drm splash screen..."

# there are machines that we need to find the right card index
CARD_INDEX=$(ls /sys/class/drm/ | grep -E '^card[0-9]+-' | sed 's/card\([0-9]*\)-.*/\1/' | sort -un | head -1)

# this means drmi /splash.png /dev/dri/card0 do_not_scale
/bin/drmi /splash.png $CARD_INDEX 0 >/dev/null 2>&1 &
echo "[initramfs] splash initialized..."
