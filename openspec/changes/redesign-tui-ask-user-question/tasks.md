# Tasks: redesign-tui-ask-user-question

## 1. 基线与配置

- [x] 1.1 重新读取并记录当前 `TuiState`、`main.cpp` ask 路由、`tui_ask_channel`、overlay、配置和测试接线，识别可删除的旧 ask 字段与不应影响的共享 channel 契约。
- [x] 1.2 在 `src/config/config.*` 增加 `tui.question_min_visible_rows`（默认 4，范围 [2,12]）与 `tui.question_selection_feedback_ms`（默认 200，范围 [0,1000]）的加载、sparse-on-write、一次性警告和单测。
- [x] 1.3 更新 TUI 配置文档/示例，说明两个字段、默认值、边界和非法值处理。
- [x] 1.4 新增跨端 `ask.max_questions` 配置（默认 10，范围 [1,50]），完成加载、钳制、sparse-on-write、文档和单测。
- [x] 1.5 让 AskUserQuestion 工具 schema 与运行时校验统一使用 `ask.max_questions`，覆盖 TUI、daemon 和 headless 注册路径。
- [x] 1.6 增加默认上限、自定义上限、超限错误及“模型自行分批”语义的回归测试。

## 2. 纯领域模块

- [x] 2.1 新增 UTF-8 多行行内编辑器核心（文本、codepoint 边界、光标、选区、替换、删除、逐行移动、Home/End、剪切/粘贴），并编写纯单元测试。
- [x] 2.2 新增问答领域模型：显式答案变体、题目页/汇总页、焦点、编辑、滚动偏移、推荐项标记、来源和已校验配置快照。
- [x] 2.3 新增规范化领域事件与语义效果接口；实现单题快问、多题自动推进、汇总导航、单选/多选、自定义草稿与结果顺序。
- [x] 2.4 实现键盘优先级、数字快捷键、局部 Esc/双击 Esc、全局取消和反馈锁定；覆盖状态转换矩阵。
- [x] 2.5 实现 timeout/feedback deadline 事件处理和逐题收卷规则，含无推荐项、空激活自定义项、非空草稿和自动选择标记测试。

## 3. 纯布局与交互命中

- [x] 3.1 新增从只读控制器快照生成的布局模型：双列标题/说明、UTF-8 折行、推荐标记、自定义行、汇总、动态帮助、来源和 toast。
- [x] 3.2 实现动态视口、最小可见行数、逻辑滚动偏移钳制、滚动条几何、焦点/光标/选区自动可见与 resize 重布局。
- [x] 3.3 实现字符单元格命中区域，覆盖预设/自定义点击、文本点击定位、拖选和滚动条拖动所需的布局数据。
- [x] 3.4 实现极窄终端安全降级与最小安全尺寸提示；补充窄宽、长文本、中文/混排、滚动边界、命中和 resize 纯测试。

## 4. FTXUI 与 TUI channel 适配

- [x] 4.1 在 `src/tui/` 建立活跃问答会话对象，持有控制器、来源、固定 timeout deadline、反馈 deadline、toast 与双击状态；保持 FIFO 占用与释放语义。
- [x] 4.2 将 FTXUI 键盘、鼠标、滚轮、resize 和非阻塞 tick 规范化为领域事件；以同一命中区域 500ms 判定双击。
- [x] 4.3 执行控制器效果：非阻塞 tick/deadline、系统剪贴板复制成功/失败 toast、滚动条拖动、重绘和终端过窄期间输入暂停。
- [x] 4.4 改造 `ask_via_tui_overlay`，由会话对象替换对旧 `TuiState` ask 字段的直接读写，并继续返回既有 `{cancelled, timed_out, answers}` response。
- [x] 4.5 将结构化完成结果映射为既有工具结果和 TUI 本地紧凑 Q/A 转录，正确显示 `Not answered` 与 `[Auto-selected]`；取消保持失败语义。
- [x] 4.6 在 `main.cpp` 替换旧 ask 渲染/事件分支为适配器挂接，移除旧 Other composer 耦合与重复状态，确保普通 prompt 在问答期间隐藏且结束后恢复。

## 5. 构建、测试与验证

- [x] 5.1 将纯 controller/editor/layout 源码加入 `acecode_testable`，新增或重写对应 GoogleTest 文件，确保不依赖 FTXUI 屏幕、真实时钟或真实剪贴板。
- [x] 5.2 增加少量 TUI 集成回归：channel 等待/唤醒、原始事件规范化、500ms 双击、clipboard 成败 toast、timeout 与 FIFO 队列。
- [x] 5.3 执行 focused C++ tests、`acecode_unit_tests`、`ctest --output-on-failure` 及 `scripts/code_quality_check.bat`；记录并诊断任何非本变更基线失败。
- [ ] 5.4 手动验证：单题/多题、5题请求、预设/自定义、多选、汇总、鼠标、滚动、resize、极窄终端、timeout、子任务来源和取消入口。

## 6. 真实交互验收后的界面修正

- [x] 6.1 更新 `docs/specs/2026-09-07-tui-ask-user-question-requirements.md` 与本 change 的 `specs/tui-ask-user-question/spec.md`：四列对齐模型、已选无底色、题目/答案/解释字重、汇总 Q/A 两列对齐、面板几何与着色、参数名隐藏、结构化快捷键帮助。
- [x] 6.2 重构选项与汇总列布局：编号列、标记列、标题列、说明列四列固定边界，自定义项补单选/多选标记，列间距 2 个 ASCII 空格，标题列按最长标题收紧。顺带修掉窄宽度下换行的零进度死循环，并让换行保持 ASCII 单词完整、行首不出现收尾标点。
- [x] 6.3 抽出可单测的 overlay 渲染器（`src/tui/ask_question_panel.*`）并接入 `main.cpp`：面板底部锚定、限制在聊天视口矩形内、仅面板自身着色（`borderStyled` 只染边框，不再对容器整体 `color()`）、题目/答案/解释分色。
- [x] 6.4 把终端光标绑定到自定义文本真实插入点元素（移除面板级 `focus`，改用插入点自身的 `focusCursorBlock`），覆盖空文本、已有文本、多行、滚动与 resize。
- [x] 6.5 结构化快捷键帮助：键名主文字色、功能弱化色、`:` 分隔，使用真实按键符号（`↑↓` `←→` `Enter` `Esc` `Space` `Tab` `Ctrl+Enter` `PgUp/PgDn`）。
- [x] 6.6 汇总页两列块顶部对齐、答案列共用同一左边界、包含问题文本、块间空行，宽度不足时降级为上下堆叠；转录改为 `序号. 问题：答案` 成对输出。
- [x] 6.7 阻止参数名暴露：AskUserQuestion 不再生成通用参数摘要、TUI 对问答结果走专用展示分支（不受 Ctrl+E/Ctrl+O 影响）、历史会话忽略旧摘要。
- [x] 6.8 补齐视觉与行为回归测试：`tests/tui/ask_question_panel_test.cpp`（面板几何、着色作用域、列对齐、标记、字重、光标坐标、汇总排版、帮助分层）、`ask_question_layout_test.cpp` 扩写、`ask_question_view_test.cpp` 重写，以及工具/回放/格式测试更新。
- [x] 6.9 定向编译 `acecode_unit_tests` 与 `acecode`；问答相关 110 项测试全通过，全量 3911 项通过（3 项非本变更的基线/环境失败见下）；用 `verify-package --target tui` 生成并校验 staging 包（13 项全 PASS，staging 位于 `build/windows-x64-dev/verify-package-staging`）。
- [ ] 6.10 人工验证本轮的 11 项界面问题全部不再复现。

## 7. 第二轮真实交互验收后的修正

- [x] 7.1 面板绘制前对自身矩形做字符级擦除（`clear_under`）。此前只用 `bgcolor` 设背景色，未写字的格子保留聊天文字，表现为 `POSTto d`、`DELETE题` 这类标签混入、以及模型切换通知的片段出现在选项行尾。
- [x] 7.2 移除面板内的全局状态行（`AskQuestionLayoutInput::toast` 与 `Toast`/`Origin` 行类型）。模型切换通知属于顶部标题区，不再被塞进提问框，也不再让面板高度随无关事件变化。
- [x] 7.3 帮助区保留固定最小行数（2 行），使进入/离开行内编辑、单选/多选切换不再改变聊天视口高度，从而不再带动面板位移。
- [x] 7.4 回归测试：`PanelErasesChatContentUnderneath`（去掉 `clear_under` 时确认变红）、`PanelDoesNotRenderTheGlobalStatusLine`、`HelpLineHeightIsStableAcrossInteractionStates`、`ToggleFocusedClearsSelectedSingleChoiceOption`、`ToggleWithoutSubmitOnCustomRowStartsInlineEditing`、`CustomRowIsTheClickTargetForInlineEditing`。

### 6.9 记录：非本变更的基线失败

全量运行中固定失败 2 项、偶发失败 1 项，均与本轮改动无关：

- `AgentLoopGoal.ResumeAfterAbortClearsStaleAbortAndContinues`：`turn_count >= 2` 断言，纯时序竞态（200ms provider 延迟 + 50ms abort 窗口）。**已做对照实验**：把本轮对该文件的唯一改动（interrupted 分支的 `has_value()` 空值保护）临时还原后重新编译，该用例仍然同样失败，故确认为既有基线问题。
- `TcpProbe.TimeoutOnUnreachableHost`：依赖「不可达主机」的网络前提，本机探测返回 Ok，属环境问题。
- `AgentLoopTurnSteering.InterruptStartsStructuredTurnBeforeOrdinaryQueue` / `WebServerHttp.SessionSlashExpansionHonorsExplicitExpertSkillScope`：全量并发下偶发失败，单独运行通过，属时序/端口抖动。

另注：该构建树的增量头文件依赖不可靠（`tests/**` 的 `.obj` 不会因头文件变更重建），改动共享头文件后必须删除相应 `.obj` 再编译，否则会出现静默的 ABI 不一致（表现为 `0xC0000409` 栈缓冲区越界）。
