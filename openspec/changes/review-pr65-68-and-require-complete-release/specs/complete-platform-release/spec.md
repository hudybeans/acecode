## ADDED Requirements

### Requirement: 正式发布必须包含全部受支持平台产物
正式发布流程 SHALL 在创建 GitHub Release 前验证固定的必需文件集合，其中包括 linux-old-x64、linux-old-arm64、linux-old-armv7 归档，以及 macOS x64 和 arm64 PKG；任一文件缺失、为空或存在重名副本时 SHALL 失败。

#### Scenario: 缺少任一 Linux old 或 macOS PKG
- **WHEN** 正式标签的构建产物缺少任一必需文件
- **THEN** 发布任务失败且不创建不完整的 Release

#### Scenario: 所有必需产物完整
- **WHEN** 每个预期文件均只有一个非空副本且版本匹配
- **THEN** 发布流程生成校验和并提供全部下载

### Requirement: PKG 签名凭据不得隐式跳过正式安装包
正式标签构建 SHALL 要求 macOS 应用与安装器签名凭据完整，缺失时明确失败；不得将缺少安装器凭据解释为成功跳过 PKG。

#### Scenario: 未配置安装器证书
- **WHEN** 正式标签构建没有安装器签名证书或密码
- **THEN** 打包任务明确失败并指出缺失的配置名称
