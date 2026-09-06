#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Based on vaxilu/x-ui; releases and updates belong to this fork.
readonly REPOSITORY='ohkwangg/x-ui-modern'
[[ $EUID -eq 0 ]] || { echo '请以 root 运行安装脚本'; exit 1; }
command -v systemctl >/dev/null || { echo '需要使用 systemd 的 Linux 系统'; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  s390x) arch=s390x ;;
  *) echo "不支持的架构：$(uname -m)"; exit 1 ;;
esac
if ! command -v curl >/dev/null; then
  if command -v apt-get >/dev/null; then apt-get update; apt-get install -y curl ca-certificates;
  elif command -v dnf >/dev/null; then dnf install -y curl ca-certificates;
  elif command -v yum >/dev/null; then yum install -y curl ca-certificates;
  else echo '请先安装 curl 和 ca-certificates'; exit 1; fi
fi
for command in tar sha256sum mktemp; do command -v "$command" >/dev/null || { echo "缺少 $command"; exit 1; }; done
version="${1:-latest}"
if [[ "$version" == latest ]]; then
  base="https://github.com/${REPOSITORY}/releases/latest/download"
else
  [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo '版本格式应为 v1.0.0'; exit 1; }
  base="https://github.com/${REPOSITORY}/releases/download/${version}"
fi
stage=$(mktemp -d /usr/local/.x-ui-install.XXXXXXXX)
backup=''
changed=0
was_active=0
systemctl is-active --quiet x-ui && was_active=1
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 && changed == 1 )); then
    echo "安装失败，正在恢复备份：$backup"
    systemctl stop x-ui || true
    rm -rf -- /usr/local/x-ui
    [[ ! -d "$backup/app" ]] || cp -a "$backup/app" /usr/local/x-ui
    [[ ! -d "$backup/db" ]] || { rm -rf -- /etc/x-ui; cp -a "$backup/db" /etc/x-ui; }
    [[ ! -f "$backup/service" ]] || cp -a "$backup/service" /etc/systemd/system/x-ui.service
    [[ ! -f "$backup/command" ]] || cp -a "$backup/command" /usr/bin/x-ui
    systemctl daemon-reload || true
    (( was_active == 0 )) || systemctl start x-ui || true
  fi
  rm -rf -- "$stage"
  exit "$status"
}
trap cleanup EXIT
asset="x-ui-linux-${arch}.tar.gz"
echo "下载 ${REPOSITORY} / ${version} / ${arch}"
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "${base}/${asset}" -o "$stage/$asset"
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "${base}/SHA256SUMS" -o "$stage/SHA256SUMS"
(cd "$stage"; grep -E "^[a-f0-9]{64}  ${asset//./\.}$" SHA256SUMS > selected.sha256; [[ $(wc -l < selected.sha256) == 1 ]]; sha256sum -c selected.sha256)
tar -xzf "$stage/$asset" -C "$stage"
for file in x-ui x-ui.sh x-ui.service "bin/xray-linux-${arch}"; do [[ -f "$stage/x-ui/$file" ]] || { echo "发行包缺少 $file"; exit 1; }; done
chmod 755 "$stage/x-ui/x-ui" "$stage/x-ui/x-ui.sh" "$stage/x-ui/bin/xray-linux-${arch}"
"$stage/x-ui/x-ui" -v
"$stage/x-ui/bin/xray-linux-${arch}" version
backup="/var/backups/x-ui/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$backup"
systemctl stop x-ui || true
[[ ! -d /usr/local/x-ui ]] || cp -a /usr/local/x-ui "$backup/app"
[[ ! -d /etc/x-ui ]] || cp -a /etc/x-ui "$backup/db"
[[ ! -f /etc/systemd/system/x-ui.service ]] || cp -a /etc/systemd/system/x-ui.service "$backup/service"
[[ ! -f /usr/bin/x-ui ]] || cp -a /usr/bin/x-ui "$backup/command"
changed=1
if [[ -d /usr/local/x-ui ]]; then
  # Preserve user files (for example certificates placed below the app directory).
  cp -a "$stage/x-ui/." /usr/local/x-ui/
else
  mv "$stage/x-ui" /usr/local/x-ui
fi
install -m 644 /usr/local/x-ui/x-ui.service /etc/systemd/system/x-ui.service
install -m 755 /usr/local/x-ui/x-ui.sh /usr/bin/x-ui
if [[ ! -f /etc/x-ui/x-ui.db ]]; then
  username="admin_$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
  password=$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')
  (cd /usr/local/x-ui; ./x-ui setting -username "$username" -password "$password" -port 54321)
  printf '首次安装账号：%s\n首次安装密码：%s\n面板端口：54321\n' "$username" "$password"
fi
systemctl daemon-reload
systemctl enable x-ui
systemctl restart x-ui
sleep 3
systemctl is-active --quiet x-ui
changed=0
echo "安装完成。升级前备份：$backup"
echo '使用 x-ui 管理服务。旧账号、端口、入站和流量记录保持不变。'
echo '若旧入站包含已移除的 XTLS/HTTP/QUIC，请登录面板迁移；核心启动信息可在面板首页查看。'
