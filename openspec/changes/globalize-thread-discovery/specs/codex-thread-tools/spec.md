## Purpose

让模型通过 ACECode 内置会话查询工具发现、读取和等待所有工作区中的会话，将工作区信息作为会话属性，同时维持有界输出、归档规则和准确的目标身份。

## ADDED Requirements

### Requirement: 跨全部 ACECode 项目列举会话

`list_threads` SHALL 查询当前 ACECode 数据目录下全部项目中的持久化会话及当前运行时的活跃会话，不以调用方 cwd、工作区注册状态或界面可见性作为筛选条件。工具 SHALL 返回目标的 `workspaceHash`、`cwd` 和 `noWorkspace` 属性，并保留子代理的 `parentThreadId`。

#### Scenario: 不同工作区与无工作区会话
- **WHEN** 调用方位于一个工作区，其他会话位于隐藏项目、没有工作区注册文件的项目或无工作区缓存目录
- **THEN** 这些会话均可以被列举，且没有 cwd 的调用方也可列举

#### Scenario: 归档会话的显式查询
- **WHEN** 调用方传入 `includeArchived=true`
- **THEN** 归档会话也可被列举；省略此参数仍只返回未归档会话

#### Scenario: 置顶顺序与普通会话翻页
- **WHEN** 全局普通会话数量超过 `limit`
- **THEN** 返回可续读的 `nextCursor`，普通会话每页不超过 limit，全部有效置顶会话仍按各项目 pin 顺序返回且不占普通名额

### Requirement: 全局读取和等待会话

`read_thread` 与 `wait_threads` SHALL 使用全局 ACECode 会话身份定位目标，支持跨工作区的磁盘及活跃会话，并保持原有 turn 分页、输出上限、事件游标和等待语义。工具 SHALL 接受列表返回的 `workspaceHash` 作为可选目标定位信息。

#### Scenario: 读取另一个项目的历史
- **WHEN** 传入另一个项目中会话的 threadId
- **THEN** 返回该会话历史，且归档会话及子代理会话也能被明确读取

#### Scenario: 等待另一个项目的活跃会话
- **WHEN** `wait_threads` 指向另一个项目中的活跃会话
- **THEN** 返回该目标的真实状态和事件游标，不报告为当前工作区不可用

#### Scenario: 跨项目同 ID
- **WHEN** 相同 threadId 存在于多个项目且未提供 workspaceHash
- **THEN** 返回歧义错误；提供列表返回的 workspaceHash 后读取指定项目的会话

### Requirement: 工具描述与实际查询范围一致

查询工具描述 SHALL 明确支持全部 ACECode 工作区，不引导模型把当前工作区作为隐式查找边界，并说明列表续页及归档参数。

#### Scenario: 模型发现查询工具
- **WHEN** 运行时构造 list_threads、read_thread 与 wait_threads 的工具定义
- **THEN** 描述声明跨工作区能力，参数中包含实现支持的续页和目标定位字段
