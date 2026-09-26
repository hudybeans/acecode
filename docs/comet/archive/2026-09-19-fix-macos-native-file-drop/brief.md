# 目标

修复 macOS 桌面端从 Finder 将本地文件或文件夹释放到 ACECode 输入框时，原生层已取得路径、但输入框因缺失 DOM hover 状态而拒绝接收的问题；以实际释放坐标选择唯一目标，在不干扰普通键盘输入、中文输入法和粘贴的前提下完成一次插入。

# 范围

- 核对当前 native bridge、composer/terminal 接收逻辑和诊断日志是否符合 `docs/desktop-shell/macos-file-drop-handoff.md` 的交接状态。
- macOS 原生 drop 回调附带不含隐私信息的实际释放位置；前端据此命中当前可见、可用且未被遮挡的 composer 或 terminal 目标。
- 有有效坐标的 macOS Finder drop 不再依赖 DOM hover 时间戳；Windows、Linux、网页内部拖放和无坐标的兼容路径保持原行为。
- 保留必要的阶段、坐标有效性、目标选择和 materialize 结果诊断，但不记录路径、输入内容或异常正文。
- 添加纯 helper 回归测试，并执行前端测试、前端构建、相关原生构建或可用的编译验证。

## Source coverage

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1：交接文档“User request and current status” | complete | 继续修复 Finder drop；不得回退到破坏输入的实验方案 | `specs/macos-native-file-drop/spec.md` 的输入安全要求 | A1 | covered | 当前有效目标 |
| S2：交接文档“Evidence from the user's latest test” | complete | 原生路径提取和桥接成功，拒绝发生于 composer hover gate，尚未 materialize | `specs/macos-native-file-drop/spec.md` 的实际落点路由要求 | A2 | covered | 根因证据，指导针对性修复 |
| S3：交接文档“Not yet proven” | complete | 不把 typing 根因、DOM drag 缺失原因或 hover/copy 反馈当成已证明事实 | `specs/macos-native-file-drop/spec.md` 的兼容与非目标要求 | A1、A5 | covered | 保留不确定性，不扩大结论 |
| S4：交接文档“Current implementation / retained changes” | complete | 保持基线 swizzle 与 legacy callback，保留诊断及独立 lipo 修复，不恢复 runtime subclass | `specs/macos-native-file-drop/spec.md` 的输入安全和兼容要求 | A1、A4 | covered | 当前代码核对基线 |
| S5：交接文档“Proposed next implementation”第 1-6 项 | complete | 传递释放位置、坐标转换、命中唯一未遮挡目标、坐标 drop 绕过 hover、隐私诊断、边界/兼容测试 | `specs/macos-native-file-drop/spec.md` 的全部功能要求 | A1-A5 | covered | 本 change 的实现范围 |
| S6：交接文档“Proposed next implementation”第 7 项 | complete | 实机先验证输入再验证 Finder；drop 成功与 hover/copy 反馈分开 | `specs/macos-native-file-drop/spec.md` 的验证要求 | A1、A5 | covered | hover/copy 改进不作为本轮 drop 修复完成条件 |
| S7：交接文档“Build and verification already completed” | complete | 旧验证只作为历史背景，新候选实现必须重新测试 | — | — | background | 不把旧构建结果用于新候选实现 |
| S8：交接文档“Working tree safety / conventions” | complete | 保留无关修改，不提交/推送，不停止、替换或启动 ACECode，不改 vendored | `specs/macos-native-file-drop/spec.md` 的操作安全要求 | A6 | covered | 当前任务明确约束 |

# 非目标

- 不恢复 `object_setClass`、运行时实例子类、生命周期 capability flag 或此前撤回的侵入式方案。
- 不在本轮承诺修复原生 drag hover 样式或绿色 copy cursor；它们与最终 drop 成功分开验证。
- 不支持 Mail/Photos 等 file promise；本轮仅处理 Finder 提供的本地 file URL。
- 不自动退出、重启、替换或启动当前 ACECode，不覆盖 `/Applications/ACECode.app`，不提交或推送。
- 不修改独立的 macOS portable lipo 修复或其他无关工作区改动。

# 验收示例

- Scenario: 输入能力不受修复影响
  - GIVEN macOS 桌面端已安装文件拖放处理
  - WHEN 用户在 composer 中输入 ASCII、中文输入法文本或粘贴文本
  - THEN 输入事件继续由原有 WKWebView/responder 路径处理，修复不使用 `object_setClass` 或改写输入相关类
- Scenario: Finder 文件在 composer 实际落点插入一次
  - GIVEN native drop payload 含有效释放坐标和至少一个本地路径
  - WHEN 坐标命中可用、可见且未被遮挡的 composer
  - THEN composer 不依赖 DOM hover 时间戳，materialize 路径并只插入一次
- Scenario: 非法或错误落点不进入 composer
  - GIVEN native drop 坐标缺失、越界、命中侧栏/预览/模态遮罩，或 composer 已禁用
  - WHEN 前端路由该 drop
  - THEN composer 不 materialize 文件且记录不含路径的拒绝阶段
- Scenario: 唯一目标和兼容行为
  - GIVEN composer 与 terminal 接收函数同时存在
  - WHEN native drop 的实际坐标只命中其中一个目标
  - THEN 最多一个目标接收；无坐标 payload、Windows、Linux 和非文件 WebKit 拖放保持既有行为
- Scenario: 坐标边界与页面缩放
  - GIVEN AppKit 使用 view-local point、Retina backing scale 或 WebView 页面缩放
  - WHEN native 坐标转换为前端 viewport 坐标
  - THEN 命中逻辑使用一致的 viewport 比例并正确处理上下边界和翻转方向
- Scenario: 运行期间不干扰当前 ACECode
  - GIVEN 修复、测试和构建正在当前 ACECode 会话中进行
  - WHEN Agent 完成自动验证
  - THEN 不自动退出、重启、启动或替换任何 ACECode 实例或已安装应用

# 约束与不变量

- 输入可靠性优先于 drag hover/cursor 反馈。
- 不调用 `object_setClass`，不改变 WKWebView 实例的运行时 class。
- 最终 drop 使用释放时坐标重新命中，不以陈旧 hover 状态授权。
- 命中须基于 `document.elementFromPoint` 的最上层元素，避免透过模态框或其他覆盖层接收。
- 路径只在现有本地 materialization/insertion 路径中使用；日志不得包含路径、文件内容、键值或异常正文。
- 不回退、不清理、不覆盖工作区内与本 change 无关的用户修改。

# 决策

- 沿用当前 class-wide native swizzle 基线，仅扩展 drop payload；不采用 runtime subclass 或 `object_setClass`。
- 原生层传递 WebView 内的归一化释放坐标，前端按当前 `innerWidth`/`innerHeight` 还原 CSS viewport 坐标，以规避 Retina backing pixel 与页面缩放直接换算。
- 前端使用共享纯 helper 对坐标和最上层 DOM 元素做命中，并把 payload 路由给唯一 receiver；有坐标的 macOS payload不使用 hover gate，无坐标 legacy payload继续使用原规则。
- composer 以 `.ace-composer-card` 作为 eligible target；terminal 以实际 `.ace-console-term` 容器作为 eligible target。

# 待解决问题

- 无阻塞问题；用户已明确要求针对性修复、禁止 `object_setClass`、输入优先且不得自动重启当前 ACECode。

# 验证预期

- 纯 helper 测试覆盖有效坐标、缺失/越界坐标、边界、遮挡、disabled、唯一目标和 legacy fallback。
- 运行完整 `web` 测试与 production build。
- 运行 `git diff --check`，并在现有 macOS 构建环境可用时编译 desktop target；构建不得启动或替换应用。
- 自动测试不能代替真实 Finder/AppKit、ASCII、中文输入法和粘贴验证；最终报告明确保留这项人工验证。
