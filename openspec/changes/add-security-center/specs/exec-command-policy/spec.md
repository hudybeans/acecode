# exec-command-policy Spec (delta)

## ADDED Requirements

### Requirement: 托管规则文件重写
`exec_rules` SHALL 提供 `format_prefix_rule_full(rule)`(含 decision、justification 与候选并集 `["a", ["b", "c"]]`)与 `render_rules_file(rules)`;`write_rules_file(path, rules, error)` MUST 先对渲染结果 `parse_rules_text` 往返校验再原子落盘,校验失败不落盘。`default.rules` 与 `default.sandboxed.rules` 是仅有的托管文件(`is_managed_rules_file`)。

#### Scenario: 往返
- **WHEN** 规则含候选并集、justification 里带引号与反斜杠
- **THEN** 渲染 → 解析得到相同 pattern / decision / justification

#### Scenario: 空表
- **WHEN** 规则表为空
- **THEN** 文件被写成只含注释头的空规则文件,加载后无规则且无错误
