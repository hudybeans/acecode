# add-gpt-apply-patch-adaptation

## Why

用户实测「ACECode 接 ChatGPT / GPT-5 系模型效果很挫」。根因不是模型弱,而是我们对所有模型都发同一套工具表和同一套系统提示:GPT-5 / gpt-5-codex 家族在 Codex 里是用 `apply_patch`(`*** Begin Patch` 补丁语言)训练出来的,它们对 `file_edit` 的 old_string/new_string 精确匹配不熟,经常写错缩进、漏上下文、反复失败后退化成 shell heredoc 写文件;而 Claude 系模型正相反,`file_edit` 是它们的母语。opencode 的做法已被验证:按模型 id 分发 —— GPT 系(非 gpt-4、非 oss)自动把 edit/write 换成 `apply_patch`,并配一套 GPT 专用的系统提示(`registry.ts::usePatch`、`system.ts::provider()`)。本 change 把这两条搬进 ACECode。

## What Changes

- 新增内置工具 `apply_patch`(`src/tool/apply_patch_tool.{hpp,cpp}` + 纯逻辑 `src/tool/apply_patch_format.{hpp,cpp}`):Codex/opencode 同款补丁格式(Add / Delete / Update File、Move to、`@@` 上下文锚点、`*** End of File`),四级容错匹配(精确 → 去尾空白 → 去两端空白 → Unicode 标点归一)。所有文件先全部校验再落盘;走既有 `safe_write_text_file` 保留编码/换行、`track_file_write_before` 检查点、`MtimeTracker` 基线、LSP 编辑后诊断、结构化 hunks(每个 hunk 带 `file`,多文件补丁一次结果可渲染)。相对路径按会话 cwd 解析,绝对路径照收。
- 新增 `src/tool/model_family.{hpp,cpp}`:按模型 id 判定模型族与 `apply_patch` 偏好(规则同 opencode:`gpt-*` 且非 `gpt-4*`、非 `*oss*`;另加 `*codex*`)。AgentLoop 每次组装请求按当前模型过滤模型侧工具表:偏好 apply_patch 的模型看不到 `file_edit` / `file_write`,其余模型看不到 `apply_patch`。三个工具始终注册(`resolve_model_tool_name_to_native` fail-open),中途 `/model` 切换只影响后续请求,不重建工具表。
- 系统提示按模型族分支(`SystemPromptModelState`):GPT 系的「Using your tools」段改为 apply_patch 指引(相对路径、3 行上下文、`@@` 锚点、禁止用 shell/Python 改文件),并追加一段 GPT 家族行为指引(自主推进到底、不停在分析、最小改动、脏工作区不回滚、默认 ASCII、不加寒暄开场)—— 内容随模型切换而变,留在可缓存的静态前缀里。
- 权限 / 边界:`apply_patch` 是写工具(串行、Default 模式需确认、Auto 模式自动放行、Plan 模式只允许全部路径都是计划文件时)。AgentLoop 对补丁涉及的**每一条**路径(含 Move 目标)逐一过规则(`.env` / `.git/**` / `.acecode/rules/**` deny、exec rules 保护)、写边界、危险路径确认。hooks 的 `apply_patch` matcher 同时命中原生 `apply_patch`。
- 表面接线:TUI 调用行预览与权限确认框列出补丁文件(A/M/D + Move);TUI diff 视图按 hunk 的 `file` 分文件标题;Web 权限弹窗、回合文件列表、变更审查面板与 `hunksToUnifiedDiff` 支持多文件 hunks;会话 resume 为补丁写过的文件补 MtimeTracker 基线。

## Capabilities

### New Capabilities

- `apply-patch-tool`:补丁语言解析与应用、工具执行语义(校验先于落盘、编码/换行保留、检查点、诊断)、多路径权限与边界校验。
- `model-family-adaptation`:模型族判定、按模型过滤模型侧工具表、模型族系统提示分支。

### Modified Capabilities

- `file-edit-tool`:当当前模型偏好 apply_patch 时,`file_edit` / `file_write` 不再出现在模型侧工具表(仍注册、仍可执行历史/别名调用)。

## Impact

- 新增文件:`src/tool/apply_patch_format.{hpp,cpp}`、`src/tool/apply_patch_tool.{hpp,cpp}`、`src/tool/model_family.{hpp,cpp}`,均经 CMake glob 进 `acecode_testable`。
- 修改:`src/agent_loop.cpp`(工具表过滤、系统提示模型态、多路径权限门)、`src/prompt/system_prompt.{hpp,cpp}`、`src/permissions.hpp`、`src/main.cpp` / `src/tui/tui_init.cpp`(deny 规则)、`src/tool/builtin_tool_registry.hpp`、`src/tool/tool_executor.cpp`(预览)、`src/tool/tool_icons.hpp`、`src/tool/diff_utils.hpp`(hunk `file` 字段)、`src/session/tool_metadata_codec.cpp`、`src/tui/diff_view.cpp`、`src/tui/confirm_question.cpp`、`src/hooks/hook_runtime.cpp`、`src/session/session_resume_restore.cpp`;Web `lib/diff.js`、`lib/sessionChanges.js`、`lib/transcriptProjection.js`、`lib/permissionToolPreview.js`、`components/ChangeReview.jsx` + i18n 目录。
- 协议:`tool_end.hunks[]` 与持久化 `metadata.tool_hunks[]` 的每个 hunk 新增可选 `file` / `additions` / `deletions` 字段(只在多文件结果里出现,老客户端忽略即可);`apply_patch` 结果 `metadata.files[]` 列出每个文件的 `path` / `type` / `move_path` / `additions` / `deletions`。
- 测试:新增 `tests/tool/apply_patch_format_test.cpp`、`tests/tool/apply_patch_tool_test.cpp`、`tests/tool/model_family_test.cpp`、`tests/agent_loop/agent_loop_apply_patch_test.cpp`;扩展 system_prompt / permissions / builtin registry / tool preview / hooks 测试;Web 端扩展 permissionToolPreview / transcriptProjection / sessionChanges 测试。
- 文档:CLAUDE.md 新增「GPT 系模型适配」一节;docs/hooks.md 别名说明更新。
