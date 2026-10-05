#!/bin/sh
set -eu
mkdir -p /data/firings /data/electricity
chown -R appuser:appuser /data
exec runuser -u appuser -- "$@"
