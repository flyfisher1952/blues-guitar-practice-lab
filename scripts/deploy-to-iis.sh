#!/usr/bin/env bash

set -euo pipefail

source_dir="dist/blues-guitar-practice-lab/browser"
iis_dir="/c/inetpub/blues-guitar-practice-lab"

if [[ ! -f "$source_dir/index.html" ]]; then
  echo "Deployment failed: $source_dir/index.html was not found."
  echo "Run npm run build first."
  exit 1
fi

mkdir -p "$iis_dir"
cp -R "$source_dir/." "$iis_dir/"

echo "Deployment completed."
echo "Open http://localhost"