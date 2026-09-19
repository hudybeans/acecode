# Spec Delta

## Purpose

Provide a safe, consistent way to start ACECode development surfaces across supported platforms without manually locating compatible build artifacts.

## ADDED Requirements

### Requirement: Development target selection
The development-environment launcher SHALL start exactly one selected development target: Web, Desktop, or TUI. When no target is provided to an interactive launcher invocation, it SHALL prompt the developer to select one. A repository-local assistant skill SHALL ask the developer to select one of those targets when a request to run the development environment does not name a target.

#### Scenario: Interactive target selection
- **WHEN** a developer starts the launcher without a target in an interactive terminal
- **THEN** the launcher prompts for Web, Desktop, or TUI and starts only the selected target

#### Scenario: Skill target selection
- **WHEN** a developer asks the repository-local skill to run the development environment without naming a target
- **THEN** the skill asks whether to run Web, Desktop, or TUI before starting work

### Requirement: Compatible build reuse
Before requesting a new configuration, the launcher and skill SHALL search the current worktree for a compatible existing build. A build is reusable only when its configured source directory is the current worktree, its executable is runnable on the current platform and architecture, and it contains the executable required by the selected target. A Desktop target additionally requires a Desktop-enabled build and Desktop executable. Other registered worktrees MAY provide content-addressed compiler cache entries and verified frontend artifacts, but their path-bound build directories and executables SHALL NOT be used for the current worktree.

#### Scenario: Reuse a matching Web build
- **WHEN** the current worktree has a compatible configured `acecode` build
- **THEN** the launcher incrementally builds and starts the Web target with that build directory

#### Scenario: Reject an incompatible Desktop build
- **WHEN** a matching build lacks Desktop support or the Desktop executable
- **THEN** the launcher does not use it for the Desktop target

#### Scenario: 多配置构建保持产物一致
- **WHEN** 同一 CMake 构建包含 Debug、Release 等多个配置
- **THEN** 增量编译 SHALL 明确指定所选产物对应的配置，Web 与 Desktop SHALL 启动该产物，不能再次选择另一配置的旧程序

#### Scenario: 排除嵌套的独立构建
- **WHEN** 某个候选目录的子目录存在独立 CMakeCache.txt
- **THEN** 该子目录的产物 SHALL 按子目录自己的配置与源码路径验证，不能归入父级构建

### Requirement: Fresh incremental builds and configuration confirmation
Before starting a selected target from a compatible build directory, the launcher SHALL run that target's incremental CMake build so changed source files are incorporated. Before starting Web or Desktop, it SHALL also ensure the development frontend assets are current. When no compatible configured build exists, the launcher and skill SHALL report the missing requirement and the CMake preset selected for the current platform, then configure the development target with testing disabled so optional unit-test dependencies do not block startup. They SHALL obtain explicit developer confirmation before configuring a new build unless a Windows direct entry point supplies its automatic approval. A declined confirmation SHALL leave source and build files unchanged and SHALL not start a development target.

#### Scenario: Refresh a compatible build
- **WHEN** a compatible build exists and source files have changed
- **THEN** the launcher runs the selected target's incremental build before starting it

#### Scenario: Confirm a required configuration
- **WHEN** the selected target has no compatible build and the developer confirms the proposed configuration
- **THEN** the launcher configures and incrementally builds the required target before starting it

#### Scenario: Decline a required configuration
- **WHEN** the selected target has no compatible build and the developer declines the proposed configuration
- **THEN** the launcher exits without configuring, compiling, or starting a target

### Requirement: Windows direct-launch configuration
Windows target-specific batch entry points SHALL pass automatic configuration approval to the shared launcher. When no compatible configured build exists, those direct entry points SHALL configure and build it without requiring console input. The shared Python launcher and POSIX direct entry points SHALL retain explicit confirmation requirements for a missing build.

#### Scenario: Double-clicked Web launcher requires a first build
- **WHEN** a developer starts the Windows Web batch entry point and no compatible configured build exists
- **THEN** it configures, builds, and starts the Web target without waiting for confirmation input

### Requirement: Windows compiler environment initialization
Windows 启动器 SHALL 在需要 MSVC 编译时初始化与本机及目标架构匹配的 Visual Studio C++ 环境；x64 与 ARM64 默认配置预设 SHALL 实际存在。已验证的 MinGW 构建 SHALL 可以使用现有工具链，不要求安装 Visual Studio。缺少所需 MSVC 工具时 SHALL 在开始编译前明确报错，并说明 Build Tools C++ 工作负载要求。帮助、产物列表和 dry-run SHALL 不要求初始化编译环境。

#### Scenario: Start from a normal Windows shell
- **WHEN** a developer starts a Windows target-specific entry point from a shell without Visual Studio compiler variables
- **THEN** the entry point initializes the developer environment and the incremental build receives the C++ standard-library include paths

#### Scenario: Missing Visual Studio C++ tools
- **WHEN** Windows 启动器需要 MSVC，但找不到适配架构的 Visual Studio C++ 开发环境
- **THEN** 启动器报告所需 Build Tools 组件，并且不开始编译

#### Scenario: 纯 MinGW 环境
- **WHEN** 开发者提供当前工作树内有效的 x64-mingw-static 构建，且未安装 Visual Studio
- **THEN** 启动器使用该构建的 MinGW 工具链继续增量编译

### Requirement: Target-specific startup
The launcher SHALL reuse the repository's existing Web and Desktop launch scripts for those targets. It SHALL start TUI in a new terminal window. Web startup SHALL use a runtime directory isolated to the current worktree and SHALL open the resulting local Web URL after successful startup. Desktop startup SHALL open the Desktop application after successful startup.

#### Scenario: Isolated Web startup
- **WHEN** a developer starts the Web target for a worktree
- **THEN** its daemon uses a worktree-specific runtime directory and opens that daemon's URL

#### Scenario: TUI startup
- **WHEN** a developer starts the TUI target
- **THEN** the launcher opens the TUI executable in a new terminal window

#### Scenario: TUI 保留工作目录和参数
- **WHEN** 工作树路径或 TUI 参数包含空格、引号及 shell 特殊字符
- **THEN** 新终端 SHALL 在当前工作树目录执行 TUI，并将每个参数按原值传递；Windows SHALL 不使用 cmd/start 重新解释这些参数

### Requirement: Web 开发实例占用检查
Web 启动器 SHALL 在增量编译前检查所选 runtime 是否存在 daemon PID 记录。对于默认 runtime，检查 SHALL 包括当前工作树其他提交遗留的启动器目录。存在记录时 SHALL 使用现有 daemon status 机制有界核验并明确失败，避免编译后继续复用旧 worker 或覆盖正在运行的 Windows 可执行文件。核验成功时 SHALL 输出该实例的精确停止命令，核验失败时 SHALL 仅输出检查建议；启动器 SHALL NOT 自动终止进程或删除 runtime 文件。显式指定 runtime 时 SHALL 仅检查该目录。

#### Scenario: 已存在开发 daemon
- **WHEN** 所选或本工作树旧的默认 runtime 仍有 PID 记录
- **THEN** 启动器在编译前退出，报告该目录和检查结果，不编译、不启动、不终止任何进程

#### Scenario: 显式指定 runtime
- **WHEN** 开发者传入 --run-dir
- **THEN** 启动器只检查该目录，不检查、终止或清理默认目录内的 daemon

### Requirement: Target-specific cross-platform entry points
The repository SHALL provide dedicated thin Windows and POSIX entry points for Web, Desktop, and TUI. Each entry point SHALL select its target without requiring a target argument, delegate to the shared development-environment launcher, pass supported command-line arguments through unchanged, and provide a clear error when no supported Python interpreter is available.

#### Scenario: Windows Web launch
- **WHEN** a Windows developer runs the Web batch entry point
- **THEN** it delegates to the shared launcher with the Web target selected

#### Scenario: POSIX TUI launch
- **WHEN** a macOS or Linux developer runs the TUI shell entry point
- **THEN** it delegates to the shared launcher with the TUI target selected
