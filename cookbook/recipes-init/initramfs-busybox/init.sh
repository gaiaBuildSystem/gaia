#!/bin/busybox sh

# hook the fails
on_error() {
    echo "[initramfs] An error occurred. Initializing a debug shell ..."
    # init a interactive shell
    /bin/busybox sh
}

trap on_error ERR

# Essential filesystems
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sys /sys
/bin/busybox mount -t devtmpfs dev /dev
/bin/busybox mount -t tmpfs tmp /run

echo "Hi from initramfs"

/bin/busybox --install -s >/dev/null 2>&1
/bin/busybox ln -s /bin/busybox /bin/clear >/dev/null 2>&1

# get and export the kernel command line
cmdline=$(cat /proc/cmdline)
set -- $cmdline

for arg in "$@"; do
    key="${arg%=*}"
    value="${arg#*=}"

    # if the value is empty, do not try to export
    [ -z "$value" ] && continue
    key=$(echo "$key" | tr '.' '_')

    # Prefix the key if it starts with possible bad variable characters
    if [[ $key =~ ^[0-9] ]]; then
        key="_$key"
    fi

    # now is ok to export
    export $key=$value

    echo "[initramfs] $key=$value"
done

# check if the shell debug is on /proc/cmdline
if grep -q "shell" /proc/cmdline; then
    echo "[initramfs] Debug shell is enabled!"
    sh +m

    # reboot
    echo "[initramfs] Rebooting..."
    reboot -f
fi

# check if there is files on the /scripts directory
# and execute them
if [ -d /scripts ]; then
    for script in /scripts/*; do
        if [ -x $script ]; then
            echo "[initramfs] Running $script..."
            $script
        fi
    done
fi

# switch to the real root
echo "Attempting to switch root..."
exec switch_root /mnt/root /sbin/init
