#!/bin/bash

# TODO: this was needed for some reason, but is not needed anymore?
# systemctl stop systemd-timesyncd
# systemctl disable systemd-timesyncd
# systemctl mask systemd-timesyncd

apt-get install -y systemd-timesyncd

systemctl unmask systemd-timesyncd
systemctl enable systemd-timesyncd
