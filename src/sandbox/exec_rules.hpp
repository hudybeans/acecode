#pragma once

// exec 规则文件(openspec add-auto-mode-sandbox,与 Codex execpolicy 的 `.rules`
// 互通的子集)。
//
// 语法(Starlark 子集,手写解析,不引入解释器):
//
//     # 注释
//     prefix_rule(
//         pattern = ["git", ["commit", "add"]],   # 有序 token;列表项 = 任一相等
//         decision = "allow",                     # allow(默认) / prompt / forbidden
//         justification = "why",                  # 可选
//         match = ["git commit -m x"],            # 可选,加载时校验必须命中
//         not_match = ["git push"],               # 可选,加载时校验必须不命中
//     )
//     host_executable(name = "git", paths = ["/usr/bin/git"])   # 整条忽略
//
// 任何其它语法、缺 pattern、非法 decision、match/not_match 校验失败 → 该文件
// **整体**跳过(不部分生效)并记 LOG_WARN。加载位置:全局 `<data_dir>/rules/*.rules`,
// 项目 `<cwd>/.acecode/rules/*.rules`。项目作用域的 allow 降级为 AllowSandboxed:
// 免确认但不绕过沙盒 —— 项目文件不可信,不能凭它把命令放到沙盒外。

#include "command_classifier.hpp"

#include <string>
#include <vector>

namespace acecode::sandbox {

enum class RuleScope { Global, Project };

enum class RuleDecision {
    NoMatch,
    Allow,            // 全局 allow:免确认,绕过沙盒
    AllowSandboxed,   // 项目 allow:免确认,仍在沙盒内
    Prompt,
    Forbidden,
};

const char* rule_decision_name(RuleDecision d);

struct PrefixRule {
    // pattern[i] 是第 i 个 token 的候选集合(单字符串 = 只有一个候选)。
    std::vector<std::vector<std::string>> pattern;
    RuleDecision decision = RuleDecision::Allow;   // 只会是 Allow / Prompt / Forbidden
    std::string justification;
    RuleScope scope = RuleScope::Global;
    std::string source_file;
};

struct RuleMatch {
    const PrefixRule* rule = nullptr;
    RuleDecision decision = RuleDecision::NoMatch;   // 已按作用域降级
};

struct RuleEvaluation {
    RuleDecision decision = RuleDecision::NoMatch;   // 整体决策(逐段取最严格)
    std::vector<RuleMatch> matches;                  // 命中的规则(所有段)
    std::string justification;                       // 第一条决定性规则的说明
};

struct ParsedRulesFile {
    std::vector<PrefixRule> rules;
    std::string error;   // 非空 = 整文件跳过的原因
};

// 解析一份规则文件内容。scope / source_file 会写进每条规则。
ParsedRulesFile parse_rules_text(const std::string& text, RuleScope scope,
                                 const std::string& source_file);

class ExecRules {
public:
    // 从 `<global_dir>/*.rules` 与 `<project_dir>/*.rules` 加载;目录不存在即空。
    // 解析失败的文件记 LOG_WARN 并跳过。
    static ExecRules load(const std::string& global_rules_dir,
                          const std::string& project_rules_dir);

    void add_rule(PrefixRule rule) { rules_.push_back(std::move(rule)); }
    bool empty() const { return rules_.empty(); }
    std::size_t size() const { return rules_.size(); }
    const std::vector<PrefixRule>& rules() const { return rules_; }
    const std::vector<std::string>& skipped_files() const { return skipped_files_; }

    // 单段匹配:所有命中规则里最严格的决策(已按作用域降级)。
    RuleEvaluation evaluate_segment(const CommandSegment& segment) const;
    // 多段:逐段评估,整体取最严格;只有每段都是 allow(任一作用域)才算 allow,
    // 且只要有一段是 AllowSandboxed,整体就是 AllowSandboxed。
    RuleEvaluation evaluate(const std::vector<CommandSegment>& segments) const;
    RuleEvaluation evaluate(const CommandClassification& command) const;

private:
    std::vector<PrefixRule> rules_;
    std::vector<std::string> skipped_files_;
};

// 单条规则是否命中一段命令(首 token 允许 basename 回退,大小写不敏感)。
bool prefix_rule_matches(const PrefixRule& rule, const CommandSegment& segment);

} // namespace acecode::sandbox
