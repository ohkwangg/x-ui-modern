# x-ui-modern

**本项目基于 [vaxilu/x-ui](https://github.com/vaxilu/x-ui) 开发**，使用 [XTLS/Xray-core](https://github.com/XTLS/Xray-core) 作为代理核心。保留原 x-ui 的面板整体布局、入站列表、流量统计、到期管理和管理命令，主要更新入站配置选项及兼容性。

这是 `ohkwangg` 维护的独立衍生项目，并非 vaxilu 或 XTLS 官方面板。保留上游 Git 历史和 GPL-3.0 许可证。Xray 使用其自己的 MPL-2.0 许可证，发行包内附核心许可证。

## 安装与升级

支持使用 systemd 的 Linux：amd64、arm64、s390x。建议使用仍受维护的 Debian、Ubuntu 或同类发行版。以 root 执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ohkwangg/x-ui-modern/main/install.sh)
```

安装指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/ohkwangg/x-ui-modern/main/install.sh -o /tmp/x-ui-modern-install.sh
bash /tmp/x-ui-modern-install.sh v1.0.0
```

安装包来自 [本仓库 Releases](https://github.com/ohkwangg/x-ui-modern/releases)，脚本验证 SHA-256 后安装。首次安装自动生成随机管理员账号和密码并在终端显示，默认面板端口为 `54321`；请保管终端显示的凭据。升级保留 `/etc/x-ui/x-ui.db` 中的账号、面板设置、入站及流量数据，停止服务后备份至 `/var/backups/x-ui/日期-进程号/`。下载失败不会先停掉原服务，安装阶段失败会尝试恢复备份。

访问 `http://服务器IP:面板端口/`。可在原“面板设置”里配置 HTTPS。`x-ui` 打开原管理菜单，`x-ui update` 更新到本仓库版本。

## 协议与传输

首版固定搭配 **Xray v26.3.27**（Go API 模块 `v1.260327.0`）。支持该发行版在 `infra/conf/xray.go` 中注册的全部 **入站** 协议名称：

| 入站协议 | 用途与必要条件 |
| --- | --- |
| VMess | UUID 认证的加密代理，现代客户端使用 alterId=0 |
| VLESS | UUID 认证，支持 TLS / REALITY、Vision 和高级 VLESS Encryption 配置 |
| Trojan | 密码认证，通常配合 TLS |
| Shadowsocks | AEAD 与 Shadowsocks 2022，2022 需要规定长度的 Base64 密钥 |
| SOCKS | 应用代理，支持认证和 UDP |
| HTTP | HTTP CONNECT 正向代理 |
| mixed | 同端口兼容 SOCKS 和 HTTP |
| dokodemo-door / tunnel | 固定目标转发、透明代理；两个名称对应同一实现 |
| WireGuard | UDP 隧道，需要服务端私钥和客户端公钥 |
| hysteria | Hysteria 2，协议名为 `hysteria`，搭配 version=2、Hysteria 传输与 TLS |
| TUN | 系统虚拟网卡，不占用监听端口，需要系统支持及网卡管理权限 |

传输选项包含 raw/TCP、XHTTP、mKCP、WebSocket、HTTPUpgrade、gRPC、Hysteria，保留核心接受的别名。安全选项为 none、TLS、REALITY。协议和传输不能任意组合，保存前由实际安装的核心解析校验。

`freedom/direct`、`blackhole/block`、DNS、loopback 等仅出站协议不会出现在入站下拉框；仍可在原“面板设置 → Xray 配置模板”中配置出站、路由、DNS 和策略。本次未改变该页面的布局。

## 入站选项说明

- 所有新增字段旁边的问号都提供中文功能解释，基本字段也有悬停说明。
- VMess / VLESS / Trojan / Hysteria 用户支持直接添加、删除与编辑，账号密码不要求手写 JSON。
- WireGuard / REALITY 支持生成新密钥对；私钥留在服务器，公钥提供给客户端。更换密钥后须同步更新客户端。
- 协议、传输、安全层和嗅探配置支持高级 JSON，可填写 UI 未单列的选项，例如多用户扩展、fallbacks、sockopt、finalmask、XHTTP extra、VLESS Encryption。
- 高级 JSON 必须点击“应用 JSON”后才能保存。编辑、重置流量和切换启用状态不会丢弃未知字段。
- 保存失败保留弹窗和输入，并显示错误。后端调用已安装核心的 `xray convert pb` 解析配置；此方式不会像 `run -test` 一样在检查 TUN 时创建虚拟网卡。校验成功表示配置能够被核心解析，不能替代证书有效性、远端可达性、系统权限与客户端互通检查。
- TUN 可创建多个入站，每个网卡名称应唯一；不会用虚假的 TCP 端口占位。默认不添加自动系统路由。
- 常见 VMess、VLESS、Trojan、单用户 Shadowsocks 和 Hysteria 2 配置支持链接/二维码；REALITY 链接自动带上由私钥推导的公钥。链接默认对应第一个用户。没有通用 URI 或需要额外客户端参数的配置（如 WireGuard、TUN、多用户 SS2022、VLESS Encryption）请按实际客户端格式配置，不生成不完整链接。

字段完整语义以 [Xray 官方文档](https://xtls.github.io/config/) 和相应版本源码为准。未来核心新增字段可通过高级 JSON 保留和传递；未来新增协议名称需要更新面板，不能承诺自动支持尚未出现的协议。

## 旧版升级注意

旧 XTLS（`security: xtls`、`xtls-rprx-direct/origin`）、旧 HTTP/H2 传输和旧 QUIC 传输已被新版核心移除。升级不会擅自改变客户端协议或替换密钥：请在入站编辑中迁移到 TLS/REALITY + Vision 或 XHTTP，并同步客户端。旧配置仍保留以便修改；未启用的旧入站可先保存，启用时再执行核心校验。

遇到问题可停止服务，从安装脚本打印的备份目录恢复 `app` 到 `/usr/local/x-ui`、`db` 到 `/etc/x-ui`、`service` 到 `/etc/systemd/system/x-ui.service`、`command` 到 `/usr/bin/x-ui`，然后执行 `systemctl daemon-reload && systemctl start x-ui`。恢复数据库会回到备份时的数据状态。

## 构建与测试

```bash
go test ./...
XRAY_BINARY=/path/to/xray node --test tests/*.test.cjs
bash scripts/package.sh amd64
```

构建使用 Go 1.27.1 和纯 Go SQLite 驱动，不依赖交叉 C 编译器。`scripts/package.sh` 下载固定版 Xray 并打包其核心、geoip/geosite 数据和许可证。GitHub Actions 对每次提交运行测试，生成三种 Linux 架构安装包；推送 `v*` 标签，或在 Actions 手动运行并填写版本号，会发布带 `SHA256SUMS` 的 Release。

回归测试覆盖全部入站配置、传输选项、REALITY + Vision、Shadowsocks 2022、未知字段往返保留、无效输入拒绝和旧 SQLite UNIQUE 端口约束迁移。TUN 使用核心配置解析验证，不在测试机器创建实际网卡；生产 TUN 路由、外网连通性以及不同客户端互通需按部署环境验证。

Windows 本地调试可通过 `XUI_DB_PATH` 指向隔离数据库，并在运行目录的 `bin/xray-windows-amd64.exe` 放置核心。正式一键安装目标为 Linux。

## 致谢与许可证

- 原始面板：[vaxilu/x-ui](https://github.com/vaxilu/x-ui)
- 代理核心：[XTLS/Xray-core](https://github.com/XTLS/Xray-core)
- 所有上游贡献者与依赖项目作者

面板源代码遵循 [GPL-3.0](LICENSE)。发布和分发修改版本时请保留许可证、原作者归属及对应源代码。
