#!/usr/bin/env bash
set -euo pipefail
package_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec deno run --check --no-lock --config "$package_dir/demo/deno.json" --allow-read --allow-write="$package_dir/demo" "$package_dir/demo/test-latex.ts"
