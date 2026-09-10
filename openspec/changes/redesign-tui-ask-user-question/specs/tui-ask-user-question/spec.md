# tui-ask-user-question Spec

## ADDED Requirements

### Requirement: TUI 问答使用独立且可测试的交互模块

TUI SHALL 使用独立问答会话、纯问答控制器、纯 UTF-8 行内编辑器和纯布局/命中计算实现 AskUserQuestion。控制器 MUST 接收不依赖 FTXUI 的规范化领域事件、暴露只读状态快照并产生语义效果；它 MUST NOT 依赖 FTXUI 类型、系统时钟、系统剪贴板、原始鼠标坐标、channel 或持久化。`main.cpp` SHALL 仅负责 TUI 事件循环、适配与渲染挂接，不得继续拥有问答业务状态机。

#### Scenario: 纯控制器可脱离终端测试

- **WHEN** 单元测试向控制器提供固定问题、配置、领域事件和终端尺寸
- **THEN** 测试无需创建 FTXUI 屏幕、系统时钟或剪贴板即可观察状态快照和完成效果

#### Scenario: TUI 请求使用独立会话对象

- **WHEN** 一个 AskUserQuestion 请求进入 TUI 队列并成为活跃请求
- **THEN** 一个会话对象 SHALL 持有该请求的控制器、已校验配置、来源、deadline 与临时反馈状态，完成后销毁并允许 FIFO 中下一请求激活

### Requirement: 单题快问与多题汇总流程

TUI SHALL 对单题请求使用快问模式：完成当前答案后直接提交，且不显示汇总页或题间导航。对 2–4 题请求，TUI SHALL 在每题完成后自动进入下一题；最后一题完成后进入只读汇总页。汇总页 SHALL 逐题显示当前答案或 `Not answered`，并支持 Enter 提交、Esc 取消、Left/Shift+Tab 回最后题、Right/Tab 回第一题；Up/Down MUST 不响应。

#### Scenario: 单题数字快捷提交

- **WHEN** 单选题只有一题且用户按对应预设项数字
- **THEN** TUI 选中该项并直接完成请求，不显示汇总页

#### Scenario: 多题完成后汇总

- **WHEN** 多题请求的最后一题完成
- **THEN** TUI 自动进入汇总页，且 Enter 提交整套答案

### Requirement: 预设与自定义答案语义

预设项 SHALL 显示为数字、选择标记、标题列和说明列。单选未选/已选标记分别为 `( )` / `(*)`，多选为 `[ ]` / `[x]`。标题列 SHALL 使用正常前景色，说明列 SHALL 使用弱化前景色，并在自身列折行。推荐项 SHALL 显示 `[Recommended]` 但不得自动选中。

自定义项 SHALL 位于预设项后，并使用“预设项数量 + 1”的数字编号。空且未选中时 SHALL 显示 `Type your own answer here`。单选题选择自定义项 MUST 清除预设选择；改选预设项 MUST 取消自定义激活但保留草稿。多选题可同时保留预设项和激活的非空自定义补充。提交时预设 label 按显示顺序输出，非空自定义文本最后追加；没有有效答案时 SHALL 输出 `Not answered`。

#### Scenario: 单选保留非激活草稿

- **WHEN** 用户在单选题中输入自定义文本后选择预设项
- **THEN** 自定义文本保留为非激活草稿且不提交；重新激活自定义项后该文本恢复为有效答案

#### Scenario: 多选追加自定义说明

- **WHEN** 用户在多选题中选择多个预设项并激活非空自定义文本
- **THEN** response 中预设 label 按显示顺序在前，自定义文本在最后

### Requirement: 行内 UTF-8 编辑与按键优先级

问答激活时 TUI SHALL 隐藏普通 prompt 输入并在自定义项行内编辑。编辑器 MUST 支持 UTF-8 安全的普通输入、Left/Right、Up/Down、Home、End、Backspace、Delete、Shift+方向键选区、Ctrl+Enter 换行、Ctrl+X 剪切和 Ctrl+V 粘贴。编辑态中的 `j`、`k`、`y` MUST 被视为普通文本；Ctrl+C MUST 取消问答而不是复制。

预设项焦点中，单选 Space 切换选择但不前进，Enter/预设数字选中后提交；多选 Space 切换，Enter/预设数字确保目标选中后提交且数字不得取消已选项。输入普通字符时，单选 SHALL 清空预设并进入自定义编辑，多选 SHALL 保留预设并进入编辑。自定义编号进入编辑但不得将编号写入文本；无对应选项的数字 SHALL 成为自定义文本首字符。

#### Scenario: 编辑态方向键不导航

- **WHEN** 自定义多行文本处于编辑态且用户按 Up 或 Down
- **THEN** 编辑器移动光标行，题目焦点和题目页不改变

#### Scenario: 预设项普通字符启动自定义回答

- **WHEN** 单选预设项获得焦点且用户输入普通字符
- **THEN** TUI 清除预设选择、激活自定义项、进入编辑，并将该字符插入草稿

### Requirement: 取消、复制与鼠标行为

编辑态 Esc SHALL 在非空草稿时退出编辑并保留激活，在空草稿时取消自定义激活。非编辑题目页 Esc SHALL 清除当前题选择（多选保留非激活草稿）并保持焦点。一秒内连续两次 Esc、Shift+X、问答期间 Ctrl+C、及汇总页 Esc SHALL 取消整个请求；取消 MUST 映射为现有失败语义并明确告知模型。

预设项焦点按 `y` SHALL 请求复制 `<label> <description>`；成功或失败均 SHALL 显示约两秒的非阻塞 toast。自定义项焦点的 `y` SHALL 作为文本输入。布局 MUST 为交互区域提供字符单元格命中区域；适配器 SHALL 以同一命中区域 500ms 内两次点击判定双击。预设项单击切换，双击确保选中并提交；自定义项双击等同连续两次单击且不提交。右键仅在存在文本选区时复制。

#### Scenario: 局部 Esc 后双击取消

- **WHEN** 非编辑题目页用户按 Esc，随后在一秒内再次按 Esc
- **THEN** 第一次 Esc 先按题目规则清除选择，第二次 Esc 取消整个问答

#### Scenario: 剪贴板失败

- **WHEN** 复制效果无法写入系统剪贴板
- **THEN** 问答状态不改变，TUI 显示失败 toast 并可继续交互

### Requirement: 动态视口、滚动与尺寸安全性

TUI SHALL 按当前终端字符行列动态计算题目页和汇总页视口，不得使用固定像素阈值。内容超过视口时 SHALL 显示可拖动滚动条。题目页 SHALL 支持滚轮、拖动滚动条、PageUp 和 PageDown；汇总页 SHALL 支持滚轮和拖动条。PageUp/PageDown 到边界 MUST 停留且不得改变题目或焦点。布局/适配器 SHALL 保证焦点项、编辑光标和选区可见。

resize 时，TUI MUST 保留答案、焦点、编辑器光标/选区和逻辑滚动位置，并将偏移钳制到新范围。极窄终端 MUST 优先保留编号、选择标记和标题，说明可压缩、折行或省略；低于安全最小尺寸时 MUST 显示终端过窄提示并暂停题目交互。

#### Scenario: resize 保留编辑状态

- **WHEN** 用户正在编辑自定义文本且终端尺寸改变
- **THEN** 文本、光标和选区保留，布局重新计算并使光标保持可见

### Requirement: 非阻塞选中反馈与超时收卷

预设项通过 Enter、数字或双击提交时 SHALL 显示可配置的选中反馈后前进；自定义文本提交 SHALL 立即前进。反馈等待 MUST 非阻塞，期间除全局取消外的问答输入 MUST 被忽略。timeout 策略未启用时 MUST 无限等待；启用时必须显示实时倒计时，截止时间从问答出现起固定且任何操作不得重置。

timeout 到期时，TUI MUST 对每题保留有效预设或已完成自定义答案；激活且非空的草稿 MUST 作为用户答案；激活但为空的自定义项 MUST 成为 `Not answered`；真正无有效答案的题目仅在存在 Recommended 预设项时自动选择该题第一个 Recommended 项，否则保持 `Not answered`。本地紧凑 Q/A 转录 MUST 区分普通用户答案、`Not answered` 与 `[Auto-selected]`。

#### Scenario: timeout 保留进行中的草稿

- **WHEN** timeout 到期时用户已激活自定义项且草稿非空但尚未按 Enter
- **THEN** TUI 将草稿作为用户答案提交，而不是自动选择推荐项

#### Scenario: 没有推荐项时不伪造答案

- **WHEN** timeout 到期且题目没有有效答案也没有 Recommended 预设项
- **THEN** 该题结果为 `Not answered`

### Requirement: TUI 配置校验

系统 SHALL 支持 `tui.question_min_visible_rows`，默认 4、合法范围 [2,12]，以及 `tui.question_selection_feedback_ms`，默认 200、合法范围 [0,1000]。`question_min_visible_rows` 是当前可见内容行数的最小目标值；实际空间不足时 MUST 按当前终端视口降级，不得强行撑大问答面板。配置加载层 MUST 在非法值时统一钳制到默认或边界并通过既有配置警告日志输出一次诊断；控制器 MUST 只接收已校验配置。

#### Scenario: 非法反馈时长

- **WHEN** 配置的 `question_selection_feedback_ms` 超过 1000
- **THEN** 加载层将它钳制到合法范围并输出一次配置警告，运行中的问答不显示错误

### Requirement: 既有异步通道和队列兼容

重设计后的 TUI MUST 保留 `ToolContext::ask_user_questions` 及其 response 结构作为唯一异步工具边界。多个请求 SHALL 严格 FIFO；子任务请求 SHALL 在状态/帮助区域显示创建时注入的来源文本，主会话请求不得显示来源。TUI 适配器 SHALL 将结构化完成结果映射为现有 response JSON，并在关闭后生成本地紧凑转录；控制器不得直接格式化转录或访问 channel。

#### Scenario: FIFO 请求连续展示

- **WHEN** 当前请求完成、取消或 timeout 收卷时队列中还有另一个请求
- **THEN** 当前会话释放后下一请求按入队顺序激活

#### Scenario: 用户取消保持失败结果

- **WHEN** 用户通过任一全局取消入口关闭问答
- **THEN** channel response 标记取消，工具沿用既有失败结果，不伪造每题 `Not answered` 的成功回答
