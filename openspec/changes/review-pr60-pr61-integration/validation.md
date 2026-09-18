## 本地验证

- PR #60：`pnpm test`、`pnpm build` 通过。使用真实 TopBar 组件和生产 CSS 在 Chromium 验证 390px / 1280px、侧栏展开 / 折叠、中英文和 reduced-motion，共 8 种组合。原 PR 在窄窗口或折叠状态溢出 8px，修复后全部包含于导航区域。
- PR #61：WSL 中编译并通过 8 项 `MacosBundleLayout`、`MacosBundleInstallPath`、`DesktopRestart` 测试。
- 对 Git index 的完整快照运行 9 项安装器发布测试、4 项便携包测试、发布 Shell 契约检查和新增脚本语法检查，全部通过。Windows 的 `core.autocrlf` 会将归档转为 CRLF；验证快照使用 `git -c core.autocrlf=false archive` 保持 Git 中的 LF。
- OpenSpec 严格验证与 `git diff --check` 通过。

## 远端原生验证

新增 `macos-installer-tests` PR 检查，用于原生 Swift 故障/锁测试、两个架构的 UI 编译及离线发布测试。结果将在完成后记录。

## 验证范围

没有调用生产证书或 Apple 公证服务，也没有构建发布包。真实签名安装、下载隔离、非管理员干净机器及 macOS 11 运行验收继续按照发布文档执行。
