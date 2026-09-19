# Tasks

## 1. Shared launcher

- [x] 1.1 Add the cross-platform Python launcher with interactive target selection, target parsing, and platform-specific CMake preset selection; verify its help output and target-validation behavior.
- [x] 1.2 Implement Git worktree build discovery and compatibility validation for source revision, executable, platform/architecture, and Desktop configuration; verify focused tests cover accepted and rejected candidates.
- [x] 1.3 Implement automatic incremental builds for verified configured builds, confirmation only for missing/incompatible configuration, and explicit non-interactive or declined-configuration failures; verify no configure command runs without confirmation.

## 2. Target startup and entry points

- [x] 2.1 Delegate Web and Desktop starts to the existing Python surface launchers after refreshing frontend assets, use an isolated Web runtime directory, and report launch outcomes; verify forwarded arguments with stub launchers.
- [x] 2.2 Start TUI from the verified executable in a new terminal window on supported platforms and report unsupported terminal-launch behavior; verify command construction with focused tests.
- [x] 2.3 Provide target-specific `dev_web`, `dev_desktop`, and `dev_tui` Windows/POSIX entry points that select a fixed target and forward supported arguments unchanged; verify syntax and `--help` delegation on available platforms.

## 3. Windows toolchain and verification

- [x] 3.1 Add a shared Windows Visual Studio developer-environment helper and invoke it from each target-specific batch entry point; verify a normal shell receives C++ compiler include paths.
- [x] 3.2 Make Windows target-specific entry points automatically approve a missing-build configuration, while preserving explicit confirmation for Python and POSIX callers; verify wrapper argument forwarding and focused launcher tests.
- [x] 3.3 Run Python compilation checks and `openspec validate add-development-environment-launcher --strict`.

## 4. 发布前审查修复

- [x] 4.1 保留现有构建类型，并让多配置构建、产物选择与实际启动使用同一配置；补充 Debug/Release 并存回归。
- [x] 4.2 完整传递 TUI 参数，Windows 直接创建新控制台以避免 shell 转义错误，macOS 显式设置工作目录；验证特殊字符参数与启动错误传播。
- [x] 4.3 正确识别 Windows MinGW 构建，按本机架构初始化 MSVC，仅需要 MSVC 时要求安装 Visual Studio。
- [x] 4.4 Web 重编译前有界核验既存 runtime 并明确失败；提供身份已验证实例的停止命令，身份不明时仅提示检查，不自动终止进程或删除状态文件。
- [x] 4.5 运行隔离 Python 回归、语法检查及 OpenSpec 严格验证，记录三平台实际验证边界。

验证记录（2026-09-20）：54 项 `dev_*test.py` 测试通过；9 个 Python 文件通过 Python 3.8 语法解析；3 个 POSIX 包装脚本通过 Bash 语法检查；两个 OpenSpec change 严格验证通过。Windows 实际验证 MSVC x64 环境初始化与包含空格、`&`、`%PATH%`、`!` 的辅助脚本路径。macOS/Linux 验证命令构造及参数保留，未启动图形界面；未运行 ARM64 原生构建。
