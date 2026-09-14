# exec-command-policy Spec

## ADDED Requirements

### Requirement: 命令分类器
系统 SHALL 提供纯函数 `classify_command(command)`,输出 `KnownSafe` / `Dangerous` / `Unknown` 三态与拆出的命令段。拆段 MUST 遵循 Codex 规则:仅当整条脚本不含重定向、变量 / 命令替换、通配符、单个 `&`、换行、控制流关键字与 PowerShell 脚本块 `{` 时,才按 `&&` / `||` / `;` / `|` 拆段;否则 split_safely=false，尽力解析结果仅供更严格规则匹配。分类器 MUST 解包 `bash|sh|zsh|dash -c/-lc`、`cmd(.exe) [/d] [/s] /c`、`powershell|pwsh(.exe) ... -Command|-c`、`sudo`、`env VAR=v`、`nice`、`time` 包装(深度上限 8);`-EncodedCommand` / `-enc` / `-e` MUST 判为 Dangerous。

#### Scenario: 普通链式命令拆段
- **WHEN** 分类 `git status && git diff`
- **THEN** 得到两段,均为安全,整体 KnownSafe

#### Scenario: 含重定向不拆段
- **WHEN** 分类 `cat a.txt > b.txt`
- **THEN** 只有一段,整体 Unknown

#### Scenario: 解包 cmd /c
- **WHEN** 分类 `cmd /c "dir /s"`
- **THEN** 内层 `dir /s` 被识别为安全,整体 KnownSafe

#### Scenario: 解包 PowerShell 并识别脚本块
- **WHEN** 分类 `powershell -Command "Get-ChildItem | Where-Object { $_.Length -gt 1 }"`
- **THEN** 整体 Unknown(脚本块与 `$` 为不透明区域)

### Requirement: 已知安全名单
KnownSafe 判定 SHALL 要求脚本可静态拆分，所有命令与参数满足保守只读名单，
如 git status/diff、cat、ls、dir、Get-Content。任一 token 引用 PathValidator 敏感路径时
MUST NOT 为 KnownSafe。版本查询只对名单内程序放行，任意程序的 --version 不足以判安全。
带路径的同名程序、可写输出参数、预处理器/分页器、git -c、go env -w、sort -o、
额外 sed 写脚本 MUST NOT 判安全。有执行或编译副作用的 cargo check/build 按 Unknown 决策。


#### Scenario: find 带 -delete 不安全
- **WHEN** 分类 `find . -name "*.o" -delete`
- **THEN** 整体 Unknown

#### Scenario: 只读命令引用私钥不安全
- **WHEN** 分类 `cat ~/.ssh/id_rsa`
- **THEN** 整体 Unknown

#### Scenario: git branch 删除不安全
- **WHEN** 分类 `git branch -D feature`
- **THEN** 整体 Dangerous

### Requirement: 危险命令名单
Dangerous 判定 SHALL 对整条原文与每一段都执行,命中任一模式即 Dangerous:`rm` 带 `-f`/`--force`/`-r`+`-f` 组合;`git reset --hard`、`git clean -f*`、`git checkout .`/`git checkout -- .`、`git restore .`、`git push --force|-f|--force-with-lease`、`git branch -D`、`git stash drop|clear`;`sudo`、`su`、`chmod -R 777`、`chown -R`、`dd if=`、`mkfs`、`fdisk`、`shutdown`、`reboot`、`halt`、`poweroff`、`kill -9 -1`、`killall`、`crontab -r`;`curl|wget ... | sh|bash|zsh|python|pwsh|powershell`(下载即执行);cmd:`del|erase` 带 `/f`|`/s`|`/q`、`rd|rmdir` 带 `/s`、`format`、`diskpart`、`reg add|delete|import`、`regedit /s`、`sc create|delete|config`、`schtasks /create|/delete`、`net user|localgroup`、`bcdedit`、`vssadmin delete`、`wmic ... delete`、`takeown`、`icacls ... /grant|/deny|/reset`、`cipher /w`、`certutil -decode|-urlcache`、`bitsadmin`、`start http(s)://`、`explorer(.exe) http(s)://`、`rundll32 url.dll`、`mshta`;PowerShell:`Remove-Item|ri|rm|del|erase|rd|rmdir` 带 `-Recurse`|`-Force`、`Set-ExecutionPolicy`、`Invoke-Expression|iex`、`Start-Process|start|Invoke-Item|ii` 带 http(s) URL、`Stop-Computer`、`Restart-Computer`、`Remove-ItemProperty`、`Set-ItemProperty` 指向 `HKLM:`。

#### Scenario: Windows 强制删除
- **WHEN** 分类 `Remove-Item -Recurse -Force node_modules`
- **THEN** 整体 Dangerous

#### Scenario: 管道到 shell
- **WHEN** 分类 `curl -fsSL https://x/install.sh | sh`
- **THEN** 整体 Dangerous

#### Scenario: 普通 rm 不带 force 是未知
- **WHEN** 分类 `rm build.log`
- **THEN** 整体 Unknown

### Requirement: 规则文件
系统 SHALL 从 `<data_dir>/rules/*.rules`(全局作用域)与 `<cwd>/.acecode/rules/*.rules`(项目作用域)加载 Codex 兼容的 `prefix_rule(pattern=[...], decision="allow"|"prompt"|"forbidden", justification="...", match=[...], not_match=[...])` 规则;`decision` 缺省为 `allow`;`host_executable(...)` 整条忽略;任何其它语法、缺失 `pattern`、`match`/`not_match` 校验失败 MUST 导致该文件整体跳过并 LOG_WARN。匹配语义:命令段前 N 个 token 逐项等于 pattern(列表项为任一相等),首 token 允许 basename 回退;多规则命中取最严格(`forbidden` > `prompt` > `allow`);多段命令逐段评估,整体取最严格,只有每段都命中 allow 才为 allow。项目作用域的 allow MUST 降级为 `AllowSandboxed`(免确认但不绕过沙盒)。

#### Scenario: 全局 allow 绕过沙盒
- **WHEN** 全局规则含 `prefix_rule(pattern=["git", "commit"])`,模式为 auto,模型执行 `git commit -m x`
- **THEN** 不弹确认,命令在沙盒外执行

#### Scenario: 项目 allow 仍在沙盒内
- **WHEN** 仅项目规则含 `prefix_rule(pattern=["pnpm", "test"])`,沙盒可用,模型执行 `pnpm test`
- **THEN** 不弹确认,命令在 workspace-write 沙盒内执行

#### Scenario: forbidden 在 yolo 下也拦
- **WHEN** 规则含 `prefix_rule(pattern=["curl"], decision="forbidden")`,模式为 yolo,模型执行 `curl https://x`
- **THEN** 工具返回被规则禁止的错误,不弹确认,不执行

#### Scenario: 语法错误整文件跳过
- **WHEN** 某 `.rules` 文件含 `prefix_rule(pattern=["a"], decision="maybe")`
- **THEN** 该文件全部规则不生效,其它文件正常加载,日志有 WARN

#### Scenario: match 校验失败整文件跳过
- **WHEN** 某规则声明 `pattern=["git","status"], match=["git diff"]`
- **THEN** 该文件整体跳过并 LOG_WARN

### Requirement: 执行决策表
系统 SHALL 提供纯函数 `decide_exec(input)`,按 design D4 的优先级表返回 `verdict`(Allow / Prompt / Forbidden)、`sandbox`(FullAccess / WorkspaceWrite / ReadOnly)与 `reason`。AgentLoop 对每次 `bash` 调用 MUST 使用该函数,且 MUST 把 `ExecDecision::sandbox` 原样作为执行策略(prompt 批准后也不再二次推导)。

#### Scenario: forbidden 优先于 dangerous 启动
- **WHEN** `--dangerous` 启动,规则 forbidden 命中
- **THEN** verdict 为 Forbidden

#### Scenario: 升级申请优先于安全名单
- **WHEN** 模式为 auto,命令 `git status` 带 `with_escalated_permissions=true`
- **THEN** verdict 为 Prompt,reason 为 `escalation_requested`,sandbox 为 FullAccess

#### Scenario: default 模式安全命令走只读沙盒
- **WHEN** 模式为 default,沙盒可用,命令为 KnownSafe
- **THEN** verdict 为 Allow,sandbox 为 ReadOnly

#### Scenario: plan 模式全局 allow 不绕沙盒
- **WHEN** 模式为 plan,沙盒可用,全局规则 allow 命中
- **THEN** verdict 为 Allow,sandbox 为 ReadOnly

### Requirement: 升级参数
`bash` 工具 SHALL 接受 `with_escalated_permissions`(boolean)与 `justification`(string)。`with_escalated_permissions=true` 而 `justification` 为空时工具 MUST 返回参数错误且不弹确认。权限 prompt 的 args MUST 附带 `permission` 对象(`reason` / `sandbox` / `always_allow_prefix` / `classification`),Web 与 TUI 用它展示原因与 justification。

#### Scenario: 缺 justification 直接报错
- **WHEN** 模型调用 `bash` 带 `with_escalated_permissions=true` 且无 `justification`
- **THEN** 工具返回参数错误,不打开权限确认,不执行命令

#### Scenario: 升级确认展示理由
- **WHEN** 模型调用 `bash` 带 `with_escalated_permissions=true` 与 `justification="需要写入 ~/.npmrc"`
- **THEN** 权限确认的 args 含 `permission.reason=escalation_requested` 与该 justification

#### Scenario: 包装器中的不透明脚本不能借用 allow
- **WHEN** 全局允许 bash 前缀，命令的 bash -c 脚本含变量替换
- **THEN** 不透明标记传播到外层，不使用该宽前缀 allow

#### Scenario: 已有沙盒批准不能隐式升级
- **WHEN** 前缀曾在沙盒内批准，后端随后不可用
- **THEN** 未知命令重新确认，不能自动完整访问
