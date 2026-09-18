## 本地验证

- PR #60：`pnpm test`、`pnpm build` 通过。使用真实 TopBar 组件和生产 CSS 在 Chromium 验证 390px / 1280px、侧栏展开 / 折叠、中英文和 reduced-motion，共 8 种组合。原 PR 在窄窗口或折叠状态溢出 8px，修复后全部包含于导航区域。
- PR #61：WSL/Clang 与 Windows/MSVC 分别编译并通过 8 项 `MacosBundleLayout`、`MacosBundleInstallPath`、`DesktopRestart` 测试。
- 对 Git index 的完整快照运行 9 项安装器发布测试、4 项便携包测试、发布 Shell 契约检查和新增脚本语法检查，全部通过。Windows 的 `core.autocrlf` 会将归档转为 CRLF；验证快照使用 `git -c core.autocrlf=false archive` 保持 Git 中的 LF。
- OpenSpec 严格验证与 `git diff --check` 通过。

## 远端原生验证

- 代码提交 `ee7fe02d5d8967559c94342eee5804fd61ef624a` 的 [PR 检查](https://github.com/tmoonlight/acecode/actions/runs/35357925376) 中，`macos-installer-tests` 与 `web-tests (linux-x64)` 已通过。
- 原生 Swift 19 项测试全部通过；x86_64 / arm64 UI 均编译通过；真实测试应用包的个人/系统安装页面启动并生成有效 PNG。
- macOS 上的 9 项安装器发布测试、4 项便携包测试及发布 Shell 契约检查也全部通过。

## 验证范围

以上为合并前验证，没有调用生产证书或 Apple 公证服务。真实签名安装、下载隔离、非管理员干净机器及 macOS 11 运行验收按照发布文档执行。

## 合并结果

- PR #60 合并提交为 `658ee8343ccd5e42906c37a9d3195e2062c3380e`。
- PR #61 已修复并合并，GitHub 合并提交为 `ee7fe02d5d8967559c94342eee5804fd61ef624a`。
- 用户明确要求全部合并后统一编译，再查看 macOS PKG。已在 macOS/Web CI 和双平台定向 C++ 测试通过后合并，Linux 全量 CI 当时仍在运行。
- 合并后本地 `master` 与远端相同，开放 PR 为 0；后续使用合并后的 `master` 手动构建 macOS PKG/DMG。

## 真实打包修复

- 首次合并后手动构建为 [Package 35358898470](https://github.com/tmoonlight/acecode/actions/runs/35358898470)，源提交 `5b4b322d701c1a13514dd77ea2b89a58048ca0f2`。
- arm64 应用和图形安装器已通过真实签名、公证及 Gatekeeper 验证，但 `hdiutil create` 返回 `Resource busy`。原顺序导致该错误阻断后续 PKG 生成。
- 修改为最多三次独立路径尝试，仅重试 `Resource busy`；明确使用 HFS+。PKG 在 DMG 前完成创建、公证、验证和上传，保留失败时的已验证安装包。
- 修复后完整 Git index 快照上的 12 项安装器发布测试、4 项便携包测试、Shell 契约与语法检查全部通过；OpenSpec 严格验证及 `git diff --cached --check` 通过。
