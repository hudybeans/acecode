## Why

从下个版本起，取消首次启动时自动下载并切换到国庆节主题的行为，让常规默认外观和已保存的用户选择直接生效。

## What Changes

- Web/Desktop 认证后只恢复已保存的外观，不再发起国庆节主题首次启动流程。
- 新配置继续使用蓝色及跟随系统的明暗模式；已有配置保留当前主题，包括已保存的国庆节主题。
- 国庆节主题仍可在外观设置中手动下载和选择。

## Capabilities

### New Capabilities

- `startup-theme-policy`: 规定新版本启动时保留默认或已保存主题，不自动应用节日主题。

### Modified Capabilities

无。此前 `add-national-day-builtin-theme` 的首次自动应用要求尚未归档到主规范，本变更替代其客户端启动行为。

## Impact

影响 `web/src/App.jsx` 的外观恢复入口、相关回归检查和主题文档。保留既有主题资源、下载控制器与 daemon 兼容接口，不涉及发布或用户配置迁移。
