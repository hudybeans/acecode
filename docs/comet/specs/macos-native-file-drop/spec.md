# macOS 原生文件拖放

## 输入安全

macOS 文件拖放处理必须沿用当前 WKWebView class-wide swizzle 基线，不得通过 `object_setClass`、运行时实例子类或输入相关 responder 替换改变 WebView 实例类型。普通 ASCII 输入、中文输入法和粘贴必须继续经过原有输入路径。

### Scenario: 输入路径保持不变

- GIVEN 文件拖放处理已安装
- WHEN 用户键入、使用输入法组合或粘贴文本
- THEN 文件拖放代码不改写 WKWebView 实例 class，也不接管键盘或文本输入事件

## 实际落点路由

macOS Finder file URL 的最终 drop payload 必须包含 WebView 内实际释放位置。前端必须在 drop 时重新命中最上层 DOM 元素，并最多选择一个 eligible target，不得以旧 hover 时间戳作为带坐标 drop 的授权条件。

### Scenario: composer 接收带坐标 drop

- GIVEN payload 含本地路径和有效 viewport 归一化坐标
- AND 最上层元素位于可见、启用的 `.ace-composer-card` 内
- WHEN 前端路由最终 drop
- THEN 只调用 composer receiver 一次
- AND composer materialize 并插入路径，不要求 DOM drag hover 已激活

### Scenario: 错误目标被拒绝

- GIVEN payload 的坐标越界、命中 composer 外部、命中覆盖层，或 composer 不可用
- WHEN 前端路由最终 drop
- THEN 不向 composer materialize 路径
- AND 诊断只记录坐标有效性、目标和结果，不记录路径或输入内容

## 唯一目标与兼容性

composer 和 terminal 可同时注册，但带坐标 drop 最多交付给命中的一个目标。无坐标 legacy payload、Windows native drop、Linux URI drop 和非文件 WebKit 拖放保持现有行为。

### Scenario: terminal 与 composer 不重复接收

- GIVEN composer 与 terminal receiver 同时存在
- AND 实际释放坐标只命中其中一个 eligible target
- WHEN native bridge 分发 payload
- THEN 仅命中的 receiver 被调用

### Scenario: legacy payload 保持兼容

- GIVEN receiver 收到不含坐标的既有路径数组
- WHEN 平台或旧 bridge 使用 legacy callback
- THEN 各 receiver 继续使用现有 hover gate，且其他平台行为不改变

## 坐标转换

原生层必须从 `draggingLocation` 获取释放点，转换到当前 WebView bounds，处理 flipped 坐标方向，并将坐标归一化后传给前端。前端按实时 viewport 尺寸还原 CSS 坐标，避免把 Retina backing pixel 直接当作 CSS pixel。

### Scenario: 归一化坐标跨缩放命中

- GIVEN WebView bounds、backing scale 或页面 viewport 尺寸不同
- WHEN native drop 点转换为归一化坐标并由前端还原
- THEN 左、上、右、下边界使用一致的半开区间规则
- AND 有效内部点命中对应的最上层 DOM 元素

## 操作安全

自动实现和验证不得退出、重启、启动或替换当前 ACECode，不得覆盖已安装应用，不得提交或推送，也不得修改与本 change 无关的工作区文件。

### Scenario: 自动验证不干扰运行实例

- GIVEN Agent 在当前 ACECode 会话中构建和测试候选实现
- WHEN 自动验证完成
- THEN 当前 ACECode 进程与已安装应用未被自动停止、启动或替换
