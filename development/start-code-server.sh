#!/usr/bin/env bash
set -Eeuo pipefail
: "${PASSWORD:?CODE_SERVER_PASSWORD/PASSWORD must be set}"
mkdir -p /config/User /extensions /workspace-state
rm -rf /config/User/workspaceStorage
ln -s /workspace-state /config/User/workspaceStorage

# A virtual environment is not portable between hosts, CPU architectures or
# container rebuilds. Recreate it if its interpreter cannot actually execute.
if ! /workspace/.venv/bin/python -c 'import sys; print(sys.executable)' >/dev/null 2>&1; then
  echo 'Creating a fresh project virtual environment...'
  rm -rf /workspace/.venv
  python3 -m venv /workspace/.venv
fi
/workspace/.venv/bin/python -m pip install --disable-pip-version-check -r /workspace/backend/requirements-dev.txt

extensions=(ms-python.python ms-python.vscode-pylance charliermarsh.ruff ms-azuretools.vscode-docker dbaeumer.vscode-eslint esbenp.prettier-vscode dsznajder.es7-react-js-snippets GitHub.copilot)
if [[ ! -f /extensions/.installed ]]; then
  for extension in "${extensions[@]}"; do
    code-server --extensions-dir /extensions --install-extension "$extension" || printf 'WARNING: Could not install %s\n' "$extension" >&2
  done
  touch /extensions/.installed
fi
exec code-server /workspace --bind-addr 0.0.0.0:8443 --auth password --user-data-dir /config --extensions-dir /extensions --disable-telemetry
