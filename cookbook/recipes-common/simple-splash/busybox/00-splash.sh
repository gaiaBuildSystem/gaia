#!/bin/busybox sh

echo "[initramfs] initializing simple splash screen..."

mkdir -p /etc/fonts
mkdir -p /var/cache/fontconfig
chmod 777 /var/cache/fontconfig
mkdir -p ~/.cache/fontconfig

echo "[initramfs] modeset initializing..."
/bin/fbi -T 1 -d /dev/fb0 --noverbose -autodown /splash.png >/dev/null 2>&1
echo "[initramfs] splash initialized..."
