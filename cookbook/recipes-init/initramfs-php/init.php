#!/bin/php -n

<?php

function panic($message) {
    fwrite(STDERR, "[initramfs] $message\n");
    exit(69);
}

try {
    $cmdline = file_get_contents("/proc/cmdline");
    $args = explode(" ", $cmdline);

    foreach ($args as $arg) {
        list($key, $value) = explode("=", $arg);
        putenv("$key=$value");

        echo "[initramfs] $key=$value\n";
    }

    // set the video mode
    if (getenv('video') !== false) {
        list($_xres, $_yres) = explode("x", getenv('video'));

        shell_exec("fbset -fb /dev/fb0 -xres $_xres -yres $_yres");
    }

    // mount the root partition
    if (getenv('root') !== false && strpos(getenv('root'), "LABEL:") === 0) {
        $_label = explode(":", getenv('root'))[1];
        $_dev = trim(
            shell_exec("blkid -L $_label")
        );

        if ($_dev === "") {
            panic("[initramfs] root partition label not found");
        } else {
            echo "[initramfs] root partition label $_label found at $_dev\n";
        }

        shell_exec("/bin/mount -t ext4 $_dev /mnt/root");
        shell_exec("/bin/mount -t proc proc /mnt/root/proc");
        shell_exec("/bin/mount -t sysfs sys /mnt/root/sys");
        shell_exec("/bin/mount --rbind dev /mnt/root/dev");
        shell_exec("/bin/mount --make-rslave /mnt/root/dev");

        echo "[initramfs] root partition ".getenv('root')." mounted\n";
        echo "[initramfs] giving ctrl back to the init\n";
    } else {
        panic("[initramfs] root partition argument not found");
    }
} catch (Exception $e) {
    panic($e->getMessage());
}
