# Proposal: align-codex-sandboxing

## Why

`add-auto-mode-sandbox` 把 Codex 的 Auto 审批策略和三平台沙盒骨架搬进了 acecode,但对照 codex-rs 当前主干的 `sandboxing` crate,还有四层没做,外加一个已核实的漏洞:

1. **无人值守越权漏洞**:`exec_decision.cpp` 第 4 条把模型显式 `with_escalated_permissions` 判成 `Prompt + FullAccess`,而 `agent_loop.cpp` 在 active goal 下自动放行所有 Prompt。无人值守时模型只要声明越权就能出沙盒,已发布的 0.9.15 里就有。
2. **沙盒形状只有一种**:「项目可写、其余只读」。没有按目录的可读 / 可写 / 禁止清单,`~/.ssh`、`~/.aws` 这类秘密目录在 macOS 上对沙盒内命令完全可读。
3. **被拦之后一头雾水**:失败只给模型一句「疑似沙盒拒绝,带 with_escalated_permissions 重试」,用户看不到被拒的是哪条路径,也只有「整个出沙盒 / 拒绝」两个选项;模型没有「只加这个目录」的中间申请。
4. **批准不能记住**:每次同类命令都要再点一次,Codex 的「批准并写进 rules 文件」没有对应物。
5. **平台短板**:Windows 完全不限网、超时只杀直接子进程;macOS 没有禁读、没有防「改名把受保护目录搬出去」、没有受限读时的平台默认项。

本期只做 Windows 与 macOS(Linux 保持编译与既有语义),MXC(微软 AppContainer 库)只留后端口子,不实现。

## What Changes

- **决策表**新增 `unattended` 输入:无人值守(active goal)下的越权申请与额外权限申请一律 `Forbidden`,工具结果告诉模型「留在沙盒里重试」。
- **权限清单模型**:`config.sandbox.filesystem.{read,write,deny}` 三个列表,支持 `~`、`:workspace_roots`、`:tmpdir` 记号;`deny` 支持 glob;内置默认 deny 名单(`~/.ssh`、`~/.aws`、`~/.gnupg`、`~/.netrc`、`~/.docker/config.json`、`~/.kube`、`~/.acecode/config.json`),可用 `deny_defaults=false` 关闭。策略对象带 `readable_roots` / `denied_paths` / `denied_globs`,判定「最长前缀优先、同深度 deny > write > read」。
- **模型侧参数**对齐 Codex:`sandbox_permissions = use_default | with_additional_permissions | require_escalated`(旧 `with_escalated_permissions` 保留为别名)、`additional_permissions{file_system{read[],write[]}, network{enabled}}`、`prefix_rule[]`。额外权限经用户批准后「留在沙盒里但临时加宽」,可记为会话授权。
- **拒绝分类**:`metadata.sandbox_violation{reason,path,snippet}`,提示文案带被拒路径并建议最小申请;AgentLoop 记住最近一次被拒路径,在随后的越权确认里提供「只放行该目录」选项。
- **审批决策扩展**:`allow_scoped`(只加建议目录,留在沙盒内)与 `allow_remember`(批准并写入规则文件)。越权批准写 `<data_dir>/rules/default.rules`(沙盒外),沙盒内批准写 `<data_dir>/rules/default.sandboxed.rules`(免确认但仍沙盒);模型给的 `prefix_rule` 需覆盖全部段且不在禁用前缀名单里才采用。
- **Web / TUI** 确认框:显示被拒路径、额外权限清单、规则前缀;新增两个按钮 / 选项。
- **Windows**:`network_access=false` 时注入准断网环境(代理指向死端口、pip/npm/cargo 离线、ssh/scp 桩);子进程挂 Job Object,超时 / 中止杀整棵进程树(正常结束不杀后台孙进程);`config.sandbox.windows_backend = restricted-token | mxc`,`mxc` 为占位后端,探测恒不可用并说明原因。
- **macOS**:受限读时只放行可读根 + 平台默认 sbpl;deny 路径 / glob 转成 `deny file-read* file-write*`;可写根与受保护祖先目录加 `deny file-write-unlink`;全盘可读时追加 preferences policy。
- **Desktop 硬拒绝放宽**:配置里的普通 Deny 规则(`.env` / `.git/**` 写入)对文件工具恢复为「弹确认」,只有内置保护规则(`.acecode/rules/**`,priority ≥ 1000)与 yolo 下保持硬拒绝;bash 的 Deny 规则仍是 forbidden。

## Capabilities

### Modified Capabilities

- `exec-command-policy`:决策表新增无人值守输入与额外权限申请;规则文件新增写回与禁用前缀;bash 参数换代。
- `exec-sandbox`:策略换成清单模型;拒绝分类;Windows 准断网 + Job Object + MXC 口子;macOS 禁读 / 防改名 / 平台默认项。
- `auto-permission-mode`:审批决策新增 `allow_scoped` / `allow_remember`;Deny 规则硬拒绝范围收窄。
