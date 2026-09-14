# add-gpt-apply-patch-adaptation — Tasks

## 1. 纯逻辑层

- [x] 1.1 `src/tool/model_family.{hpp,cpp}`:`detect_model_family` / `model_prefers_apply_patch` / `filter_tool_definitions_for_model`
- [x] 1.2 `src/tool/apply_patch_format.{hpp,cpp}`:补丁解析(信封 / Add / Delete / Update / Move / `@@` / EOF)、`derive_new_contents`(四级容错 seek、倒序替换)、`extract_target_paths`、`summarize_patch_headers`
- [x] 1.3 单测 `tests/tool/model_family_test.cpp`、`tests/tool/apply_patch_format_test.cpp`

## 2. apply_patch 工具

- [x] 2.1 `src/tool/apply_patch_tool.{hpp,cpp}`:参数(`input` / `patchText` / `patch`)、路径解析(cwd 相对 + scratch 别名)、全量校验、按序落盘(检查点 / 元数据保留 / MtimeTracker / LSP)、summary / hunks(带 file)/ metadata.files / scratch 排除
- [x] 2.2 `DiffHunk::file` + codec(`file` / `additions` / `deletions`)+ TUI diff_view 文件标题 + Web `hunksToUnifiedDiff` 分组
- [x] 2.3 `builtin_tool_registry` 注册;`tool_icons`;`build_tool_call_preview`;TUI 确认框文案
- [x] 2.4 单测 `tests/tool/apply_patch_tool_test.cpp`(add / update / delete / move / 相对路径 / 校验失败不落盘 / 检查点回调 / hunks & metadata)、registry / preview 测试扩展

## 3. AgentLoop 与权限

- [x] 3.1 请求组装:按当前模型过滤模型侧工具表(常规 + 紧急档)
- [x] 3.2 权限门:apply_patch 路径集合逐条过 exec-rules 保护 / deny 规则 / auto-allow / 写边界 / 危险路径 / Plan 模式
- [x] 3.3 `permissions.hpp`(内置 deny + Auto 放行)、`main.cpp` / `tui_init.cpp` deny 规则、hooks 别名
- [x] 3.4 单测:`tests/agent_loop/agent_loop_apply_patch_test.cpp`(gpt 模型得到 apply_patch 不得到 edit/write,非 gpt 反之)、permissions / hooks 测试扩展

## 4. 系统提示

- [x] 4.1 `SystemPromptModelState` + GPT 分支(apply_patch 指引替换 edit/write 指引、shell 指引改口、模型族行为段)
- [x] 4.2 AgentLoop 两处 `build_system_prompt` 调用传入模型态
- [x] 4.3 单测:GPT 态含 apply_patch 指引且不含 file_edit / file_write;非 GPT 态逐字节不变;GPT 态 byte-stable

## 5. 会话与前端

- [x] 5.1 `session_resume_restore`:apply_patch 写过的文件补 MtimeTracker 基线
- [x] 5.2 Web:`permissionToolPreview`(文件清单)、`transcriptProjection`(apply_patch 计入文件工具 / Patched 动词)、`sessionChanges`(无 hunk 回退到 metadata.files)、`ChangeReview` 空态文案 + i18n 目录
- [x] 5.3 Web 单测扩展;`pnpm test` / `pnpm build`

## 6. 收尾

- [x] 6.1 命令行 `cmake --build` 全量构建 + `acecode_unit_tests` 定向与全量回归
- [x] 6.2 CLAUDE.md「GPT 系模型适配」一节;docs/hooks.md 别名说明
