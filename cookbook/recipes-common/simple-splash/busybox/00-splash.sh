#!/bin/busybox sh

echo "[initramfs] initializing simple splash screen..."

/bin/fbset -t 39721 48 16 33 10 96 2
/bin/fbi -T 1 -d /dev/fb0 --noverbose -autodown /splash.png >/dev/null 2>&1
