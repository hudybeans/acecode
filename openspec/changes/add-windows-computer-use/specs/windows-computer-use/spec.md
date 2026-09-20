## Purpose

为 ACECode 提供由用户明确开启的 Windows 桌面操控能力，让模型能够发现和观察真实应用窗口，再基于最新观察执行可取消的鼠标、键盘和控件操作，同时保持关闭状态的实际能力隔离。

## ADDED Requirements

### Requirement: Explicit feature switch
系统 SHALL 在内置工具设置中显示“电脑操控（实验性）”，英文为“Computer Use (Experimental)”，默认关闭并持久化；当前仅 Windows 支持开启。

#### Scenario: Default disabled and stale calls
- **WHEN** 配置未开启或用户关闭开关
- **THEN** 后续模型请求不包含电脑操控工具，历史或伪造调用被拒绝，活动执行器被撤销。

#### Scenario: Supported settings
- **WHEN** Windows 用户开启开关后重启应用
- **THEN** 开关仍开启且工具可用，其他平台显示不支持且不能开启。

#### Scenario: Built-in tool row alignment
- **WHEN** 设置页面同时显示浏览器、图像生成、电脑操控和摘要生成
- **THEN** 电脑操控与相邻工具使用相同的图标、文字起点、列表分隔及右侧操作边界，不能因嵌套容器产生额外缩进。

### Requirement: Configurable themed pointer
系统 SHALL 在电脑操控行提供“配置”按钮，展开两种带预览的指针样式：主题色且右下角显示 ACE 的指针，以及不带文字的纯主题色指针。默认选择带 ACE 的样式；样式持久化且可在工具关闭时配置，不会因此启用工具。

#### Scenario: Select and restore a pointer style
- **WHEN** 用户选择任一样式并重新打开设置或重启应用
- **THEN** 保持已保存的选择，实际 Windows 指针和截图使用相同样式，切换不会改变既有开关状态。

#### Scenario: Follow the current theme
- **WHEN** 当前主题的强调色变化
- **THEN** 两种预览和后续实际操控指针使用相同主题色，默认蓝色主题显示蓝色；配置失败时不能假装保存成功。

### Requirement: Observe and operate Windows applications
系统 SHALL 提供应用与窗口发现、应用启动、窗口状态和截图、可访问性控件、激活、点击、文字输入、按键、滚动、拖拽、控件赋值和辅助动作；不可用能力 SHALL 返回明确错误。

#### Scenario: Observe and act
- **WHEN** 模型获取窗口状态后以 observation_id 对该窗口执行动作
- **THEN** 动作使用该观察返回的截图像素或控件索引，并正确映射到屏幕物理位置，成功后要求重新观察。

#### Scenario: Stale or sensitive state
- **WHEN** 窗口已变化、句柄身份变化、观察已消耗或控件为密码字段
- **THEN** 系统拒绝过期动作，且不会把密码值写入观察文本。

#### Scenario: Screenshot fidelity
- **WHEN** 请求窗口截图
- **THEN** 返回实际尺寸、原点和捕获来源，不能把其他窗口遮挡像素伪装为目标窗口内容。

#### Scenario: Visible computer-use pointer
- **WHEN** 电脑操控定位或操作目标界面
- **THEN** 用户能够看到操作指针；返回截图中的指针与相应截图坐标、缩放和窗口归属一致，不绘制属于其他窗口的指针，也不使显示反馈抢占输入。

#### Scenario: Application identity and input compatibility
- **WHEN** 通过发现的应用标识启动后重新列出应用，或使用 Codex 文档中的按键名称及控件索引
- **THEN** 运行窗口关联到可验证的同一应用标识，支持约定的 keysym 和数字键盘别名，并在点击前验证目标元素的可点击点没有被其他控件遮挡。

#### Scenario: Related transient surfaces
- **WHEN** 主窗口打开可验证归属的菜单、下拉框或拥有的弹层
- **THEN** 同一次观察提供带独立截图标识、尺寸和坐标映射的相关画面，动作根据选定截图或控件所属界面路由；不能只因同一进程或线程而纳入无关窗口。

#### Scenario: Transient state changes before input
- **WHEN** 观察后的菜单、弹层归属、前台窗口或键盘菜单状态发生变化
- **THEN** 拒绝使用过期状态输入并要求重新观察；保持已观察弹层时不能因重复激活主窗口而关闭菜单。

### Requirement: Owned and cancellable desktop execution
系统 SHALL 将桌面执行绑定到调用会话，串行化同一桌面的操控，并在取消、回合结束、关闭开关和进程退出后释放资源。写操作 SHALL 遵守现有权限审批，Plan 模式不能执行写操作。

#### Scenario: Concurrent sessions
- **WHEN** 另一会话已持有桌面控制
- **THEN** 新会话收到占用提示而不会交错发送输入。

#### Scenario: Interrupted or hung execution
- **WHEN** 操作被取消或原生执行器超时
- **THEN** 停止执行器，返回取消或超时结果，后续调用不能继续使用旧观察。
