# apply-patch-tool

## ADDED Requirements

### Requirement: apply_patch 工具注册与写工具语义
系统 SHALL 在共享 ToolExecutor 注册名为 `apply_patch` 的内置工具(TUI / daemon / headless 三端),`is_read_only=false`,与 `file_edit` 走同一权限模式语义:Default 需确认、Auto 自动放行、Yolo 放行、Plan 仅当补丁涉及的全部路径都是活动计划文件时放行。工具参数为单个字符串 `input`(补丁全文);`patchText` / `patch` 作为别名接受。

#### Scenario: 三端注册
- **WHEN** 任一入口完成内置工具注册
- **THEN** `has_tool("apply_patch")` 为真且 `is_read_only("apply_patch")` 为假

#### Scenario: Auto 模式免确认
- **WHEN** 权限模式为 Auto 且模型调用 `apply_patch`
- **THEN** `should_auto_allow("apply_patch", false)` 为真

### Requirement: 补丁格式解析
系统 SHALL 解析 Codex 补丁语言:`*** Begin Patch` / `*** End Patch` 信封(按行 trim 比较,CRLF 与外层 heredoc 包裹可接受);`*** Add File: <path>`(其后每行以 `+` 开头;空行视为空内容行)、`*** Delete File: <path>`、`*** Update File: <path>`(可紧跟 `*** Move to: <path>`;其后一个或多个以 `@@` 开头的 chunk,chunk 内 ` ` / `-` / `+` 行,空行视为空上下文行,`*** End of File` 标记 EOF 锚定;第一个 chunk 可省略 `@@`)。缺信封、缺 header、未知行前缀 MUST 报含行号的解析错误,零操作的补丁 MUST 报 `empty patch`。

#### Scenario: 混合操作补丁
- **WHEN** 一份补丁依次包含 Add / Update(带 Move to)/ Delete 三段
- **THEN** 解析结果按出现顺序给出三个 hunk,类型与路径逐一对应

#### Scenario: 未知前缀行
- **WHEN** Update 段内出现既不以 ` `、`-`、`+`、`@@`、`***` 开头也非空的行
- **THEN** 解析失败,错误信息包含该行号

### Requirement: 上下文匹配与内容推导
对 Update 操作系统 SHALL:先按 `@@` 锚点文本 seek(找不到即失败并报出锚点),再自锚点之后匹配 `old_lines`;`old_lines` 为空视为追加到文件末尾;匹配依次尝试精确、去尾空白、去两端空白、Unicode 标点归一(弯引号 / 破折号 / 省略号 / 不换行空格)四级比较;首次失败时去掉 `old_lines` 尾部空行重试一次;EOF 锚定时优先从文件末尾对齐;多个 chunk 的替换按起始行排序后倒序应用。找不到 `old_lines` MUST 报 `Failed to find expected lines in <path>` 并附上原文本。

#### Scenario: 缩进差异仍能命中
- **WHEN** 补丁的上下文行比文件多了尾部空格
- **THEN** 去尾空白比较命中,替换成功

#### Scenario: 弯引号归一
- **WHEN** 文件里是 `“Hi”` 而补丁写成 `"Hi"`
- **THEN** 第四级归一比较命中

### Requirement: 校验先于落盘
工具 SHALL 先对全部操作做校验(Add 目标存在且非空 → 拒绝;Delete / Update 目标非普通文件 → 拒绝;Update 文件过大或解码有损 → 拒绝;Move 目标已存在 → 拒绝;chunk 匹配失败 → 拒绝),任一失败则**不改动任何文件**;校验通过后按补丁顺序落盘,每个文件先调用 `track_file_write_before`(Delete / Move 源文件同样先记检查点),Update 沿用源文件的编码与换行元数据,新文件 UTF-8 无 BOM / LF,落盘后 `MtimeTracker::record_write`,Delete / Move 源文件失效读基线。相对路径按会话 cwd 解析;工具本身不要求先读文件。

#### Scenario: 第二段失败不落第一段
- **WHEN** 补丁第一段是合法 Add、第二段 Update 的 old_lines 在文件里不存在
- **THEN** 工具失败,Add 目标文件不存在

#### Scenario: 保留 CRLF
- **WHEN** 被 Update 的文件是 CRLF 换行
- **THEN** 写回后仍是 CRLF,内容按补丁更新

### Requirement: 结果与渲染元数据
成功结果 SHALL:输出 `Success. Updated the following files:` 与每文件一行 `A / M / D <path>`(Move 为 `M <new> (from <old>)`),非删除文件追加 LSP 诊断块;`summary` 单文件用 Created / Edited / Deleted + 路径,多文件用 Patched + `N files`,metrics 带 `+` / `-` 总计;`hunks` 含全部文件的结构化 diff 且每个 hunk 带 `file`;`metadata.files[]` 每项含 `path`、`type`(add / update / delete / move)、可选 `move_path`、`additions`、`deletions`;全部路径位于会话 scratch 目录时置 `exclude_from_turn_change_summary`。

#### Scenario: 多文件 hunk 归属
- **WHEN** 补丁修改两个文件
- **THEN** `hunks` 中每个 hunk 的 `file` 指向各自文件,Web 变更审查按文件分组

### Requirement: 多路径权限与边界校验
AgentLoop SHALL 对补丁涉及的全部路径(Add / Update / Delete 路径与 Move 目标)逐条评估:exec 规则文件保护、配置 Deny 规则(含 `.env`、`.git/**`、`.acecode/rules/**`)、写边界、工作目录边界、危险路径强制确认;任一路径被 Deny 即拒绝整份补丁,任一路径需确认即弹一次确认(列出全部文件)。hooks 的 `apply_patch` matcher MUST 同时命中原生 `apply_patch` 工具。

#### Scenario: 一条路径越界整份拒绝
- **WHEN** 补丁同时修改工作目录内文件与工作目录外文件
- **THEN** 工具调用被拒绝,两个文件都不改动
