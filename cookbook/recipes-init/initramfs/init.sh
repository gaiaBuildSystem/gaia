#!/bin/busybox sh

# Essential filesystems
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sys /sys
/bin/busybox mount -t devtmpfs dev /dev
/bin/busybox mount -t tmpfs tmp /run

echo "Hello! This is the reference initramfs!"
/bin/fbi -T 7 -d /dev/fb0 --noverbose /noStress.png >/dev/null 2>&1

/bin/busybox --install -s >/dev/null 2>&1
/bin/busybox ln -s /bin/busybox /bin/clear >/dev/null 2>&1

# check if the shell debug is on /proc/cmdline
if grep -q "shell" /proc/cmdline; then
    echo "[initramfs] Debug shell is enabled!"
    sh +m

    # reboot
    echo "[initramfs] Rebooting..."
    reboot -f
fi

# call the typescript init
./init.php

# switch to the real root
echo "Attempting to switch root..."
exec switch_root /mnt/root /sbin/init
