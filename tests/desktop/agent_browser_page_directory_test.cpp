// 本文件覆盖 desktop/agent_browser_page_directory 的页面归属簿记:
//
// 1. owner 解析与序列化(合法字段、非法字符、空 owner → null)。
// 2. 工具省略 page_id 时的目标解析:按会话 agent target > 同会话显示页 > 新建;
//    旧协议(无 owner)沿用全局显示页。
// 3. 关闭页面后的显示页回退与 agent target 迁移。
// 4. 回归:daemon 为后台会话建页不改变显示页(用户正在看的页面不会被挤掉)。

#include <gtest/gtest.h>

#include "desktop/agent_browser_page_directory.hpp"

using namespace acecode::desktop;

namespace {

AgentBrowserPageOwner owner_of_session(const std::string& session_id,
                                       const std::string& workspace = "ws-a") {
    AgentBrowserPageOwner owner;
    owner.session_id = session_id;
    owner.workspace_hash = workspace;
    return owner;
}

} // namespace

// 触发场景:代理请求 / bridge 参数里的 owner 对象走各种形态。
// 期望行为:合法字段原样保留;非对象、缺 session_id、含非法字符或超长的输入
// 一律解析成空 owner;空 owner 序列化为 null 而不是空对象,让前端能区分「未绑定」。
TEST(AgentBrowserPageOwner, ParsesAndSerializesDefensively) {
    const auto parsed = parse_agent_browser_page_owner({
        {"session_id", "20260915-120207-bdf9"},
        {"workspace_hash", "68951b50df177045"},
        {"root_session_id", "20260915-120000-aaaa"},
    });
    EXPECT_EQ(parsed.session_id, "20260915-120207-bdf9");
    EXPECT_EQ(parsed.workspace_hash, "68951b50df177045");
    EXPECT_EQ(parsed.root_session_id, "20260915-120000-aaaa");
    EXPECT_FALSE(parsed.empty());

    const auto round_trip = agent_browser_page_owner_json(parsed);
    EXPECT_EQ(round_trip.value("session_id", ""), parsed.session_id);
    EXPECT_EQ(round_trip.value("workspace_hash", ""), parsed.workspace_hash);
    EXPECT_EQ(round_trip.value("root_session_id", ""), parsed.root_session_id);

    EXPECT_TRUE(parse_agent_browser_page_owner(nullptr).empty());
    EXPECT_TRUE(parse_agent_browser_page_owner("session").empty());
    EXPECT_TRUE(parse_agent_browser_page_owner({{"workspace_hash", "x"}}).empty());
    EXPECT_TRUE(parse_agent_browser_page_owner(
                    {{"session_id", "bad id/with slash"}}).empty());
    EXPECT_TRUE(parse_agent_browser_page_owner(
                    {{"session_id", std::string(129, 'a')}}).empty());
    // session_id 合法但附带字段非法:附带字段丢弃,归属仍然成立。
    const auto partial = parse_agent_browser_page_owner(
        {{"session_id", "s1"}, {"workspace_hash", "has space"}});
    EXPECT_EQ(partial.session_id, "s1");
    EXPECT_TRUE(partial.workspace_hash.empty());
    EXPECT_TRUE(agent_browser_page_owner_json(AgentBrowserPageOwner{}).is_null());
}

// 触发场景:会话 A 经 browser_open 建了一页并成为 A 的 agent target;之后 A 的
// 工具省略 page_id。
// 期望行为:解析到 A 自己的页,而不是全局显示页;显式 page_id 原样返回,不做
// 归属判断(跨会话显式操作沿用 shared 门禁)。
TEST(AgentBrowserPageDirectory, ResolvesOmittedPageIdToSessionTarget) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    const auto b = owner_of_session("b");
    directory.add_page("p-b", b, true);
    directory.set_displayed_page("p-b");
    directory.add_page("p-a", a, true);

    const auto resolved = directory.resolve_agent_page("", a);
    EXPECT_EQ(resolved.page_id, "p-a");
    EXPECT_FALSE(resolved.create);
    EXPECT_EQ(directory.resolve_agent_page("p-b", a).page_id, "p-b");
    EXPECT_TRUE(directory.is_agent_target("p-a"));
    EXPECT_TRUE(directory.is_agent_target("p-b"));
    EXPECT_EQ(directory.agent_target_for(a), "p-a");
}

// 回归测试:引入归属前,省略 page_id 的工具取全局 active page。用户在会话 B 的
// 页签里浏览时,会话 A 的 browser_click 会落到 B 的页面上(操作串页)。
// 触发场景:显示页属于 B,A 没有自己的页面,A 的工具省略 page_id。
// 期望行为:解析结果要求新建,而不是命中 B 的页。
TEST(AgentBrowserPageDirectory, NeverFallsBackToAnotherSessionsDisplayedPage) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    const auto b = owner_of_session("b");
    directory.add_page("p-b", b, false);
    directory.set_displayed_page("p-b");

    const auto resolved = directory.resolve_agent_page("", a);
    EXPECT_TRUE(resolved.page_id.empty());
    EXPECT_TRUE(resolved.create);
}

// 触发场景:用户在会话 A 里手工新建了一页(不是 agent target)并正在看它,然后让
// AI 读「这个页面」,工具省略 page_id。
// 期望行为:命中当前显示页,因为它属于同一会话;这保留了引入归属前「读当前页」
// 的直觉用法。
TEST(AgentBrowserPageDirectory, PrefersDisplayedPageOfSameSessionWhenNoTarget) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    directory.add_page("p-user", a, false);
    directory.set_displayed_page("p-user");

    const auto resolved = directory.resolve_agent_page("", a);
    EXPECT_EQ(resolved.page_id, "p-user");
    EXPECT_FALSE(resolved.create);
}

// 触发场景:旧版 daemon 的请求不带 owner。
// 期望行为:保持旧行为 —— 有显示页就用显示页,没有就新建;它们不参与任何会话
// 的 agent target 簿记。
TEST(AgentBrowserPageDirectory, LegacyRequestsWithoutOwnerUseDisplayedPage) {
    AgentBrowserPageDirectory directory;
    EXPECT_TRUE(directory.resolve_agent_page("", {}).create);
    directory.add_page("p-1", {}, true);
    EXPECT_TRUE(directory.owner_of("p-1").empty());
    EXPECT_FALSE(directory.is_agent_target("p-1"));
    EXPECT_TRUE(directory.resolve_agent_page("", {}).create);
    directory.set_displayed_page("p-1");
    EXPECT_EQ(directory.resolve_agent_page("", {}).page_id, "p-1");
}

// 回归测试:引入归属前,daemon 建页会立刻把新页设为全局 active,用户正在看的别的
// 会话的页面被 apply_bounds 隐藏,表现为内容区突然空白。
// 触发场景:显示页属于 B,daemon 为 A 建页。
// 期望行为:目录里显示页仍是 B 的页;A 的页只成为 A 的 agent target。
TEST(AgentBrowserPageDirectory, AddingAgentPageDoesNotChangeDisplayedPage) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    const auto b = owner_of_session("b");
    directory.add_page("p-b", b, true);
    directory.set_displayed_page("p-b");
    directory.add_page("p-a", a, true);

    EXPECT_EQ(directory.displayed_page_id(), "p-b");
    EXPECT_EQ(directory.agent_target_for(a), "p-a");
    EXPECT_EQ(directory.page_ids_for_session("a"),
              std::vector<std::string>{"p-a"});
    EXPECT_EQ(directory.page_ids_for_session("b"),
              std::vector<std::string>{"p-b"});
    EXPECT_TRUE(directory.page_ids_for_session("").empty());
}

// 触发场景:会话 A 开了两页(第二页是 agent target),用户关闭正在显示的第二页。
// 期望行为:下一显示页回退到同会话最近的一页而不是别的会话的页;agent target
// 迁移到剩下的那一页;目录、显示页与 target 都不再引用已关闭的页。
TEST(AgentBrowserPageDirectory, ClosingDisplayedPagePrefersSameSessionSibling) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    const auto b = owner_of_session("b");
    directory.add_page("p-a1", a, true);
    directory.add_page("p-b", b, true);
    directory.add_page("p-a2", a, true);
    directory.set_displayed_page("p-a2");
    EXPECT_EQ(directory.agent_target_for(a), "p-a2");

    EXPECT_EQ(directory.next_displayed_after_close("p-a2"), "p-a1");
    // 关闭的不是显示页时,显示页保持不变。
    EXPECT_EQ(directory.next_displayed_after_close("p-a1"), "p-a2");
    directory.remove_page("p-a2");
    EXPECT_FALSE(directory.contains("p-a2"));
    EXPECT_TRUE(directory.displayed_page_id().empty());
    EXPECT_EQ(directory.agent_target_for(a), "p-a1");
    EXPECT_EQ(directory.ordered_page_ids(),
              (std::vector<std::string>{"p-a1", "p-b"}));

    // 会话最后一页关闭后 target 清空,再次省略 page_id 就要新建。
    directory.remove_page("p-a1");
    EXPECT_TRUE(directory.agent_target_for(a).empty());
    EXPECT_TRUE(directory.resolve_agent_page("", a).create);
    // 没有同会话页面时回退到全局最近一页。
    directory.set_displayed_page("p-b");
    directory.add_page("p-c", owner_of_session("c"), false);
    EXPECT_EQ(directory.next_displayed_after_close("p-b"), "p-c");
}

// 触发场景:显式 select 把 agent target 指到同会话另一页;以及指向未知页 / 无 owner。
// 期望行为:合法切换后 is_agent_target 只对新页为真;未知页与无 owner 拒绝。
TEST(AgentBrowserPageDirectory, ExplicitSelectMovesAgentTarget) {
    AgentBrowserPageDirectory directory;
    const auto a = owner_of_session("a");
    directory.add_page("p-1", a, true);
    directory.add_page("p-2", a, false);
    EXPECT_TRUE(directory.set_agent_target(a, "p-2"));
    EXPECT_FALSE(directory.is_agent_target("p-1"));
    EXPECT_TRUE(directory.is_agent_target("p-2"));
    EXPECT_FALSE(directory.set_agent_target(a, "missing"));
    EXPECT_FALSE(directory.set_agent_target({}, "p-1"));
    EXPECT_FALSE(directory.set_displayed_page("missing"));
    directory.clear();
    EXPECT_EQ(directory.size(), 0u);
    EXPECT_TRUE(directory.agent_target_for(a).empty());
}
