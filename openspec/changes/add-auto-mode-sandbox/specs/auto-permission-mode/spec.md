# auto-permission-mode Spec

## ADDED Requirements

### Requirement: auto 模式取代 accept-edits
系统 SHALL 提供 `auto` 权限模式(`PermissionMode::Auto`,线上名 `"auto"`),取代原 `accept-edits`。所有解析模式名的入口(config `default_permission_mode`、会话 meta `permission_mode`、CLI `--permission-mode`、`/mode`、REST `PUT /api/sessions/:id/permissions` 与 `/api/config/default-permission-mode`)MUST 把 `accept-edits` 与 `acceptEdits` 当作 `auto` 的别名接受;序列化输出 MUST 只写 `auto`。`PermissionManager::mode_description(Yolo)` MUST 不再声称会确认工作区外首次写入。

#### Scenario: 老会话 meta 无损恢复
- **WHEN** 恢复一个 `permission_mode` 为 `"accept-edits"` 的会话
- **THEN** 会话以 `auto` 模式运行,下一次 meta 落盘写出 `"auto"`

#### Scenario: 老 CLI 参数继续可用
- **WHEN** 以 `-p --permission-mode accept-edits "..."` 启动
- **THEN** 不报 usage error,会话以 `auto` 模式运行

#### Scenario: REST 拒绝未知模式
- **WHEN** `PUT /api/sessions/:id/permissions` body 为 `{"mode":"banana"}`
- **THEN** 返回 400,会话模式不变

### Requirement: auto 模式的放行表
在 `auto` 模式下,系统 SHALL:读工具自动放行;`file_write` / `file_edit` 在写边界内自动放行(危险路径仍强制确认,内置 Deny 规则仍生效);`bash` 按 exec-command-policy 的决策表处理;其它写工具沿用 default 模式的确认行为。

#### Scenario: 已知安全命令不弹确认
- **WHEN** 模式为 auto,模型调用 `bash` 执行 `git status`
- **THEN** 不打开权限确认,命令执行

#### Scenario: 危险命令弹确认
- **WHEN** 模式为 auto,模型调用 `bash` 执行 `rm -rf build`
- **THEN** 打开权限确认,prompt 原因为 `dangerous_command`

#### Scenario: 未知命令在沙盒可用时直接跑
- **WHEN** 模式为 auto,沙盒后端可用,模型调用 `bash` 执行 `pnpm test`
- **THEN** 不打开权限确认,命令在 workspace-write 沙盒内执行

#### Scenario: 未知命令在沙盒不可用时弹确认
- **WHEN** 模式为 auto,沙盒后端不可用,模型调用 `bash` 执行 `pnpm test`
- **THEN** 打开权限确认,prompt 原因为 `unknown_command_without_sandbox`

#### Scenario: 文件编辑仍自动
- **WHEN** 模式为 auto,模型调用 `file_edit` 修改写边界内的 `src/a.cpp`
- **THEN** 不打开权限确认

### Requirement: 会话级「总是允许」对 bash 记前缀
用户选择会话允许时，系统 SHALL 仅记忆界面显示的命令前缀，保留原始可执行 token；
多级 CLI 使用非选项子命令。解释器、通用启动器、不透明脚本和不能可靠提取前缀的命令
MUST 不提供会话记忆；MUST NOT 将整个 bash 工具加入会话放行集合。
升级批准记忆带 bypass 标记，普通记忆仅允许沙盒内运行；后端失效 MUST 重新确认。
新危险参数 MUST 优先于记忆，模式/cwd/沙盒开关变化 SHALL 清空记忆。


#### Scenario: 记住 git commit 前缀
- **WHEN** 用户对 `git commit -m "a"` 选择「本次会话允许」,随后模型执行 `git commit -m "b"`
- **THEN** 第二次不打开权限确认

#### Scenario: 前缀不外溢到其它子命令
- **WHEN** 用户对 `git commit -m "a"` 选择「本次会话允许」,随后模型执行 `git push --force`
- **THEN** 第二次仍打开权限确认(危险命令)

#### Scenario: 其它工具的总是允许不受影响
- **WHEN** 用户对 `file_write` 选择「总是允许」
- **THEN** 后续 `file_write` 调用不再确认(既有行为)

### Requirement: 文件工具拒绝写项目规则目录
系统 SHALL 在 TUI、daemon 与 headless 三个启动路径的内置 Deny 规则中加入 `file_write` / `file_edit` 对 `.acecode/rules/**` 的拒绝,使模型不能通过文件工具写入项目级 exec 规则。

#### Scenario: 模型试图写规则文件
- **WHEN** 模式为 auto,模型调用 `file_write` 写 `.acecode/rules/default.rules`
- **THEN** 工具返回权限拒绝,不打开确认
