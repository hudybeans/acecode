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

TUI SHALL 对单题请求使用快问模式：完成当前答案后直接提交，且不显示汇总页或题间导航。对 2–N 题请求（N 为已校验的 `ask.max_questions` 值），TUI SHALL 在每题完成后自动进入下一题；最后一题完成后进入只读汇总页。汇总页 SHALL 逐题显示“问题＋答案”，未答显示 `Not answered`，并支持 Enter 提交、Esc 取消、Left/Shift+Tab 回最后题、Right/Tab 回第一题；Up/Down MUST 不响应。

汇总页 SHALL 按独立 Q/A 两列块排版：问题列与答案列顶部对齐并同时从该题第 1 行开始；单题占用行数取问题折行数与答案折行数的较大值，较短一侧剩余行留空，下一题不得提前顶上；每两题之间空一行。`：` SHALL 并入问题文本并紧跟问题最后一个字符，不单独成行也不单独成列。所有答案 SHALL 共用同一左边界，该边界由本页最宽的“问题＋：”加 2 个 ASCII 空格列间距决定。问题与答案 MUST 只在各自列内折行，折行 MUST NOT 拆分连续 ASCII 单词，续行 MUST 与所在列左边界对齐。面板宽度不足以维持两列时 SHALL 降级为上下堆叠，答案统一缩进到固定列。

#### Scenario: 单题数字快捷提交

- **WHEN** 单选题只有一题且用户按对应预设项数字
- **THEN** TUI 选中该项并直接完成请求，不显示汇总页

#### Scenario: 多题完成后汇总

- **WHEN** 多题请求的最后一题完成
- **THEN** TUI 自动进入汇总页，且 Enter 提交整套答案

### Requirement: 预设与自定义答案语义

选项行 SHALL 由四个固定槽位组成：编号列、选择标记列、标题列、说明列。整题内槽位列宽固定，所有选项共用同一组边界并逐列左对齐；编号与标记 MUST NOT 拼成同一字符串。标题列与说明列之间 SHALL 保留 2 个 ASCII 空格列间距，短标题 SHALL 在列内补齐以保持说明列左对齐；标题列 SHALL 按本题最长标题收紧，不固定占用屏幕比例。标题列 SHALL 使用主文字色且不加粗，说明列 SHALL 使用弱化前景色且不加粗，并在自身列折行，续行与列左边界对齐，任何内容 MUST NOT 越出面板。单选未选/已选标记分别为 `( )` / `(*)`，多选为 `[ ]` / `[x]`。推荐项 SHALL 显示 `[Recommended]` 但不得自动选中。

只有焦点行 SHALL 使用选中底色，且底色 MUST NOT 改变文字颜色或字重；已选中但非焦点的行 MUST NOT 使用任何底色，选中状态只通过选择标记表达。

自定义项 SHALL 位于预设项后，与其他选项共用同一组列边界，使用“预设项数量 + 1”的数字编号，并 SHALL 显示与其他选项对齐的选择标记。空且未选中时 SHALL 显示 `Type your own answer here`，其文本列左边界 SHALL 与预设项标题列完全一致。单选题选择自定义项 MUST 清除预设选择；改选预设项 MUST 取消自定义激活但保留草稿。多选题可同时保留预设项和激活的非空自定义补充。提交时预设 label 按显示顺序输出，非空自定义文本最后追加；没有有效答案时 SHALL 输出 `Not answered`。

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

### Requirement: AskUserQuestion 题目数量配置与分批

系统 SHALL 支持跨所有运行端统一使用的 `ask.max_questions` 配置，默认值为 10，合法范围为 1–50。配置文件缺失该字段时 SHALL 使用默认值；小于 1 的值 SHALL 钳制为 1，大于 50 的值 SHALL 钳制为 50，并通过既有配置警告日志输出诊断；非整数值 SHALL 忽略并保留默认值。保存配置时默认值 SHALL 遵循 sparse-on-write，不写入配置文件，非默认值 SHALL 写入 `ask.max_questions`。

AskUserQuestion 工具的公开 schema `maxItems` 与运行时校验 SHALL 使用同一个已校验上限。单次请求超过上限时，工具 SHALL 返回包含当前范围、实际题目数和“分多次调用”建议的明确错误；系统 MUST NOT 自动拆分请求，也 MUST NOT 自动合并多次问答，模型 SHALL 根据错误自行分批。该行为 SHALL 对 TUI、daemon、Web、Desktop 背后的 daemon 以及 headless 一致。

#### Scenario: 默认上限允许十道题

- **WHEN** 配置缺失 `ask.max_questions` 且模型请求 10 道合法题目
- **THEN** schema 与运行时校验均允许一次调用，TUI 按多题问卷流程展示

#### Scenario: 自定义上限统一生效

- **WHEN** 配置 `ask.max_questions` 为 3 且模型请求 4 道题
- **THEN** 所有运行端的 schema 声明上限为 3，运行时返回超限错误，并建议模型分多次调用

#### Scenario: 超限不由系统拆分

- **WHEN** 单次请求超过有效上限
- **THEN** 工具只返回失败结果，不展示部分题目、不提交部分答案，也不创建隐式的后续请求

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

### Requirement: 面板几何与着色

问答面板 SHALL 是聊天视口内的浮层，不得改变聊天视口自身尺寸。面板 MUST 固定在聊天视口底部，四边 MUST 落在聊天视口矩形内：不得向上越出聊天区，也不得覆盖输入框或底部状态栏。面板高度 SHALL 为“实际内容高度＋边框”并 MUST NOT 超过聊天视口高度，超出部分按动态视口规则滚动；面板宽度 MUST NOT 超过聊天视口宽度。

只有面板自己的矩形 SHALL 绘制底色与边框；面板以外的聊天内容 MUST 保持原有颜色，MUST NOT 被面板的前景色或底色整体染色。面板 SHALL 使用语义化主题色分别设置边框、题目、选项标题、选项说明、自定义输入、汇总与帮助，MUST NOT 通过父容器统一着色。

面板 MUST 擦除其矩形内的下层字符，而不只是设置背景色：仅设置背景色会让未被面板写字的格子保留聊天文字，表现为选项标签后多出字符或无关通知出现在提问框内。面板 MUST NOT 承载全局瞬时状态行；模型切换、更新提示等通知只出现在顶部标题区与底部状态区。面板高度 MUST 只由解题内容与超时提示决定，打开或关闭行内编辑、切换单选与多选 MUST NOT 改变面板高度或位置。

#### Scenario: 面板固定且不越界

- **WHEN** 问答面板在任意终端尺寸下打开
- **THEN** 面板四边均位于聊天视口内，底部与聊天视口底部对齐，面板高度不超过聊天视口高度

#### Scenario: 面板外聊天内容不被染色

- **WHEN** 问答面板打开且聊天区存在历史消息
- **THEN** 面板矩形之外的历史消息前景色与底色与面板关闭时一致

#### Scenario: 面板擦除下层内容

- **WHEN** 聊天区在面板矩形下方存在文本（例如模型切换通知或长段落）
- **THEN** 面板矩形内的任何格子都不显示这些字符，未使用的格子为空白

### Requirement: 题目与答案的视觉层次

问答面板内题目 SHALL 使用主文字色并加粗；选项标题与自定义答案文本 SHALL 使用主文字色且不加粗；说明文本 SHALL 使用弱化前景色且不加粗。焦点行 SHALL 只改变底色，MUST NOT 改变文字颜色与字重。

#### Scenario: 焦点行不改变字重

- **WHEN** 某个选项成为焦点行
- **THEN** 该行文字颜色与字重与失去焦点时相同，仅底色变化

### Requirement: 自定义输入光标

自定义答案行内编辑时，终端光标 MUST 绑定在自定义文本的真实插入点元素上，MUST NOT 绑定整个面板。光标位置 MUST 随文本、折行、滚动与终端尺寸变化同步更新，并在空文本、已有文本和多行文本下都可见。非编辑态 MUST NOT 让面板抢占终端光标。

#### Scenario: 空文本进入编辑

- **WHEN** 用户进入自定义答案编辑且文本为空
- **THEN** 终端光标位于自定义行文本列的起始位置，而不是面板其他位置

#### Scenario: 多行文本滚动后光标可见

- **WHEN** 多行自定义文本发生滚动或终端 resize
- **THEN** 光标仍位于当前插入点且处于面板可见区域内

### Requirement: 问答结果展示与参数隐藏

问答完成后 TUI 转录 SHALL 只展示结构化“问题＋答案”。展示文本 SHALL 由 `ask_user_question_result` 结构化元数据生成，MUST NOT 由原始工具参数生成。`question`、`header`、`options`、`description`、`multiSelect` 等参数字段名 MUST NOT 出现在转录中，也 MUST NOT 通过工具摘要间接泄漏。AskUserQuestion MUST NOT 生成通用参数摘要；存在结构化问答元数据时，转录 SHALL 优先展示问答结果文本。即使全局展开或逐行展开被打开，AskUserQuestion MUST NOT 回退到参数 JSON。历史会话恢复时，即使旧会话已写入不安全的工具摘要，也 MUST 忽略它并展示问答结果。转录 SHALL 按“每题一项”输出 `序号. %问题%：%答案%`，项与项之间空一行；浮层汇总页继续沿用独立的 Q/A 两列对齐规则。

#### Scenario: 参数名不出现在转录

- **WHEN** 一次 AskUserQuestion 成功完成并渲染转录
- **THEN** 显示内容包含问题与答案，且不包含 `header`、`options`、`multiSelect`、`description` 等字段名

#### Scenario: 历史会话忽略旧摘要

- **WHEN** 恢复的会话消息同时带有问答结果元数据与旧的通用工具摘要
- **THEN** 恢复后的转录展示问答结果，而不是旧摘要中的参数预览

### Requirement: 结构化快捷键帮助

底部帮助 SHALL 由“键名＋`: `＋功能”的独立片段组成。键名 SHALL 使用主文字色且不加粗，分隔符与功能说明 SHALL 使用弱化前景色；条目之间保留固定间隔，并 SHALL 在宽度不足时换行而不溢出面板。键名 MUST 忠实于键盘真实按键：方向键写作 `↑` `↓` `←` `→`，其他按键写作 `Enter`、`Esc`、`Space`、`Tab`、`Shift+Tab`、`Ctrl+Enter`、`PgUp`、`PgDn`、`Y`、`Shift+X`、`Ctrl+C`。帮助 MUST NOT 使用 `up/down`、`submit/cancel` 一类描述代替键名，同一按键只表达一个含义。

#### Scenario: 帮助条目分层且键名真实

- **WHEN** 题目页处于预设项焦点且为单选
- **THEN** 帮助条目形如 `↑↓: 移动焦点`、`Enter: 提交`，键名与功能使用不同样式

#### Scenario: 窄面板帮助不溢出

- **WHEN** 终端宽度不足容纳全部帮助条目
- **THEN** 条目换行显示且不超出面板宽度
