#!/bin/busybox sh

echo "[initramfs] initializing simple splash screen..."

/bin/fbi -T 7 -d /dev/fb0 --noverbose -autodown /splash.png >/dev/null 2>&1
