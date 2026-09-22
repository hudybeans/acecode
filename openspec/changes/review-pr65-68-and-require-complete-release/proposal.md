## Why

待合入的 PR #65–#68 涉及侧栏、macOS 安装与拖放、开发启动器和回合用量统计，需要在当前主分支及已完成的本地界面改动上统一审核和验证。现有发布流程允许缺少 macOS PKG 时成功发布，对 Linux old 等产物也缺少统一的完整性检查，无法保证每次正式版都提供全部平台下载。

## What Changes

- 审核并合入四个 PR，修复真实执行路径中的问题，保留已有系统提示和输入区改动。
- 为正式发布定义完整的必需产物集合，包括三个 Linux old 架构和两个 macOS PKG；缺失、空文件或重名时禁止发布。
- 在打包前明确校验签名凭据，避免以成功状态跳过必需的 PKG。
- 补充与发现的问题对应的回归测试，运行前端、原生和打包检查，发布并验证 v0.9.23 及更新镜像。

## Capabilities

### New Capabilities
- `complete-platform-release`: 定义正式发布的完整产物和发布前验证要求。
- `reviewed-pr-integration`: 定义跨界面和运行时改动合入时必须保持的目标隔离、用量统计与既有交互契约。

### Modified Capabilities

## Impact

- `.github/workflows/package.yml`、发布校验脚本及其测试。
- PR #65–#68 涉及的 Web 侧栏、原生拖放、开发环境启动、桌面实例及 AgentLoop 用量路径。
- 当前主分支的版本文件、发行记录和 GitHub/aupdate 产物。
