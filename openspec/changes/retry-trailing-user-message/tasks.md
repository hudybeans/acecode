## 1. 后端重试

- [x] 1.1 增加 AgentLoop 串行重试入口及原消息复用，C++ 定向测试验证角色末尾、消息身份、并发拒绝和结构化输入保留。
- [x] 1.2 接入 SessionClient 和重试 API，更新 daemon-api 文档，编译并验证请求校验及返回状态。

## 2. 输入框接入

- [x] 2.1 完整 transcript 末尾判定及提交时复核接入共享发送入口，前端测试验证按钮/Enter 同规则、禁止跳过非用户条目及状态边界。

## 3. 集成验证

- [x] 3.1 完成前端 pnpm test、pnpm build、C++ 定向测试、OpenSpec 严格校验和 git diff --check，记录验证边界并检查无关改动保留。

## 4. 用户中断后重发

- [x] 4.1 后端持久化用户中断标记并校验重试身份，按模型真实末尾复用或追加原始输入，覆盖输出前、部分输出、工具后、中断历史恢复与过期资格。
- [x] 4.2 前端识别明确中断标记，等待后端结束后启用空输入发送，覆盖完整历史、按钮/Enter 和状态边界。
- [x] 4.3 更新 API 文档并完成前端测试/构建、C++ 定向测试、OpenSpec 严格校验和差异检查。

## 用户中断扩展验证记录

- `pnpm test`、`pnpm build` 通过，生产产物正则兼容性检查通过。
- `cmake --build build --config Release --target acecode_unit_tests --parallel 6` 通过。
- C++ 定向回归 34 项通过，覆盖重试、插话、目标中断、回合计时/差异、trajectory、skill、历史恢复及 HTTP 入口。
- Playwright 挂载真实 InputBar 并使用实际 transcript reducer，24 项按钮、Enter、中断确认、历史恢复、禁止状态和 390px 中英文检查通过，无页面错误。
- 中断后收到的剩余 token 与持久化部分回复不会产生重复回复或重复中断提示；旧中断标记回放不会重新启用已完成回合的重试。
- `openspec validate retry-trailing-user-message --strict`、`git diff --check` 通过。未改动其他任务的功能，ChatView 的本任务改动仅涉及 `abortPending` 取值和重试判断。
- 验证范围为源码、Web 构建、浏览器及本地 C++ 测试；没有重新打包或替换已安装 Desktop。

## 原始变更验证记录

- `pnpm test`、`pnpm build` 通过，生产产物正则兼容性检查通过。
- `cmake --build build --config Release --target acecode_unit_tests --parallel 6` 通过。
- `AgentLoopUserMessageRetry.*:AgentLoopTurnSteering.*:AgentLoopTrajectoryTest.*:WebServerHttp.RetryLastUserMessage*` 共 15 项通过。
- Playwright 挂载真实 InputBar，13 项按钮、Enter、状态边界及 390px 中英文检查通过，无页面错误。
- `openspec validate retry-trailing-user-message --strict`、`git diff --check` 通过。无关已修改文件哈希不变，daemon-api 原有改动保留。
- 验证范围为源码、Web 构建、浏览器及本地 C++ 测试；没有重新打包或替换已安装 Desktop。
