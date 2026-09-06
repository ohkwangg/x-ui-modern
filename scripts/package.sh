#!/usr/bin/env bash
set -Eeuo pipefail
arch=${1:?Usage: package.sh amd64|arm64|s390x}
case "$arch" in
  amd64) xray_asset=Xray-linux-64.zip ;;
  arm64) xray_asset=Xray-linux-arm64-v8a.zip ;;
  s390x) xray_asset=Xray-linux-s390x.zip ;;
  *) echo 'Unsupported architecture'; exit 1 ;;
esac
version=${XRAY_VERSION:-v26.3.27}
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/x-ui/bin" dist
CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -trimpath -ldflags='-s -w' -o "$stage/x-ui/x-ui" .
curl -fL --retry 3 "https://github.com/XTLS/Xray-core/releases/download/${version}/${xray_asset}" -o "$stage/xray.zip"
unzip -q "$stage/xray.zip" -d "$stage/xray"
cp "$stage/xray/xray" "$stage/x-ui/bin/xray-linux-$arch"
cp "$stage/xray/geoip.dat" "$stage/xray/geosite.dat" "$stage/x-ui/bin/"
cp "$stage/xray/LICENSE" "$stage/x-ui/bin/Xray-LICENSE"
cp x-ui.sh x-ui.service LICENSE "$stage/x-ui/"
printf '%s\n' "$version" > "$stage/x-ui/bin/XRAY_VERSION"
chmod 755 "$stage/x-ui/x-ui" "$stage/x-ui/x-ui.sh" "$stage/x-ui/bin/xray-linux-$arch"
tar -C "$stage" -czf "dist/x-ui-linux-$arch.tar.gz" x-ui
