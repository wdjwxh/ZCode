# 自建 Web 工作台使用说明

此分支以 ZCode 3.14.0 为基础，提供两种入口：独立 Web 服务和 Windows Desktop 的局域网手机连接。独立 Web 服务使用自己的工作区会话；局域网手机连接会附加到桌面窗口现有 Host，访问同一工作区的已有任务。

## 已关闭的出口

- 数仓事件、ARMS RUM、Agent 与桌面 OTLP 出口硬关闭，运行时变量不能重新启用。
- 内置 Provider 目录为空，启动时不向官方服务刷新目录。首次使用需在设置中添加个人模型 Provider 和模型。
- Web 帮助配置只读本地资源，Web 的官方 OAuth/会话分享入口禁用，反馈与社群按钮不打开官方页面。
- Host API 出口拒绝 `zcode.z.ai` 及其子域，以及 `cdn-zcode.z.ai`。
- Desktop 自建版禁用官方自动更新和最低版本强制升级检查。

用户自行配置的模型 API、MCP、网页搜索、浏览器访问与工具执行仍可联网。自建 Web 服务的手机连接也需要网络。需要强制限定全部出站目标时，应在运行主机和反向代理上设置网络白名单，并验证实际流量。

## 构建

fork 的 GitHub Actions 中运行 `Build Windows x64 self-hosted ZCode`，可在 Actions 页面手动启动。它在 GitHub 的 Windows x64 机器上编译 Web 运行包和 Desktop 安装包，并在该次运行的 Artifacts 中提供下载。两种包不能互相替代：Web 运行包启动独立服务；手机接入电脑当前会话要安装 Desktop 包。

## 手机访问 Desktop 当前工作区

在 Windows 电脑上安装并启动当前 Actions 生成的 Desktop 包，打开目标工作区。点击菜单 **文件 → 复制手机访问链接**；同一窗口有多个工作区时选择目标。将已复制的链接发送到同一局域网的手机，在手机浏览器打开。手机显示该桌面窗口所选工作区的任务列表，选择已有任务即可继续。电脑必须保持 ZCode 运行；关闭目标窗口后链接失效。Windows 防火墙如提示允许访问，请允许当前局域网。

链接含随机访问令牌，持有链接的人可以操作该工作区。首次打开后浏览器将令牌存为仅供该站点使用的 cookie，并从地址栏去掉令牌。不要把链接发到公开场所。若电脑有多个网络接口，而自动选出的 IP 不是手机可达地址，可把链接里的 IP 改为电脑在同一局域网的 IP，端口和令牌保持不变。

使用 Node.js 24.14.0 和 pnpm 10.33.2：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
node scripts/verify-privacy-selfhost.mjs
pnpm --filter @zcode/cli... build
pnpm --filter @zcode/server build
pnpm --filter @zcode/web build
node scripts/build-zcode.mjs --skip-build --base-url https://your-own-download-host.invalid/zcode/
```

`--base-url` 只用于生成安装脚本和版本索引。直接解压使用不需要下载主机。

## 运行

解压 `dist/zcode/releases/<version>/zcode-<version>.tar.gz`，在包含 `zcode/` 的目录执行：

```sh
node zcode/bin/zcode.mjs --web --workspace /path/to/project --host 0.0.0.0 --port 3030 --no-open
```

非本机监听时，服务默认生成访问令牌；不要把带令牌的 URL 写进日志、聊天或公开仓库。外网访问请经自己的 VPN 或启用 TLS 的反向代理。仅运行本机回环地址时可省略 `--host`。

源码更新后重做本说明的检查，并用网络监测核查新增出口。当前分支没有更改 DGX 集群上的任何服务。
