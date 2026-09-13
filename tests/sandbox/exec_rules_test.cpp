#include <gtest/gtest.h>
#include "sandbox/exec_rules.hpp"

using namespace acecode::sandbox;

// 场景:全局 allow 了 `bash`,模型执行 `bash -c 'echo $UNTRUSTED'`;另有
// `curl` forbidden,模型用 `sudo curl` 包一层。期望:不透明脚本不能借外层
// allow 放行;forbidden 穿透 sudo 包装仍生效。
TEST(ExecRules, OpaqueNestedScriptCannotBorrowWrapperAllow) {
    ExecRules rules;
    auto parsed = parse_rules_text("prefix_rule(pattern=[\"bash\"], decision=\"allow\")",
                                  RuleScope::Global, "global.rules");
    ASSERT_TRUE(parsed.error.empty());
    rules.add_rule(parsed.rules.front());
    const auto classification = classify_command("bash -c 'echo $UNTRUSTED'", CommandPlatform::Posix);
    EXPECT_FALSE(classification.split_safely);
    EXPECT_EQ(rules.evaluate(classification).decision, RuleDecision::NoMatch);
    auto denied = parse_rules_text("prefix_rule(pattern=[\"curl\"], decision=\"forbidden\")",
                                  RuleScope::Global, "global.rules");
    rules.add_rule(denied.rules.front());
    EXPECT_EQ(rules.evaluate(classify_command("sudo curl url", CommandPlatform::Posix)).decision, RuleDecision::Forbidden);
}

// 场景:Codex 语法的 pattern 并集(`["status","diff"]`)+ match / not_match
// 校验。期望:解析成功,`git.exe diff` 经 basename 回退命中,`git commit` 不命中。
TEST(ExecRules, ParsesAlternativesAndChecksExamples) {
    const auto parsed = parse_rules_text(R"(
        # Codex-compatible prefix rules
        prefix_rule(pattern=["git", ["status", "diff"]], match=["git status"], not_match=["git push"])
    )", RuleScope::Global, "example.rules");
    ASSERT_TRUE(parsed.error.empty()) << parsed.error;
    ASSERT_EQ(parsed.rules.size(), 1u);
    EXPECT_TRUE(prefix_rule_matches(parsed.rules[0], {{"git.exe", "diff"}}));
    EXPECT_FALSE(prefix_rule_matches(parsed.rules[0], {{"git", "commit"}}));
}

// 场景:同一文件中存在非法规则。期望:不能只保留前面的 allow。
TEST(ExecRules, RejectsWholeFileOnInvalidSyntaxOrExamples) {
    for (const char* tail : {"prefix_rule(pattern=['b'], decision='maybe')",
         "prefix_rule(pattern=['git'], match=['curl x'])",
         "prefix_rule(pattern=['git'], not_match=['git status'])",
         "prefix_rule(pattern=['b'], decision='forbidden', decision='allow')"}) {
        const auto parsed = parse_rules_text(std::string("prefix_rule(pattern=['a'])\n") + tail,
            RuleScope::Global, "bad.rules");
        EXPECT_FALSE(parsed.error.empty());
        EXPECT_TRUE(parsed.rules.empty());
    }
}

// 场景:全局 allow git、项目 forbidden git push、项目 allow pnpm。期望:多规则
// 取最严格;多段命令须每段都 allow,含项目 allow 的整体降级为 AllowSandboxed,
// 有一段没命中就是 NoMatch;forbidden 穿透 `bash -c` 包装。
TEST(ExecRules, AppliesStrictestDecisionAndProjectScope) {
    ExecRules rules;
    rules.add_rule({{{"git"}}, RuleDecision::Allow, "", RuleScope::Global, ""});
    rules.add_rule({{{"git"}, {"push"}}, RuleDecision::Forbidden, "no push", RuleScope::Project, ""});
    rules.add_rule({{{"pnpm"}}, RuleDecision::Allow, "", RuleScope::Project, ""});
    EXPECT_EQ(rules.evaluate(classify_command("git status")).decision, RuleDecision::Allow);
    EXPECT_EQ(rules.evaluate(classify_command("git status && pnpm test")).decision, RuleDecision::AllowSandboxed);
    EXPECT_EQ(rules.evaluate(classify_command("git status && unknown-tool")).decision, RuleDecision::NoMatch);
    EXPECT_EQ(rules.evaluate(classify_command("git push")).decision, RuleDecision::Forbidden);
    EXPECT_EQ(rules.evaluate(classify_command("bash -c 'git push'", CommandPlatform::Posix)).decision, RuleDecision::Forbidden);
}

// 场景:allow 前缀后追加重定向或命令替换。期望:不可凭前缀授权整段不透明脚本。
TEST(ExecRules, DoesNotAllowOpaqueScriptsByPrefix) {
    ExecRules rules;
    rules.add_rule({{{"echo"}}, RuleDecision::Allow, "", RuleScope::Global, ""});
    EXPECT_EQ(rules.evaluate(classify_command("echo x > outside")).decision, RuleDecision::NoMatch);
    EXPECT_EQ(rules.evaluate(classify_command("echo $(custom-script)", CommandPlatform::Posix)).decision, RuleDecision::NoMatch);
}
