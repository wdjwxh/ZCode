# 自建隐私版：遥测出口

## 产品规则

- 本分支只提供自建 Web 工作台作为手机入口。手机通过自有网络入口连接 Web 服务；桌面客户端与 Web 工作台的会话不自动合并。
- 数仓事件、ARMS RUM、Agent OTLP trace/metric、桌面 renderer action trace 与本地 TTFT OTLP 均不得向远端发送，即使运行环境提供了相应 endpoint 和认证头。
- 用户主动配置的模型 API、Web 服务连接及其认证属于产品功能，不由遥测开关拦截。
- 内置 Provider 只提供空壳，用户自行添加模型 API。启动时不得从 ZCode 服务刷新内置 Provider 目录；Web 帮助配置只读打包资源。

## 所有权与边界

- `packages/shared/src/env.ts` 拥有桌面及服务层的遥测总开关与数仓、ARMS 地址。
- Agent CLI 在 `apps/zcode-cli/packages/telemetry/src/bootstrap.ts` 的准备边界拒绝创建 OTLP owner。
- 桌面独立的 OTLP exporter 在各自工厂入口拒绝创建网络 exporter。已有本地测量对象可保留，但不装配远端 reader。
- Provider Registry 的远端内置配置源不装配；本地内置配置作为唯一基础。Web 帮助配置从本地资源读取。
- Host 的 ZCode 控制面 HTTP 出口拒绝官方 ZCode 域名。用户自配模型端点由模型 Provider 出口处理，不在控制面放行。
- 不引入遥测开关的运行时覆盖；升级上游代码时应重新核查新增出口。

## 验收

1. 即使设置全部遥测 endpoint，出口仍为禁用状态。
2. 类型检查、lint、架构检查与 Web/CLI 构建通过。
3. Web 服务可在自有地址上由手机浏览器访问；真正的外网访问由部署层提供 TLS、访问控制和网络连接。
4. 官方控制面域名在 Host API 出口被拒绝，不能因存量账号/分享操作意外请求。

## 后续网络审计边界

登录、官方模型网关、提供商目录、帮助配置、自动更新、分享、插件市场与用户触发的工具请求并非遥测。自建运行前需单独审计和配置这些功能；不得将“遥测关闭”等同于“全部外网连接关闭”。
# 桌面版官方更新

自建版启动时不初始化官方自动更新，也不执行后台或手动检查；同时跳过官方最低版本强制升级查询。更新由使用者从自己的构建产物安装。禁用自动更新应通过现有 `initAutoUpdater({ enabled: false })`，让菜单及手动检查共同遵守该状态。
