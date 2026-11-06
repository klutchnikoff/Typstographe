#!/bin/sh
# Register the package's MIME metadata and icons without changing user defaults.
set -e
if [ -d /usr/share/mime ] && command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime
fi
if [ -d /usr/share/applications ] && command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications
fi
if [ -d /usr/share/icons/hicolor ] && command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache --force --ignore-theme-index /usr/share/icons/hicolor
fi
