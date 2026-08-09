#!/bin/busybox sh

find_dev_by_label() {
    target_label="$1"
    [ -z "$target_label" ] && return 1

    for dev in $(awk 'NR>2 {print $4}' /proc/partitions); do
        dev_path="/dev/$dev"
        [ -b "$dev_path" ] || continue

        # 1. Read ext2/3/4 superblock label (offset 1144, 16 bytes)
        label=$(dd if="$dev_path" bs=1 skip=1144 count=16 2>/dev/null | tr -d '\0')

        # 2. Fall back to FAT32 volume label (offset 71, 11 bytes)
        if [ -z "$label" ]; then
            label=$(dd if="$dev_path" bs=1 skip=71 count=11 2>/dev/null | tr -d '\0')
        fi

        # 3. Trim whitespace (FAT volume labels are padded with spaces)
        label=$(printf '%s' "$label" | awk '{sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); print}')

        if [ "$label" = "$target_label" ]; then
            echo "$dev_path"
            return 0
        fi
    done

    return 1
}

if [[ $root == LABEL:* ]]; then
    _label="${root#*:}"
    echo "[initramfs] searching for root partition with label $_label"

    # Wait for the device to be available
    timeout=60 # Timeout in seconds
    interval=1 # Interval between checks in seconds
    elapsed=0

    while [ -z "$_dev" ]; do
        _dev=$(find_dev_by_label "$_label")

        if [ $elapsed -ge $timeout ]; then
            echo "[initramfs] root device find timeout"

            # this is a fatal error we should reboot
            echo 1 > /proc/sys/kernel/sysrq
            echo b > /proc/sysrq-trigger

            exit 69
        fi

        sleep $interval
        elapsed=$((elapsed + interval))
    done

    echo "[initramfs] root partition label $_label found at $_dev"

    mount -t ext4 $_dev /mnt/root
    mount -t proc proc /mnt/root/proc
    mount -t sysfs sys /mnt/root/sys
    mount --rbind dev /mnt/root/dev
    mount --make-rslave /mnt/root/dev

    echo "[initramfs] root partition $root mounted"

else
    echo "[initramfs] root partition argument not found"
    exit 69
fi
