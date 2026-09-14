# PR #48 审查记录

审查基线：`dfebe5cb2eee22e1f1c18e4371ded97d8a5ca2c0`。
集成验证基线：本地 master `a8288ec25c7fc296929869cf2b0fc7e6688d4a04`。

## 发现的问题

1. **P1：滚动条覆盖选项的鼠标命中区域。** `ask_question_panel.cpp` 将整个内容区传给 scrollbar 的 `reflect`。出现内容溢出时，适配器优先把区域内点击判定为滚动条，选项无法正常选择。
2. **P1：TUI channel 丢失原始问题 ID。** 响应使用问题展示文本作为 `question_id`。主题确认使用独立的 wire ID，回答无法关联到请求；两个同文案问题也需要按位置保留不同 ID。该处还与 master 已有的 ID 修复发生合并冲突。
3. **P2：手动滚动被焦点自动滚动覆盖。** 每次布局都强行滚回焦点行，滚轮、翻页和拖动无法浏览焦点之外的长内容。
4. **P2：长自定义答案的光标离开可视区。** 布局追踪整个自定义答案末尾，向上移动光标仍显示末尾；软换行边界也需要唯一的光标归属行。另在 32、50、72 列复现文本刚好占满一行时光标落到滚动条区域，编辑状态需预留一格插入位置。
5. **P2：自定义项点击取消行为错误。** 编辑中再次点击不会取消选中；多选题取消自定义项还会清空其他预设答案。草稿应保留，其他预设选择不应受影响。
6. **P2：退出编辑后多行自定义答案重复显示。** 布局为每一行填入完整答案，而非对应的文本片段。
7. **P2：首行为空时 Home 和上移定位错误。** 光标位于第 0 字节时反向搜索包含当前位置的换行，错误地将首行起点算作第 1 字节。
8. **P2：窄屏汇总页答案行无法点击。** 纯布局命中支持 `SummaryAnswer`，生产帧适配器遗漏此分支，无法从答案行回到对应题目。
9. **P2：重绘打断双击 Esc。** 布局回写滚动偏移使用普通 dispatch，误清除连续 Esc 状态，退出长答案编辑后不能可靠地再次 Esc 取消。
10. **P2：大整数配置钳制错误。** JSON 整数先转换为 `int`，再限制范围；例如 `4294967296` 被转换为 0，题目上限错误地降到 1，反馈延时也变成 0。

## 验证约束

- 自动回归覆盖实际控制器、布局、会话、FTXUI 渲染几何和 TUI channel。
- 保留原任务 5.4、6.10 的人工验收未完成状态；离屏渲染测试不代替真实终端鼠标与 resize 验收。

## 已完成验证

- 修改前：13 项回归测试全部失败，覆盖上述 10 类问题以及主题确认的端到端通道。
- 修改后：`acecode_unit_tests --gtest_filter=*Ask*:ThemeDraftsTest.*:AgentLoopTurnSteering.*` 共 183 项全部通过，包括长答案光标、满行光标、软换行边界 resize 和轮次切换测试。
- `cmake --build build --config MinSizeRel --target acecode acecode-desktop --parallel 4 -- /p:CL_MPCount=4` 成功。
- OpenSpec 严格验证、暂存区与工作区 `git diff --check` 通过。
- 仓库 `.bat` 质量检查在当前 Windows 环境解析失败（`EQU` / `可能过长`）；使用同一仓库 `.sh` 脚本的 LF 副本完成检查，保留其既有提示。

## 全量测试及对照结果

`ctest --test-dir build -C MinSizeRel --output-on-failure --parallel 4 --timeout 120` 共发现 4329 项：4301 项通过、6 项跳过、1 项禁用、21 项失败。串行复查后，其中 19 项通过：远程控制用例争用固定端口 28611，补丁工具用例共用进程内序号生成的临时目录。这些测试文件及对应功能不属于 PR #48 的改动。

剩余两项分别处理如下：

- `AgentLoopTurnSteering.InterruptStartsStructuredTurnBeforeOrdinaryQueue` 的前置条件存在竞态：轮次激活不代表首个 provider 请求已经开始，提前中断后替代请求可能是第 1 次调用，测试却等待第 2 次。已增加首个请求开始的同步等待，保留替代请求必须在 250ms 内开始、操作耗时低于 350ms 的断言，最终 183 项定向测试全部通过。
- `SpawnSubagentTool.ChildSharesParentWorktreeWithWriteBoundary` 的断言在约 10 秒后通过，但 CTest 收尾超时。串行运行仍出现；本次审查前的 Release 测试二进制也复现相同现象，该二进制不包含新的 AskQuestionController 测试。保留为既有测试进程收尾问题，未将全量结果标记为全绿。

测试期间临时将 `agent_loop.cpp` 还原为 master 对照过轮次切换用例，之后已恢复 PR 的空 `tool_summary` 保护并重新构建验证。原先的人工终端验收任务继续保持未完成。
