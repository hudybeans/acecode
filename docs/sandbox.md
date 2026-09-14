# Auto 模式与 Shell 沙盒

Auto 自动接受文件编辑，并让普通模型命令在工作区写入沙盒中执行。危险命令仍需确认。
无法启用沙盒时，未知命令回到确认流程。这个功能约束模型调用的 `bash` 工具；
用户手动执行的 Shell、插件和其它工具继续使用各自的权限边界。

## 模式与审批

| 条件 | 执行行为 |
|---|---|
| 任意模式匹配 forbidden 规则 | 直接拒绝，包括 yolo / dangerous |
| Yolo / dangerous | 完整访问；其它既有文件路径规则仍按原流程处理 |
| 显式申请沙盒外执行 | 展示理由，批准后完整访问 |
| Auto：已知安全或普通未知命令，沙盒可用 | 工作区写入沙盒，免确认 |
| Auto：未知命令，沙盒不可用或会话关闭 | 确认后完整访问 |
| Default / Plan：已知安全命令 | 优先只读沙盒；不可用时直接运行 |
| Default / Plan：未知命令 | 确认后完整访问 |
| 危险命令 | 确认；Auto 沙盒可用时仍在沙盒内，显式升级批准后才完整访问 |
| 项目 allow 规则 | 仅允许沙盒内运行；不越过危险命令确认 |
| 全局 allow 规则 | 完整访问；Plan 优先只读沙盒，不可用时确认 |

已知安全名单只覆盖可静态判断的命令和参数，如 `git status`。
重定向、变量替换、脚本块、解释器脚本及可能写文件或启动其它程序的参数会保守处理。
分类器不能证明任意脚本安全，规则也不等于恶意代码扫描。

“本次会话允许”只记住界面显示的命令前缀，如 `pnpm install`，不会放行整个 Bash 工具。
升级批准所记住的前缀可在沙盒外执行；普通沙盒内批准不会在沙盒失效后自动升级。
新出现的危险参数仍需确认。解释器、不透明脚本及无法可靠截取前缀的命令只允许一次。
切换权限模式、工作目录或沙盒开关会清除会话记忆。

旧模式名称 `accept-edits`、`acceptEdits` 接受为 `auto`；写盘与 API 使用 `auto`。

## 可写范围

工作区写入沙盒允许会话写边界根（worktree / LOOP / 继承根，否则 cwd）、显式配置的
绝对路径及临时写目录。合法 Git linked worktree 会追加登记的 gitdir 和 common .git
目录，以支持普通 Git 操作；必须通过 commondir 布局与反向 gitdir 登记验证，任意
`gitdir:` 文本不能扩大权限。

`.git/hooks`、`.git/config`、`.git/config.worktree`、`.git/modules`、
已有 worktree 的 `config.worktree`、工作区的 `.git` 指针文件和
`.acecode/rules` 列为只读子路径。准备阶段会创建缺失的空敏感目录/配置文件，让随后新建
文件也受到保护。Windows 的内容写入限制不等于删除/改名隔离，具体边界见下文。
用户可在 ACECode 之外编辑这些规则和配置。

只读模式不添加可写根。文件读访问仍可遍及当前用户有权读取的路径。
Windows 默认临时写根是系统临时目录下的 `acecode-sandbox/<工作区哈希>`，Shell 的
`TEMP`、`TMP`、`TMPDIR` 自动指向这里。目录按规范化工作区稳定派生，重开会话后复用，
首次准备无需给整个系统临时树传播 ACL。目录被 junction/symlink 重定向时准备失败。
macOS/Linux 沿用系统临时目录；`exclude_tmpdir=true` 不追加临时写根，也不覆盖上述环境变量。
会话临时文件 `ACECODE_TMPDIR` 位于工作区的 `.acecode/tmp/session-*`。

## 平台后端

| 平台 | 实现 | 限制与不可用条件 |
|---|---|---|
| Windows | WRITE_RESTRICTED 令牌、目录 ACL、CreateProcessAsUserW | 免管理员；不隔离网络；不支持 ACL 的文件系统、写 ACL 或创建进程被策略拒绝时不可用 |
| macOS | 系统 sandbox-exec / Seatbelt | 工具缺失或启动失败时不可用；network_access 决定网络放行 |
| Linux | 系统 bubblewrap | 需已安装 bwrap 且用户/PID/IPC 命名空间可用；不自动下载；network_access 决定网络放行 |

Windows 的合成 SID 绑定模式和完整路径策略，工作区之间、写入和只读令牌之间不共享授权。
ACL 只针对合成 SID；宿主用户的正常权限不变。授权不包含 FILE_DELETE_CHILD、WRITE_DAC、
WRITE_OWNER；敏感路径添加拒绝写入 ACE。
每次使用前核对 ACL，仅缺失时写入；首次向大目录传播 ACL 可能较慢，耗时记入日志。
这些 ACE 会保留在文件系统中，它们不对应普通用户账户。
合成 SID 随策略变化：不同工作区、不同 worktree、不同 `writable_roots` / `exclude_tmpdir`
组合各自产生一枚 SID，对应的 ACE 会逐渐累积在专用临时目录与各工作区根上（每条约 36 字节，
DACL 上限 64KB，实际用量远够）。本期不做自动回收；需要清理时用 `icacls` 或资源管理器
移除主体为 `S-1-5-80-` 开头且无法解析为账户的条目。

Windows 为保证管道和窗口基础设施可用，限制 SID 还包含 Everyone 与当前登录 SID。
因此它们已有写权限的目录可能仍可写（例如部分 Public / ProgramData 目录）。
另一个已确认的限制是：WRITE_RESTRICTED 不完整约束 DELETE / FILE_DELETE_CHILD。
即便合成 SID 有拒绝 ACE，仍可能删除工作区外或受保护的文件、改名受保护目录；
只读模式也不保证阻止这些操作。因此不能宣称它完整限制所有文件系统变更。
本期保留当前用户的 Shell 读取范围，不切换到限制读取的令牌方案。
本实现不是 AppContainer、虚拟机或对抗恶意本地程序的完整隔离边界，
也不保证阻止当前用户可访问的外部服务产生副作用。`network_access=false` 在 Windows
不提供断网承诺；状态与模型提示明确显示 `network: not enforced`。

后端准备/启动失败只返回错误或重新进入确认流程，绝不会静默取消沙盒重跑命令。

上述删除/改名限制已经按 Codex 提交
[`dfaf451426868c22e6859f5494150fd6338c3257`](https://github.com/openai/codex/tree/dfaf451426868c22e6859f5494150fd6338c3257/codex-rs/windows-sandbox-rs)
的免管理员令牌和 ACL 配置，在本机私有临时目录中单独复现：工作区外新文件内容写入失败，
受保护配置写入失败，但 DeleteFileW、MoveFileW 和实际 cmd 子进程删除均成功。
对照的是 token.rs、acl.rs、spawn_prep.rs 的免管理员路径，未运行 Codex 完整程序，
也不据此判断它的 elevated 独立账户后端。原生测试单独记录这一已接受的边界。

## 升级协议

```json
{
  "command": "pnpm install",
  "with_escalated_permissions": true,
  "justification": "需要写入共享依赖缓存。"
}
```

理由必须是非空字符串；类型错误或缺失理由直接报参数错误。请求确认时，
`args.permission` 给出原因、批准后的沙盒边界、可记忆前缀及分类。
疑似沙盒拒绝会附 `metadata.sandbox_denied=true` 与升级指引；
后端准备/启动错误附 `metadata.sandbox_unavailable=true`。普通编译失败不应被当作隔离拒绝。

## 规则文件

全局位置是 ACECode 数据目录的 `rules/*.rules`（通常 `~/.acecode/rules/`），
项目位置为 `<cwd>/.acecode/rules/*.rules`。会话创建或切换 cwd 时加载。
全局规则由用户维护；项目 allow 只能给予沙盒内免确认权限。

```python
prefix_rule(
    pattern = ["git", ["add", "commit"]],
    decision = "prompt",
    justification = "提交前复核",
    match = ["git commit -m fix"],
    not_match = ["git push"],
)
prefix_rule(pattern = ["curl"], decision = "forbidden")
```

支持 `prefix_rule` 的字符串/列表子集、注释，decision 默认 allow；
`host_executable(...)` 仅兼容解析，不执行。其它语法、重复参数、错误的 decision、
失败的 match/not_match 验证或超限文件会使整份文件跳过，日志记录原因。
首 token 支持显式规则的可执行文件 basename 回退，多条规则以
forbidden > prompt > allow 合并；多段命令须每段都获 allow。
不透明脚本不使用宽前缀 allow；包装脚本内能识别的 forbidden/prompt 仍参与约束。

## 配置与状态

```json
{
  "sandbox": {
    "enabled": true,
    "network_access": false,
    "writable_roots": [],
    "exclude_tmpdir": false
  }
}
```

以上均为默认值，默认配置保存时不产生 sandbox 段。额外根必须为绝对路径。
`/sandbox` 显示后端、原因、模式、可写/只读路径和网络能力。
`/sandbox off` / `/sandbox on` 只改变当前会话，不写配置；
关闭后 Auto 未知命令仍需确认。
后端准备或启动失败会把本会话的沙盒标记为不可用（状态里显示原因）；修好环境后
`/sandbox on` 会重新探测，不必重启。

活跃 goal 的无人值守回合里，bash 的确认与其它写工具一样自动放行，但执行边界仍按
决策表：Auto 下危险命令留在 workspace-write 沙盒内，越权申请才获得完整访问；
forbidden 规则照常拒绝。

实现参考：[OpenAI Codex](https://github.com/openai/codex) 的 execpolicy 与沙盒划分、
[CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken)、
[Windows 文件权限](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights)。
