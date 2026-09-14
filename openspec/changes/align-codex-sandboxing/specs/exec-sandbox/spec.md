# exec-sandbox Spec (delta)

## MODIFIED Requirements

### Requirement: 沙盒策略模型
系统 SHALL 用统一的 `SandboxPolicy { mode; writable_roots; network_access; temporary_directory; readable_roots; denied_paths; denied_globs }` 描述一次 bash 执行的限制。策略 MUST 由三类条目派生:`read`(可读根;为空 = 全盘可读)、`write`(可写根,与 `config.sandbox.writable_roots` 合并)、`deny`(读写都拒绝,含子树,允许 glob)。条目来源 = `config.sandbox.filesystem.*` + 内置默认 deny 名单(`deny_defaults`)+ 会话授权 + 本次 `additional_permissions`。条目 MUST 支持 `~`、`:workspace_roots[/子路径]`、`:tmpdir`、`:acecode_home` 记号,未知记号跳过并记日志。访问判定 MUST 按「最长前缀命中优先,同深度 deny > write > read」;受限读时未命中可读根的路径判为 Deny。落在可写根之下的 deny 路径 MUST 同时列为只读子路径。会话授权与申请中命中 deny 名单的路径 MUST 被忽略。

#### Scenario: 默认 deny 名单
- **WHEN** 配置没有 `filesystem.deny` 且 `deny_defaults` 缺省
- **THEN** 策略的 denied_paths 含家目录下的 `.ssh`、`.aws`、`.gnupg`、`.netrc`、`.docker/config.json`、`.kube` 与数据目录的 `config.json`

#### Scenario: 记号展开
- **WHEN** `filesystem.deny` 含 `:workspace_roots/private` 与 `~/**/.env`
- **THEN** 前者展开为每个写边界根下的 `private`(绝对路径),后者展开为家目录下的 glob;`resolve_access(<home>/proj/.env)` 为 Deny

#### Scenario: 更深的写根压过浅的 deny
- **WHEN** deny 含 `~/.cache`,write 含 `~/.cache/allowed`
- **THEN** `~/.cache/other` 为 Deny,`~/.cache/allowed/pkg` 为 Write

#### Scenario: 受限读
- **WHEN** `filesystem.read` 非空
- **THEN** 可写根与工作区根隐含可读;其它未命中路径为 Deny;macOS 策略只放行可读根并追加平台默认项

### Requirement: Windows 受限令牌后端
(在原要求之上追加)`network_access=false` 时系统 SHALL 对子进程套用准断网环境:`HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `GIT_HTTP_PROXY` / `GIT_HTTPS_PROXY` 指向 `http://127.0.0.1:9`、`NO_PROXY=localhost,127.0.0.1,::1`、`PIP_NO_INDEX=1`、`NPM_CONFIG_OFFLINE=true`、`CARGO_NET_OFFLINE=true`、`GIT_SSH_COMMAND=cmd /c exit 1`、`GIT_ALLOW_PROTOCOLS=`、`ACECODE_SANDBOX_NETWORK_DISABLED=1`,并把 `<数据目录>/sandbox/denybin` 的 `ssh` / `scp` 桩插到 PATH 最前、PATHEXT 把 `.BAT;.CMD` 提前。状态 MUST 显示 `best-effort offline`,MUST NOT 宣称断网。批准的网络申请让本次不套用。bash 子进程 SHALL 以挂起方式启动、挂进不设 KILL_ON_JOB_CLOSE 且不设 SILENT_BREAKAWAY_OK 的 Job Object 后放行;超时 / 中止 MUST `TerminateJobObject`;Job 分配失败时退回只杀直接子进程。deny 条目在 Windows 上 MUST 只保证写不通,状态与文档 MUST 说明读不受限。

#### Scenario: 准断网环境到达子进程
- **WHEN** 受限令牌子进程执行 `echo %HTTPS_PROXY% %NPM_CONFIG_OFFLINE%`
- **THEN** 输出 `http://127.0.0.1:9 true`;执行 `ssh host` 立即失败

#### Scenario: Job Object 杀树
- **WHEN** `cmd /c ping -n 30 127.0.0.1` 在 Job 里运行且被 TerminateJobObject
- **THEN** cmd 与 ping 都在 2 秒内退出;Job 里 ActiveProcesses 归零

### Requirement: MXC 后端口子
系统 SHALL 提供 `BackendKind::WindowsMxc` 与 `config.sandbox.windows_backend = restricted-token | mxc`。`mxc` 在本构建 MUST 探测为不可用并给出「未捆绑 MXC」原因,MUST NOT 静默退回受限令牌。

#### Scenario: 选择 mxc
- **WHEN** `windows_backend=mxc`
- **THEN** `/sandbox` 显示后端 `mxc`、不可用及原因;auto 模式按沙盒不可用分支走

### Requirement: macOS Seatbelt 后端
Seatbelt 策略 SHALL 按全盘可读 / 受限读分别组装:全盘可读追加 preferences policy;受限读只放行 `READABLE_ROOT_i` 参数并追加平台默认项。deny 路径 MUST 经 `-D` 参数变成 `(deny file-read* file-write*)`,deny glob MUST 转成正则 deny 并对祖先目录加 `file-write-unlink`;每个可写根与只读子路径的祖先目录 MUST 拒绝 `file-write-unlink`;deny 段 MUST 排在 allow 段之后。

#### Scenario: deny 路径不内嵌策略文本
- **WHEN** deny 含 `/Users/u/.ssh`
- **THEN** 策略文本只含 `DENIED_PATH_0` 参数引用,argv 含 `-DDENIED_PATH_0=/Users/u/.ssh`

### Requirement: 沙盒拒绝分类
系统 SHALL 把沙盒内失败归一成 `SandboxViolation { reason; path; snippet }`,reason ∈ `operation_not_permitted | permission_denied | read_only_file_system | access_denied | policy_denied | failed_to_write_file | sigsys`,path 从 POSIX `path: Permission denied`、PowerShell `Access to the path 'X' is denied`、cmd `Access is denied` 形态抽取,snippet ≤ 512 字符。结果 MUST 进 `metadata.sandbox_violation`;升级提示 MUST 带路径,先建议 `with_additional_permissions` 只加该路径所在目录,再提 `require_escalated`。

#### Scenario: 抽路径
- **WHEN** 输出为 `mkdir: /Users/u/.cache/x: Permission denied`
- **THEN** reason 为 permission_denied,path 为 `/Users/u/.cache/x`,提示建议 write=[`/Users/u/.cache`]
