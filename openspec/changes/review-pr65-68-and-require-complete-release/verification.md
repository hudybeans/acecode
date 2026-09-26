# 审核与发布验收

2026-09-22（Asia/Taipei）完成 [v0.9.24 正式发布](https://github.com/tmoonlight/acecode/releases/tag/v0.9.24)。发布提交为 `cf08d10b616b8309e1fb678be53c7eae265c43f6`。

## PR 审核及修复

| PR / 范围 | 已修复问题 |
| --- | --- |
| [#65](https://github.com/tmoonlight/acecode/pull/65) 侧栏 | 工作区键盘激活与鼠标点击不一致；新手引导依赖已删除的新增工作区按钮导致无法启动。 |
| [#66](https://github.com/tmoonlight/acecode/pull/66) macOS 安装与拖放 | 原生拖放命中一个输入框却投递到全局最后注册者；改为按 DOM 元素登记接收者并正确注销，拒绝无效坐标。 |
| [#67](https://github.com/tmoonlight/acecode/pull/67) 开发启动与实例隔离 | Windows 64 位进程句柄类型、访问拒绝误判进程退出、无效 PID/端口、链接目录清理和并发实例共享 owner 目录；保留原有文件发布前设置私有 ACL 的路径。 |
| [#68](https://github.com/tmoonlight/acecode/pull/68) 回合用量 | 消费者回调抛错后终止事件漏记已经计量的 token；在实际计量边界累加，继续排除失败重试的临时用量。 |
| 嵌入前端 | 同名 Vite 资源内容更新后 CMake 可能不重建嵌入字节，已添加实际文件内容依赖及真实 CMake/Ninja 回归验证。 |
| Linux Desktop | X11 的 `Status`、`Success` 宏改写剪贴板状态枚举，已在平台头文件边界清理，并将 Desktop 编译加入普通 Linux CI。 |

原有未提交的系统提示、图标和输入区改动先独立提交并验证，再合入四个 PR。保留并审核同期合入的中断后暂停排队消息功能。四个 PR 均已合并，验收时开放 PR 为零。

## 验证证据

- [发布提交的测试流水线](https://github.com/tmoonlight/acecode/actions/runs/35641170501) 全部成功：完整 Web 测试及构建、macOS 原生安装器与脚本测试、Linux CLI/Desktop 编译、4,705 项 C++ 测试全部通过。
- 本地完整 `pnpm test`、`pnpm build`，527 项定向 Windows 原生测试，97 项开发脚本测试、5 项发布资产测试、PKG 凭据组合与打包脚本验证通过；最终 MinSizeRel CLI/Desktop 构建确认版本为 `0.9.24`。
- 浏览器验证涵盖系统提示中英、明暗主题、窄宽窗口、独立默认折叠、完整详情与复制；侧栏鼠标/键盘激活；两个真实 InputBar 的原生文件投递与注销。
- [全平台打包流水线](https://github.com/tmoonlight/acecode/actions/runs/35641530020) 全部必需任务成功。第一次尝试被取消，复用已完成任务重试成功；未改动标签。
- GitHub 共 37 个发布资产：18 个必需下载包、18 个调试符号包及 `SHA256SUMS.txt`。36 个文件的 GitHub 内容哈希全部匹配校验和清单，文件名无改写或重名。
- 三个 Linux old 包均存在；Intel 与 Apple Silicon 两个 PKG 均经过 macOS CI 签名、公证及安装器验证。
- `publish_acecode_release.ps1` 正常退出，六类更新 ZIP 和两个 PKG 均完成内容、版本、权限、大小和哈希检查，版本文件、固定别名与校验和文件的公网 MIME、大小和 SHA256 检查全部通过。
- Agent Browser 集成在 Desktop 中；更新 ZIP 未包含旧的独立 browser host/extension 产物。未在本机重新安装用户正在使用的桌面程序；平台安装器验证以对应 CI 为准。

## 历史缺包原因与约束

历史 [v0.8.14](https://github.com/tmoonlight/acecode/releases/tag/v0.8.14)、[v0.8.15](https://github.com/tmoonlight/acecode/releases/tag/v0.8.15) 的发布说明明确仅发布 macOS，Windows/Linux 继续使用 v0.8.13，当时也尚未引入 PKG。后续 `Allow releases without macOS PKG` 改动允许没有 Installer 凭据时跳过 PKG，并接受零个或两个 PKG。

现在正式标签必须具备安装器签名凭据；最终清单强制要求 18 个非空、唯一且版本匹配的下载文件，包括三个 Linux old 和两个签名 PKG，缺少任何一个都不创建 Release。发布还必须等待同一提交的 master 测试全部通过。具体约定见 `docs/release-artifacts.md`。

本轮 v0.9.23 标签打包发现 Linux 编译问题后没有创建 GitHub Release；标签保留不变，修复后顺延 v0.9.24。v0.9.24 完整镜像成功后，仅移除本轮创建的 v0.9.23 Windows 临时 manifest 记录，保留其余 104 条记录，未删除已上传文件。原始 manifest 已在工作区外备份，公网 manifest 与修改后文件一致。

## 更新镜像文件

目录：`J:\jenkins_green\aupdate`。公网根地址：`http://2017studio.imwork.net:82/aupdate/`。PKG 保持独立手动安装包，不进入自动更新 manifest；Linux 自动更新 target 为 `linux-x64-updater-v1`、`linux-arm64-updater-v1`。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| `acecode-0.9.24-windows-x64.zip` | 18330394 | `70758991161c30f6d854e6183960e3e96e2dc2620a155099eabaa3a67b550cf9` |
| `acecode-0.9.24-windows-arm64.zip` | 18200393 | `570af4e50a7537fd1c3aff7d388491abd761cf516f999931e81c795e4ea42e6a` |
| `ACECode-0.9.24-macos-x64-update.zip` | 39837808 | `5327f649e283e4b5672673e2dd34feadafabd2ea527553d3e1aa7125acc6cda3` |
| `ACECode-0.9.24-macos-arm64-update.zip` | 39326378 | `3ee2a0f3e0f1ea81f0fa583baf9bd665b90b7803f6efa84488b7cb3be83046c6` |
| `acecode-0.9.24-linux-x64-update.zip` | 21562197 | `10f59292b8a5901832d8884409f32a1415114b6df5a74b9748c2b9677a7f0943` |
| `acecode-0.9.24-linux-arm64-update.zip` | 22072379 | `ff382e9df077514c7978dd93a0a6edb90da705bd1f15cc52df661b22f27f5d8a` |
| `ACECode-0.9.24-macos-x64.pkg` | 21726095 | `a46a05fbe18d2c0bdcde8124edc673deeb3ef927fa7050caa863c4918ad78b4f` |
| `ACECode-0.9.24-macos-arm64.pkg` | 21557247 | `ed0ea846dbeda7b3fbea4691c641d8d61c08a7497432d63c8ffdaf77183bc297` |

当前公网 manifest 最新版本为 `0.9.24`，六个 updater target 齐全。清理失败记录后 manifest SHA256 为 `24b118c8bc29143459d72c87c4c2073d28668a81a5b3fc92bce4ea6776599937`。
