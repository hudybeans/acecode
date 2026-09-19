#include <gtest/gtest.h>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <random>

#include "computer_use/runtime.hpp"
#include "session/tool_result_storage.hpp"
#include "tool/computer_use_tool.hpp"

namespace {
using namespace acecode;

class ComputerUseTools : public testing::Test {
protected:
    void SetUp() override { computer_use::set_enabled(false); }
    void TearDown() override { computer_use::set_enabled(false); }
};

TEST_F(ComputerUseTools, DisabledByDefaultAndRemovedFromSchema) {
    ToolExecutor tools;
    AppConfig config;
    EXPECT_FALSE(config.computer_use.enabled);
    refresh_computer_use_tools(tools, config);
    EXPECT_FALSE(tools.has_tool("computer_list_windows"));
    EXPECT_FALSE(tools.execute("computer_click", "{}").success);
    config.computer_use.enabled = true;
    refresh_computer_use_tools(tools, config);
    EXPECT_EQ(tools.has_tool("computer_list_windows"), computer_use::supported());
    config.computer_use.enabled = false;
    refresh_computer_use_tools(tools, config);
    EXPECT_FALSE(tools.has_tool("computer_list_windows"));
    EXPECT_TRUE(tools.get_tool_definitions().empty());
}

TEST_F(ComputerUseTools, InFlightHandlerSnapshotCannotBypassDisabledSwitch) {
    auto snapshots = create_computer_use_tools();
    computer_use::set_enabled(true);
    computer_use::set_enabled(false);
    ToolContext context;
    context.session_id = "stale-session";
    for (const auto& impl : snapshots) {
        const auto result = impl.execute("{}", context);
        EXPECT_FALSE(result.success) << impl.definition.name;
        EXPECT_NE(result.output.find("disabled"), std::string::npos);
    }
}

TEST_F(ComputerUseTools, PlanModeRejectsAllInputWithoutSpawningHelper) {
    if (!computer_use::supported()) GTEST_SKIP();
    computer_use::set_enabled(true);
    ToolContext context;
    context.session_id = "plan-session";
    context.current_permission_mode = [] { return std::string{"plan"}; };
    for (const auto& impl : create_computer_use_tools()) {
        if (impl.is_read_only) continue;
        auto result = impl.execute("{}", context);
        EXPECT_FALSE(result.success) << impl.definition.name;
        EXPECT_NE(result.output.find("plan mode"), std::string::npos);
    }
}

TEST_F(ComputerUseTools, RequiresBoundSessionAndRejectsOversizedInput) {
    if (!computer_use::supported()) GTEST_SKIP();
    computer_use::set_enabled(true);
    auto no_session = computer_use::execute("", {{"action", "list_windows"}});
    EXPECT_EQ(no_session["output"]["error"], "COMPUTER_USE_NO_SESSION");
    auto oversized = computer_use::execute("session", {{"action", "type_text"}, {"text", std::string(40000, 'x')}});
    EXPECT_EQ(oversized["output"]["error"], "COMPUTER_USE_BAD_REQUEST");
    std::atomic<bool> aborted{true};
    auto cancelled = computer_use::execute("session", {{"action", "list_windows"}}, &aborted);
    EXPECT_EQ(cancelled["output"]["error"], "COMPUTER_USE_CANCELLED");
}

TEST_F(ComputerUseTools, ActionsRequireObservationsAndWritesRemainPermissionGated) {
    ToolExecutor tools;
    for (const auto& impl : create_computer_use_tools()) {
        tools.register_tool(impl);
        EXPECT_FALSE(tools.can_execute_in_parallel(impl.definition.name));
        const auto& name = impl.definition.name;
        if (name == "computer_get_window_state" || name == "computer_get_window" || name == "computer_list_windows" ||
            name == "computer_list_apps" || name == "computer_release") {
            EXPECT_TRUE(impl.is_read_only) << name;
            continue;
        }
        EXPECT_FALSE(impl.is_read_only) << name;
        if (name == "computer_launch_app" || name == "computer_activate_window") continue;
        const auto& required = impl.definition.parameters["required"];
        EXPECT_NE(std::find(required.begin(), required.end(), "observation_id"), required.end()) << name;
        EXPECT_NE(std::find(required.begin(), required.end(), "window"), required.end()) << name;
    }
}

TEST_F(ComputerUseTools, WindowLookupAndPixelActionsExposeNativeIdentityChecks) {
    for (const auto& impl : create_computer_use_tools()) {
        const auto& parameters = impl.definition.parameters;
        if (impl.definition.name == "computer_get_window") {
            EXPECT_TRUE(impl.is_read_only);
            EXPECT_EQ(parameters["properties"]["window"]["type"], "integer");
            EXPECT_EQ(parameters["properties"]["app"]["type"], "string");
            EXPECT_EQ(parameters["required"], nlohmann::json::array({"window"}));
        }
        if (impl.definition.name == "computer_click" || impl.definition.name == "computer_scroll" ||
            impl.definition.name == "computer_drag") {
            EXPECT_EQ(parameters["properties"]["screenshot_id"]["type"], "string");
            const auto description = parameters["properties"]["screenshot_id"]["description"].get<std::string>();
            EXPECT_NE(description.find("explicit id when multiple images"), std::string::npos);
            EXPECT_NE(description.find("main image is unavailable"), std::string::npos);
            EXPECT_NE(description.find("main image is the sole available screenshot"), std::string::npos);
            const auto& required = parameters["required"];
            EXPECT_EQ(std::find(required.begin(), required.end(), "screenshot_id"), required.end());
        }
    }
}

TEST_F(ComputerUseTools, LargeObservationRetainsControlStateThroughPersistedDelivery) {
    namespace fs = std::filesystem;
    const auto dir = fs::temp_directory_path() /
        ("acecode_computer_observation_" + std::to_string(std::random_device{}()));
    struct Cleanup {
        fs::path dir;
        ~Cleanup() { std::error_code ec; fs::remove_all(dir, ec); }
    } cleanup{dir};
    const std::string observation = "{abcdef01-2345-6789-abcd-0123456789ab}-18446744073709551615";
    const std::string screenshot = observation + "-image";
    nlohmann::json elements = nlohmann::json::array();
    std::string tree;
    for (int i = 0; i < 256; ++i) {
        const auto text = "Control " + std::to_string(i) + " " + std::string(240, 'x');
        elements.push_back({{"index", i}, {"name", text}, {"role", "edit"},
                            {"bounds", {{"x", i}, {"y", i}, {"width", 100}, {"height", 20}}}});
        tree += "[" + std::to_string(i) + "] " + text + "\n";
    }
    const nlohmann::json geometry{{"width", 2560}, {"height", 1440},
        {"native_width", 3840}, {"native_height", 2160}, {"originX", -3840},
        {"originY", -2160}, {"scaleX", 1.5}, {"scaleY", 1.5}};
    auto image = geometry;
    image["id"] = screenshot;
    image["capture_method"] = "windows_graphics_capture";
    const nlohmann::json output{
        {"window", {{"id", 12345}, {"pid", 56789}, {"title", std::string(2000, 't')},
                    {"app", std::string(32000, 'p')}}},
        {"observation_id", observation}, {"geometry", geometry},
        {"screenshots", nlohmann::json::array({image})},
        {"accessibility", {{"elements", elements}, {"tree", tree}, {"truncated", false}}}};
    const auto original = format_computer_use_output(output);
    ASSERT_GT(original.size(), TOOL_RESULT_DEFAULT_MAX_BYTES);
    const auto details = original.find("Full observation JSON:\n");
    ASSERT_NE(details, std::string::npos);
    EXPECT_LT(details, TOOL_RESULT_PREVIEW_BYTES);
    EXPECT_EQ(nlohmann::json::parse(original.substr(details + std::string("Full observation JSON:\n").size())), output);

    ToolResult result{original, true};
    result.metadata = {{"computer_use", {{"action", "get_window_state"}}}};
    ASSERT_TRUE(prepare_tool_result_for_delivery(result, "computer_get_window_state", "call-observe", dir.string()));
    EXPECT_TRUE(is_persisted_output_message(result.output));
    const auto marker = result.output.find("Computer Use control state:\n");
    ASSERT_NE(marker, std::string::npos);
    const auto begin = marker + std::string("Computer Use control state:\n").size();
    const auto end = result.output.find('\n', begin);
    ASSERT_NE(end, std::string::npos);
    const auto control = nlohmann::json::parse(result.output.substr(begin, end - begin));
    EXPECT_EQ(control["observation_id"], observation);
    EXPECT_EQ(control["window"]["id"], 12345);
    EXPECT_EQ(control["window"]["pid"], 56789);
    EXPECT_EQ(control["screenshots"][0]["id"], screenshot);
    for (const char* key : {"width", "height", "originX", "originY", "scaleX", "scaleY"})
        EXPECT_EQ(control["screenshots"][0][key], geometry[key]);
    EXPECT_NE(result.output.find("reobserve after every action or error"), std::string::npos);
    EXPECT_NE(result.output.find("Keep window=control state window.id"), std::string::npos);
    EXPECT_NE(result.output.find("include_text=false"), std::string::npos);
    std::ifstream saved(persisted_output_filepath(result.output), std::ios::binary);
    EXPECT_EQ(std::string(std::istreambuf_iterator<char>(saved), std::istreambuf_iterator<char>()), original);

    std::vector<ToolCall> calls{{"call-observe", "computer_get_window_state", "{}"}};
    std::vector<ToolResult> results{result};
    ToolResultReplacementState replacement;
    enforce_tool_result_budget(calls, results, {true}, dir.string(), replacement);
    const auto message = ToolExecutor::format_tool_result("call-observe", results.front());
    EXPECT_EQ(message.content, result.output);
    EXPECT_EQ(message.metadata["computer_use"]["action"], "get_window_state");
    EXPECT_EQ(message.content.find("data:image"), std::string::npos);
}

TEST_F(ComputerUseTools, ObservationWithoutScreenshotAndOtherResultsRemainUsable) {
    const nlohmann::json no_screenshot{{"observation_id", "observation-text"},
        {"window", {{"id", 10}, {"pid", 20}}}, {"screenshots", nlohmann::json::array()},
        {"accessibility", {{"tree", "[0] edit"}}}};
    const auto text = format_computer_use_output(no_screenshot);
    EXPECT_NE(text.find("\"screenshots\":[]"), std::string::npos);
    EXPECT_NE(text.find("[0] edit"), std::string::npos);
    EXPECT_EQ(format_computer_use_output("Unavailable"), "Unavailable");
    const nlohmann::json action{{"action", "click"}, {"success", true}};
    EXPECT_EQ(format_computer_use_output(action), action.dump());
}

TEST_F(ComputerUseTools, FourSurfaceControlEnvelopeFitsPersistedPreview) {
    const std::string observation = "{abcdef01-2345-6789-abcd-0123456789ab}-18446744073709551615";
    nlohmann::json output{{"observation_id", observation},
        {"window", {{"id", std::uint64_t{18446744073709551615ull}}, {"pid", 4294967295u}}},
        {"screenshots", nlohmann::json::array()}, {"accessibility", {{"tree", std::string(60000, 'a')}}}};
    for (int i = 0; i < 4; ++i) {
        output["screenshots"].push_back({{"id", observation + "-image-" + std::to_string(i)},
            {"width", 2560 - i}, {"height", 1440 - i}, {"native_width", 3840}, {"native_height", 2160},
            {"originX", -2147483647 + i}, {"originY", 2147483647 - i},
            {"scaleX", 1.3333333333333333}, {"scaleY", 1.5555555555555556}, {"zIndex", i}});
    }
    const auto text = format_computer_use_output(output);
    const auto details = text.find("Full observation JSON:\n");
    ASSERT_NE(details, std::string::npos);
    EXPECT_LT(details, TOOL_RESULT_PREVIEW_BYTES);
    const auto begin = text.find('\n') + 1;
    const auto end = text.find('\n', begin);
    const auto control = nlohmann::json::parse(text.substr(begin, end - begin));
    ASSERT_EQ(control["screenshots"].size(), 4u);
    for (int i = 0; i < 4; ++i)
        for (const char* key : {"id", "width", "height", "originX", "originY", "scaleX", "scaleY", "zIndex"})
            EXPECT_EQ(control["screenshots"][i][key], output["screenshots"][i][key]);
}
} // namespace
