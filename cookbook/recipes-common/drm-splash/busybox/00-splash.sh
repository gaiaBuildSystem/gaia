#!/bin/busybox sh

echo "[initramfs] initializing drm splash screen..."

/bin/drmi /splash.png 0 >/dev/null 2>&1 &
echo "[initramfs] splash initialized..."
