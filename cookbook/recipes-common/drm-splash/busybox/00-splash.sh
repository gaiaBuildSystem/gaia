#!/bin/busybox sh

echo "[initramfs] initializing drm splash screen..."

# this means drmi /splash.png /dev/dri/card0 do_not_scale
/bin/drmi /splash.png 0 0 >/dev/null 2>&1 &
echo "[initramfs] splash initialized..."
