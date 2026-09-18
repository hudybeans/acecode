## Why

下个版本需要为用户关闭一次沙盒，同时尊重用户之后主动重新启用的选择。仅修改默认值无法覆盖旧配置中的显式开启值，每次启动强制关闭则会覆盖用户后续选择。

## What Changes

- 首次运行包含本变更的版本时，为当前用户配置关闭沙盒，并持久化固定的一次性迁移标记。
- 已完成迁移后，正常启动、保存其他设置及后续升级均保留用户选择。
- 保留其他沙盒策略、权限模式以及原配置中的其他字段。

## Capabilities

### New Capabilities

- `sandbox-once-migration`：一次性关闭沙盒及后续用户选择的持久化保护。

### Modified Capabilities

无。

## Impact

涉及共享启动配置入口、配置读写及已有配置变更锁，覆盖 Desktop、TUI、daemon 和 headless。增加配置回归测试并更新 `docs/sandbox.md`；不修改 UI、权限模式、版本号或发布流程。
