# Tasks: redesign-tui-ask-user-question

## 1. 基线与配置

- [x] 1.1 重新读取并记录当前 `TuiState`、`main.cpp` ask 路由、`tui_ask_channel`、overlay、配置和测试接线，识别可删除的旧 ask 字段与不应影响的共享 channel 契约。
- [x] 1.2 在 `src/config/config.*` 增加 `tui.question_min_visible_rows`（默认 4，范围 [2,12]）与 `tui.question_selection_feedback_ms`（默认 200，范围 [0,1000]）的加载、sparse-on-write、一次性警告和单测。
- [x] 1.3 更新 TUI 配置文档/示例，说明两个字段、默认值、边界和非法值处理。

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
- [ ] 5.4 手动验证：单题/多题、预设/自定义、多选、汇总、鼠标、滚动、resize、极窄终端、timeout、子任务来源和取消入口。
