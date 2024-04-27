#!/bin/bash

systemctl stop systemd-timesyncd
systemctl disable systemd-timesyncd
systemctl mask systemd-timesyncd
