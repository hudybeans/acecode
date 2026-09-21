# 正式发布产物约定

`.github/workflows/package.yml` 的 `v*` 标签构建必须生成下列 18 个用户下载包。发布任务通过 `scripts/verify_release_assets.py` 检查每个文件只有一个非空副本，并拒绝不属于当前版本的包、未签名包或重名文件；检查失败时不创建 GitHub Release。

| 平台 | 架构 | 必需文件 |
| --- | --- | --- |
| Windows | x64、arm64 | `acecode-windows-<arch>.zip` |
| Linux | x64、arm64、armv7 | `acecode-linux-<arch>.tar.gz` |
| Linux old | x64、arm64、armv7 | `acecode-linux-old-<arch>.tar.gz` |
| Linux 自动更新 | x64、arm64 | `acecode-<version>-linux-<arch>-update.zip` |
| macOS | x64、arm64 | `acecode-macos-<arch>.tar.gz` |
| macOS 安装器 | x64、arm64 | `ACECode-<version>-macos-<arch>.dmg` 和 `.pkg` |
| macOS 自动更新 | x64、arm64 | `ACECode-<version>-macos-<arch>-update.zip` |

Linux old 构建是发布任务的必需依赖，不能因已有新版 Linux 包而跳过。macOS 正式发布同时要求 Developer ID Application、Developer ID Installer 证书及公证凭据；安装器证书或密码缺失必须失败，不允许发布没有 PKG 的正式版。手动触发的开发构建仍可在缺少签名凭据时生成非正式产物，不创建 Release。

调试符号使用 `dev_only.` 文件名前缀；避免方括号等会被 GitHub 改写的字符，使 `SHA256SUMS.txt` 中的文件名与下载名一致。

完整正式版同步到 aupdate 时，验证六类更新 ZIP 和两个 PKG 的版本、大小、哈希及公网下载。Linux 更新 ZIP 使用 `linux-x64-updater-v1`、`linux-arm64-updater-v1` manifest target。PKG 是独立手动下载项，不写入自动更新 manifest。

本地可运行 `python tests/scripts/verify_release_assets_test.py` 验证缺包、空包、重复包和错误版本的阻断逻辑；macOS CI 另验证签名、公证、安装器布局与打包脚本。
