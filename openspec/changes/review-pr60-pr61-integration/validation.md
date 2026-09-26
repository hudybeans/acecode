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

## 合并后 macOS 成品

- [Package 35360448058](https://github.com/tmoonlight/acecode/actions/runs/35360448058) 使用源提交 `288133c760641e09373932db3cceacadd4693be6`，`macos-arm64` 和 `macos-x64` 两个任务均成功。
- 两个架构的应用、PKG 和图形安装器 DMG 均通过真实签名、Apple 公证、stapler 验证及 Gatekeeper。PKG 在 DMG 前上传；本次两个 DMG 均一次创建成功。
- 成品沿用项目当前版本号 `0.9.20`。本次为合并后手动工作流产物，不创建正式发布或版本标签。
- 下载入口：Apple Silicon [PKG](https://github.com/tmoonlight/acecode/actions/runs/35360448058/artifacts/10555280101) / [DMG](https://github.com/tmoonlight/acecode/actions/runs/35360448058/artifacts/10554925344)；Intel [PKG](https://github.com/tmoonlight/acecode/actions/runs/35360448058/artifacts/10554870943) / [DMG](https://github.com/tmoonlight/acecode/actions/runs/35360448058/artifacts/10554671189)。入口下载 ZIP，解压后使用对应安装文件。
- [对应源提交的检查](https://github.com/tmoonlight/acecode/actions/runs/35360445942) 中，Web 检查和原生安装器检查已通过；后者包含 19 项 Swift 测试、双架构 UI 编译、个人/系统窗口启动、12 项发布脚本测试、4 项便携包测试及 Shell 契约检查。
- 干净 Mac 上的交互安装效果需实际打开安装包验收；CI 的签名、公证、包结构及窗口启动检查不等同于该验收。
- 四份下载归档均通过 ZIP 完整性检查，SHA-256 与 GitHub artifact 的 `digest` 完全相同。直接解读两个 PKG 的 XAR 目录和 Distribution XML，确认分别为 `arm64` / `x86_64`、只允许 `CurrentUserHomeDirectory`、禁止系统及任意卷安装，并声明替换前必须关闭 ACECode。
- PKG 文件 SHA-256：arm64 为 `5ab5b7ba507c465024b717383e9c2d6148b0d182d2d43cc0c7545659d840be42`；x64 为 `2d3ebda53676f7b6eade62121805958ddf337d8feed598c54e7f4f384dd3c8b4`。成品保存于忽略目录 `build/review-pr60-pr61/artifacts-288133c7/`。
- 整个打包工作流成功，各平台构建均通过。源提交的完整检查也全部成功：Web、macOS 原生安装器及 Linux 全量 C++ `ctest` 均通过。
