# 局域网手机接入桌面当前工作区

## 产品规则

- Windows Desktop 的“文件 → 复制手机访问链接”按当前窗口和所选工作区生成临时链接。同一窗口有多个工作区时先让用户选择。手机与电脑处于同一局域网时，在浏览器打开该链接。
- 手机连接的是该窗口现有 Host 的 local attachment，`clientMode=web-remote-replayable`；不创建第二个 Agent、数据库或工作区服务。手机看到同一工作区的任务列表，可以选择并继续已有会话。
- 链接由随机令牌保护。HTTP 首次访问将令牌放入 HttpOnly cookie 并跳转到无令牌地址；所有后续静态资源、服务信息和 WebSocket 都要校验 cookie。窗口关闭即撤销该窗口链接并断开手机连接；桌面退出关闭监听。
- 用户自行配置的模型 API 仍可联网；桥接服务只在本机监听局域网端口，不连接 ZCode 官方服务。

## 所有者与顺序

Desktop Main 独占局域网 HTTP 监听、令牌与 windowId 映射。Window Host 独占会话状态。Web 客户端仅持有连接和界面投影。

```text
桌面菜单 → Main 启动 LAN listener / 发令牌 → 手机 GET 链接 → cookie 鉴权
→ WebSocket → Main 为目标窗口建立 MessagePort → 该窗口 Host 附加 replayable client
→ Host 通过同一任务服务处理手机命令 → Desktop/Web 各自刷新投影
```

窗口或所选工作区关闭、以及 WebSocket 断开时，Main 关闭对应 MessagePort。Host attachment registry 负责释放连接；已接受的任务继续由 Host/CLI 管理。

## 验收

在同一 Windows 主机上打开桌面工作区，复制链接到手机浏览器，确认任务列表与桌面一致；从手机继续已有任务，桌面可观察同一任务更新。无效/过期令牌的 HTTP 与 WebSocket 拒绝；关窗口后旧链接失效。Windows 安装包包含 Web 静态资源，Actions 产物可安装启动。
