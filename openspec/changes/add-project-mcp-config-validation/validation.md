# 验证记录

验证环境为 Windows、MSVC 19.39、Release 构建。worktree 使用独立 build 和 web/node_modules；CMake 复用主 checkout 已安装的 vcpkg 依赖库，不复用其构建输出。

## 编译与单元测试

- `cmake --build build --config Release --target acecode_unit_tests acecode --parallel 4` 通过，已嵌入本次生产前端构建。
- 以下定向回归共 251 项，全部通过：

```text
build/tests/Release/acecode_unit_tests.exe --gtest_filter=*Mcp*:*MCP*:*ConfigRecovery*:*ConfigMutation*:*ConfigFirstInit*:*Expert*:*TextFileBuffer*:*ApplyPatch*:*FileWrite*:*FileEdit*:*ManagementCenterRender*
```

覆盖严格字段/传输校验、Windows 换行与 NUL、整数数值语义、隐藏凭证保留、同名项目覆盖和工具调用隔离、专家连接保留、过期连接结果、无效写入不落盘、快照写入失败撤销、项目 JSON 损坏恢复、仅恢复公共 MCP 段、主目录仓库边界、迁移数据目录、API 编辑与 TUI 渲染。

## 前端与浏览器

- `pnpm i18n:catalog`、`pnpm test`、`pnpm build` 全部通过，生成目录由脚本更新。
- 本地 Chrome + 隔离 Vite 测试页面，使用模拟 API：390px/1280px × 中文/英文，四组均设置减少动画并通过。
- 验证项目切换、请求范围、无效草稿保留、阻止无效草稿切换范围、完整 Schema 展开、修正后保存、公共配置保持独立、无效 JSON 也可查看 Schema；未出现页面异常或页面横向溢出。
- 使用 Ajv 独立编译发布的配置 Schema，对合法配置、错误参数类型、嵌入/结尾换行等样例验证一致。

## 实际进程验证

使用本 worktree 的 acecode.exe、两个测试 MCP 子进程、独立临时用户数据目录及项目目录运行 daemon，没有连接已安装客户端或现有 daemon。

- 所有 MCP 路由在跨 loopback origin 且缺少认证令牌时均拒绝请求。
- 公共配置与两个项目的同名覆盖均可保存并热应用，项目能力目录显示正确实例与工具数。
- 无效写入返回完整 Schema，活动文件和公共配置保持原值。
- 项目文件损坏后 reload 恢复有效快照；项目开关不影响另一项目。
- daemon 重启时恢复无效公共 MCP 段，保留同时修改的其他设置。
- headless 清单使用项目配置；无有效回退的错误项目以非零退出码和结构化 Schema 诊断结束。

## 范围

OpenSpec 严格校验与 `git diff --check` 通过。此次运行的是定向 C++ 测试、完整前端测试和 Windows 构建/进程验证；未运行全部 C++ 测试套件，也未验证 macOS/Linux 或已安装 Desktop 包。变更保留在 codex/mcp-core worktree 中供审查。
