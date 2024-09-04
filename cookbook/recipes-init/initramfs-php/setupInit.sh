#!/bin/bash

set -e

mkdir -p tmp-initramfs
cd tmp-initramfs

mkdir -p {bin,etc,lib,root,sbin,usr,tmp,proc,sys,dev,run,usr/bin,mnt/root}

# install staticx
# I do not care for python, so I'm not breaking the system packages
pip3 install --break-system-packages setuptools
pip3 install --break-system-packages staticx

cd ./bin

staticx /usr/sbin/blkid blkid
staticx /usr/bin/fbset fbset
staticx /usr/bin/fbi fbi
staticx /usr/bin/php php
cp /usr/bin/busybox .

cd ..

# fbi need fonts
mkdir -p ./usr/share/fonts
cp -r /usr/share/fonts/ ./usr/share/fonts/

# move the root stuff
mv /init.sh ./init
mv /init.php ./init.php
mv /noStress.png ./noStress.png
chmod +x ./init.php
chmod +x ./init

# create
find . | cpio -H newc -o >/initramfs.cpio
gzip -c /initramfs.cpio >/initramfs.cpio.gz

# cleanup
rm -rf /initramfs.cpio /tmp-initramfs /noStress.png
apt-get purge -y python3-pip python3
