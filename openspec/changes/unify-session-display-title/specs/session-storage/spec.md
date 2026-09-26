## ADDED Requirements

### Requirement: 会话摘要取显示文本并限制为单行 80 字节

会话元数据的 `summary` MUST 由最近一条可见用户消息的显示文本生成:消息带非空白的 `metadata.display_text` 时以它为准,否则用 `content`。生成结果 MUST 是单行(换行 / 制表 / 连续空白折成一个空格,首尾空白丢弃),超过 80 字节时 MUST 在 UTF-8 字符边界截断并补 `...`;英文文本 SHOULD 在 60~80 字节区间内的词边界断开。内存中的会话摘要与从 JSONL 补齐旧元数据得到的摘要 MUST 使用同一实现。

#### Scenario: @session 引用展开后的消息

- **WHEN** 用户消息的 `content` 是引用展开后的长文本,`metadata.display_text` 是用户敲的原文 `@规划 AgentLoop 文件拆分与目录结构 继续`
- **THEN** `summary` MUST 等于该原文,而不是以 `Referenced ACECode session context follows` 开头的展开文本

#### Scenario: 中文长输入

- **WHEN** 用户消息显示文本为 200 个汉字
- **THEN** `summary` 长度 MUST 不超过 83 字节、以 `...` 结尾,且截断点落在汉字边界

#### Scenario: 多行输入

- **WHEN** 用户消息显示文本为 `  第一行\r\n\n\t第二行   结尾  \n`
- **THEN** `summary` MUST 为 `第一行 第二行 结尾`

#### Scenario: 旧元数据补齐

- **WHEN** `.meta.json` 没有 `summary`,会话列表打开 JSONL 补齐
- **THEN** 补齐结果 MUST 与内存摘要口径一致(显示文本优先、同样的截断规则)
