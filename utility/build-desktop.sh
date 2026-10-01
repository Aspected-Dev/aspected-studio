#!/usr/bin/env bash
# Build a desktop installer via `deno desktop`.
#
# On Linux AppImage/deb, the --output basename is baked into the Laufey binary
# as the display name / window title, and also becomes the sibling .so stem.
# A dotted basename (e.g. aspected-studio-0.1.0-….AppImage) makes Laufey look
# up the runtime via Path::with_extension("so"), which turns
# "aspected-studio-0.1" into "aspected-studio-0.so" and fails with
# "No runtime library found".
#
# Stage with desktop.app.name (no dots), then rename to the versioned asset.
#
# For .deb, also rewrite control Version to match deno.json (deno desktop
# currently embeds 1.0.0) and ensure the webview GTK WebKit package is listed.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

target=""
out=""
extra=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target="${2:?}"
      shift 2
      ;;
    --output | -o)
      out="${2:?}"
      shift 2
      ;;
    *)
      extra+=("$1")
      shift
      ;;
  esac
done

read_version() {
  deno eval -q 'const j=JSON.parse(await Deno.readTextFile("deno.json")); console.log(j.version)'
}

read_display_name() {
  deno eval -q '
    const j = JSON.parse(await Deno.readTextFile("deno.json"));
    console.log(j.desktop?.app?.name ?? j.name ?? "Aspected Studio");
  '
}

# Default local Linux build: versioned AppImage filename.
if [[ -z "$out" && -z "$target" && "${#extra[@]}" -eq 0 ]]; then
  out="./release/aspected-studio-$(read_version)-x86_64-unknown-linux-gnu.AppImage"
fi

args=()
if [[ -n "$target" ]]; then
  args+=(--target "$target")
fi

# Rewrite Debian control metadata after `deno desktop` packs a .deb.
fix_deb_control() {
  local deb="$1"
  local version="$2"
  local display_name="$3"
  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN

  dpkg-deb -R "$deb" "$work/root"
  local control="$work/root/DEBIAN/control"
  if [[ ! -f "$control" ]]; then
    echo "error: missing DEBIAN/control in $deb" >&2
    return 1
  fi

  sed -i "s/^Version:.*/Version: ${version}/" "$control"
  sed -i "s/^Description:.*/Description: ${display_name} desktop application/" "$control"

  # Laufey webview links WebKitGTK; deno's default Depends omit it.
  if ! grep -q 'libwebkit2gtk-4.1-0' "$control"; then
    sed -i 's/^Depends: /Depends: libwebkit2gtk-4.1-0, /' "$control"
  fi

  local rebuilt="${work}/rebuilt.deb"
  dpkg-deb --root-owner-group -b "$work/root" "$rebuilt"
  mv -f "$rebuilt" "$deb"
}

# Bash 3.2 (macOS) treats empty arrays as unbound under `set -u`.
# Expand with ${arr[@]+"${arr[@]}"} so CI on Apple runners does not fail.
if [[ -n "$out" && ( "$out" == *.AppImage || "$out" == *.deb ) ]]; then
  out_dir="$(dirname "$out")"
  mkdir -p "$out_dir"
  ext="${out##*.}"
  display_name="$(read_display_name)"
  staging="${out_dir}/${display_name}.${ext}"
  rm -f "$staging"
  # shellcheck disable=SC2086
  deno desktop ${args[@]+"${args[@]}"} --output "$staging" ${extra[@]+"${extra[@]}"} .
  if [[ "$staging" != "$out" ]]; then
    mv -f "$staging" "$out"
  fi
  if [[ "$ext" == "deb" ]]; then
    fix_deb_control "$out" "$(read_version)" "$display_name"
  fi
  # Drop Deno's parallel directory bundle; the installer is the release asset.
  rm -rf "${out_dir}/${display_name}"
else
  if [[ -n "$out" ]]; then
    args+=(--output "$out")
  fi
  # shellcheck disable=SC2086
  deno desktop ${args[@]+"${args[@]}"} ${extra[@]+"${extra[@]}"} .
fi
