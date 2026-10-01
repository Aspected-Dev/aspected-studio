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
# On macOS the same staging name is used without a trailing ".app", because
# `deno desktop` appends ".app" itself.
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

# Pack a .app into a UDZO DMG with an explicit size budget.
#
# deno desktop's own hdiutil path often fails on GitHub macos-14 runners with
# "No space left on device" even when tens of GB are free: hdiutil underestimates
# the image when the bundle has hardlinks/sparse files. We stage with ditto and
# over-provision the RW image; UDZO conversion drops unused sectors.
pack_macos_dmg() {
  local app="$1"
  local dmg="$2"
  local volname="$3"
  local staging rw_dmg app_kb size_mb

  if [[ ! -d "$app" ]]; then
    echo "error: expected app bundle at $app" >&2
    return 1
  fi
  if ! command -v hdiutil >/dev/null 2>&1; then
    echo "error: hdiutil is required to build macOS .dmg on this host" >&2
    return 1
  fi

  staging="$(mktemp -d "${TMPDIR:-/tmp}/aspected-dmg.XXXXXX")"
  rw_dmg="${staging}/rw.dmg"
  # shellcheck disable=SC2064
  trap "rm -rf '$staging'" RETURN

  local app_name root_dir
  app_name="$(basename "$app")"
  root_dir="$staging/root"
  mkdir -p "$root_dir"
  # ditto materializes hardlinks/sparse files so the measured size matches
  # what hdiutil will copy into the image.
  ditto "$app" "$root_dir/$app_name"
  app_kb="$(du -sk "$root_dir" | awk '{ print $1 }')"
  # Kilobytes -> MB, 4x headroom + 256 MB for HFS+ catalog metadata.
  size_mb=$(((app_kb * 4 / 1024) + 256))
  if [[ "$size_mb" -lt 64 ]]; then
    size_mb=64
  fi
  if [[ "$size_mb" -gt 2048 ]]; then
    size_mb=2048
  fi

  echo "Creating DMG (${size_mb} MB image for ${app_kb} KB payload)..."
  df -h "$(dirname "$dmg")" "$staging" || true

  rm -f "$dmg"
  hdiutil create \
    -srcfolder "$root_dir" \
    -volname "$volname" \
    -fs HFS+ \
    -format UDRW \
    -size "${size_mb}m" \
    "$rw_dmg"
  hdiutil convert "$rw_dmg" -format UDZO -imagekey zlib-level=9 -o "$dmg"
  rm -f "$rw_dmg"
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
elif [[ -n "$out" && "$out" == *.dmg ]]; then
  out_dir="$(dirname "$out")"
  mkdir -p "$out_dir"
  display_name="$(read_display_name)"
  # deno desktop appends ".app" to --output. Passing a path that already ends
  # in ".app" yields "….app.app" and then pack_macos_dmg cannot find the bundle.
  staging="${out_dir}/${display_name}"
  rm -rf "$staging" "${staging}.app" "$out" "${staging}.dylib"
  # Build the .app only; we pack the DMG ourselves (see pack_macos_dmg).
  # shellcheck disable=SC2086
  deno desktop ${args[@]+"${args[@]}"} --output "$staging" ${extra[@]+"${extra[@]}"} .
  pack_macos_dmg "${staging}.app" "$out" "$display_name"
  rm -rf "$staging" "${staging}.app" "${staging}.dylib"
else
  if [[ -n "$out" ]]; then
    args+=(--output "$out")
  fi
  # shellcheck disable=SC2086
  deno desktop ${args[@]+"${args[@]}"} ${extra[@]+"${extra[@]}"} .
fi
