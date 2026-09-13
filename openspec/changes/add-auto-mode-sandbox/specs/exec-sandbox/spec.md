# exec-sandbox Spec

## ADDED Requirements

### Requirement: 沙盒策略模型
系统 SHALL 用统一的 `SandboxPolicy { mode: FullAccess | ReadOnly | WorkspaceWrite; writable_roots: [WritableRoot]; network_access: bool }` 描述一次 bash 执行的限制。`WorkspaceWrite` 的可写根 MUST 由 `compute_writable_roots(write_root_or_cwd, config)` 计算:会话写边界根(worktree / LOOP / 继承根,否则 cwd)+ `config.sandbox.writable_roots` + 系统临时目录(除非 `exclude_tmpdir`)+ 链接 worktree 的 gitdir 与 common dir;每个根下的 `.git/hooks`、`.git/config`、`.git/config.worktree`、`.git/modules`、`.git/worktrees/*/config.worktree`、`.acecode/rules` MUST 列为只读子路径。`ReadOnly` 的可写根 MUST 为空。

#### Scenario: 主仓可写根与只读子路径
- **WHEN** cwd 是含 `.git/hooks` 与 `.acecode/rules` 的 git 仓库根
- **THEN** 可写根含 cwd,其只读子路径含 `.git/hooks`、`.git/config`、`.acecode/rules`

#### Scenario: 链接 worktree 追加 gitdir
- **WHEN** cwd 的 `.git` 是内容为 `gitdir: <main>/.git/worktrees/x` 的文件
- **THEN** 可写根另含 `<main>/.git/worktrees/x` 与 `<main>/.git`,两者的只读子路径同样按名单计算

#### Scenario: exclude_tmpdir
- **WHEN** `config.sandbox.exclude_tmpdir=true`
- **THEN** 可写根不含系统临时目录

### Requirement: Windows 受限令牌后端
在 Windows 上，系统 SHALL 派生 WRITE_RESTRICTED | DISABLE_MAX_PRIVILEGE | LUA_TOKEN 令牌，
限制 SID 包含 Everyone、登录 SID、按完整策略与模式派生的合成 SID。
不同工作区策略和 ReadOnly MUST 使用不同授权身份，ReadOnly MUST 无写根。
可写根允许读/写/执行/DELETE；MUST NOT 授予 FILE_DELETE_CHILD / WRITE_DAC / WRITE_OWNER。
受保护路径仅拒绝写类权限，MUST NOT 拒绝 READ_CONTROL / SYNCHRONIZE。
缺失的敏感路径 MUST 在执行前准备实体；每次启动 MUST 核对实际 ACL，不得只依赖路径缓存。
子进程 SHALL 经 CreateProcessAsUserW 启动，并设置兼容受限 IPC 的默认 DACL 和桌面。
准备/启动失败 MUST 返回错误或重新进入审批，MUST NOT 隐式完整访问重试。
Windows 不隔离网络，Everyone/登录 SID 已有写权限的目录是已知限制。
与 Codex unelevated 的 WRITE_RESTRICTED 方案一致，本期不承诺删除/改名隔离：
DELETE / FILE_DELETE_CHILD 可能绕过限制 SID 检查，包含外部与受保护路径。
系统 MUST 在文档和 /sandbox 状态中说明该边界，不收紧当前用户的 Shell 读取范围。


#### Scenario: 工作区内写成功、外部写失败
- **WHEN** 在 WorkspaceWrite 沙盒内执行 `cmd /c echo x > <cwd>\a.txt` 与 `cmd /c echo x > %USERPROFILE%\b.txt`
- **THEN** 前者成功,后者失败且被判定为疑似沙盒拒绝

#### Scenario: 受保护子路径拒写但可读
- **WHEN** 在 WorkspaceWrite 沙盒内执行 `cmd /c type .git\config` 与 `cmd /c echo x >> .git\config`
- **THEN** 前者成功,后者失败

#### Scenario: 令牌创建被策略拒绝
- **WHEN** `CreateRestrictedToken` 返回失败
- **THEN** `sandbox::runtime().available()` 为 false,`/sandbox` 显示失败原因,auto 模式按沙盒不可用分支工作

#### Scenario: 免管理员删除与改名边界
- **WHEN** Windows 使用 WRITE_RESTRICTED 后端
- **THEN** /sandbox 显示删除/改名不完整受限，测试将其作为已知限制记录，不宣称删除隔离通过

### Requirement: macOS Seatbelt 后端
在 macOS 上,系统 SHALL 以 `/usr/bin/sandbox-exec -p <policy> -DWRITABLE_ROOT_i=<path> ... -- <shell> -c <command>` 启动子进程;policy MUST 以 deny-default 基础策略开头,放行 `file-read*`,对每个可写根放行 `file-write*` 并用 `require-not (subpath ...)` 排除只读子路径;`network_access=false` 时 MUST NOT 含任何 network 放行,为 true 时追加 network-outbound / network-inbound / system-socket 与相关 mach-lookup 放行。`/usr/bin/sandbox-exec` 不存在时沙盒不可用。

#### Scenario: 策略字符串含可写根参数
- **WHEN** 可写根为 `/w`(只读子路径 `/w/.git/hooks`),network_access=false
- **THEN** 生成的 argv 含 `-DWRITABLE_ROOT_0=/w` 与 `-DWRITABLE_ROOT_0_EXCLUDED_0=/w/.git/hooks`,policy 含 `(allow file-write* (require-all (subpath (param "WRITABLE_ROOT_0")) (require-not (subpath (param "WRITABLE_ROOT_0_EXCLUDED_0")))))` 且不含 `network-outbound`

### Requirement: Linux bubblewrap 后端
在 Linux 上,系统 SHALL 仅当 PATH 上存在 `bwrap` 且 与实际执行相同的用户/PID/IPC/网络命名空间、挂载参数加 /bin/true 在 3 秒内探测成功时启用沙盒，执行复用探测过的绝对 bwrap 路径,以 `bwrap --unshare-user --unshare-pid --unshare-ipc --new-session --ro-bind / / --dev /dev --proc /proc [--bind root root]... [--ro-bind ro ro]... [--unshare-net] --die-with-parent -- <shell> -c <command>` 启动;MUST NOT 自动下载 bwrap。

#### Scenario: 无 bwrap 时降级
- **WHEN** PATH 上没有 `bwrap`
- **THEN** 沙盒不可用,auto 模式按不可用分支工作,日志说明原因

### Requirement: 沙盒拒绝检测与升级提示
bash 工具在沙盒内执行且退出码非 0 时,SHALL 用 `is_likely_sandbox_denied(exit_code, output)` 判定(退出码 0 / 2 / 126 / 127 不算;输出大小写不敏感含 `operation not permitted` / `permission denied` / `read-only file system` / `access is denied` / `拒绝访问` / `seccomp` / `sandbox-exec` / `sandbox: deny` / `seatbelt` / `bwrap:` / `landlock` / `failed to write file` 之一即算;裸 `sandbox` 一词 MUST NOT 作为特征,否则提到 `src/sandbox/` 源文件的编译错误会被误判);判定为真时 MUST 在输出末尾追加固定的升级提示(说明可写根与网络状态,指明用 `with_escalated_permissions=true` 与一句 `justification` 重试)并置 `metadata.sandbox_denied=true`。

#### Scenario: 拒绝输出附提示
- **WHEN** 沙盒内命令退出码 1,输出含 `Access is denied.`
- **THEN** 工具输出末尾含升级提示,metadata.sandbox_denied 为 true

#### Scenario: 普通失败不附提示
- **WHEN** 沙盒内命令退出码 1,输出为编译错误
- **THEN** 工具输出不含升级提示

### Requirement: system prompt 与工具描述
`build_system_prompt` 的 `# Environment` SHALL 含一行 `- Shell sandbox: ...`(workspace-write + 后端名 + 可写根 + 网络状态 / read-only / unavailable + 原因 / none),以及一句升级指引;该内容 MUST 只随模式、配置与进程级探测结果变化,同一回合内逐字节稳定。`bash` 工具描述 MUST 说明 `with_escalated_permissions` 与 `justification` 的用途。

#### Scenario: auto 模式沙盒可用
- **WHEN** 模式为 auto 且 Windows 受限令牌后端可用
- **THEN** 系统提示含 `Shell sandbox: workspace-write (restricted-token)` 与可写根列表,并含 `with_escalated_permissions` 指引

#### Scenario: 同一回合逐字节稳定
- **WHEN** 同一回合内连续两次构造请求
- **THEN** 两次 system prompt 完全相同

### Requirement: 配置与 /sandbox 命令
系统 SHALL 支持 `config.sandbox`:`enabled`(默认 true)、`network_access`(默认 false)、`writable_roots`(默认空,绝对路径)、`exclude_tmpdir`(默认 false),sparse-on-write;`enabled=false` 时沙盒不可用。`/sandbox` SHALL 在 TUI、daemon builtin 与 Web 斜杠下拉三处可用:无参显示后端 / 可用性与原因 / 模式沙盒 / 可写根 / 只读子路径 / 网络策略;`/sandbox off` / `/sandbox on` 会话级关闭 / 恢复,不落盘。

#### Scenario: 默认配置不落盘
- **WHEN** 用户从未配置 sandbox 段且保存配置
- **THEN** 序列化产物不含 `sandbox` 键

#### Scenario: 会话级关闭
- **WHEN** 用户输入 `/sandbox off`,随后模型在 auto 模式执行未知命令
- **THEN** 按沙盒不可用分支弹确认,配置文件不变
