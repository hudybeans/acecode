#include "computer_use/native_windows.hpp"
#include "computer_use/application_identity.hpp"
#include "computer_use/accessibility_context.hpp"
#include <array>
#include <gtest/gtest.h>

namespace acecode::computer_use {

#ifdef _WIN32
TEST(ComputerUseNative, RejectsNonObjectWithoutDesktopInput) {
    NativeBackend backend;
    auto result = backend.dispatch(nlohmann::json::array());
    EXPECT_FALSE(result["success"].get<bool>());
    EXPECT_EQ(result["error"], "invalid_argument");
}

TEST(ComputerUseNative, RejectsMissingAndUnknownActions) {
    NativeBackend backend;
    EXPECT_EQ(backend.dispatch(nlohmann::json::object())["error"], "invalid_argument");
    EXPECT_EQ(backend.dispatch({{"action", "not_an_action"}})["error"], "unsupported_action");
}

TEST(ComputerUseNative, RejectsUnobservedInputBeforeResolvingWindow) {
    NativeBackend backend;
    for (const auto* action : {"click", "type_text", "press_key", "scroll", "drag", "set_value", "perform_secondary_action"}) {
        auto result = backend.dispatch({{"action", action}, {"window", 1}, {"observation_id", "old-worker-1"}});
        EXPECT_FALSE(result["success"].get<bool>()) << action;
        EXPECT_EQ(result["error"], "stale_observation") << action;
    }
}

TEST(ComputerUseNative, RejectsInvalidWindowIdentifiers) {
    NativeBackend backend;
    for (const auto& value : {nlohmann::json(-1), nlohmann::json(0), nlohmann::json("123"), nlohmann::json::object()}) {
        auto result = backend.dispatch({{"action", "get_window_state"}, {"window", value}});
        EXPECT_FALSE(result["success"].get<bool>());
        EXPECT_EQ(result["error"], "invalid_argument");
    }
}

TEST(ComputerUseNative, LaunchRejectsSchemesCommandsAndRelativePaths) {
    NativeBackend backend;
    for (const auto* app : {"https://example.invalid", "cmd.exe /c echo test", "notepad.exe", "shell:AppsFolder\\unobserved", ""}) {
        auto result = backend.dispatch({{"action", "launch_app"}, {"app", app}});
        EXPECT_FALSE(result["success"].get<bool>()) << app;
    }
}

TEST(ComputerUseNative, ReleaseIsIdempotentAndDiscardsObservation) {
    NativeBackend backend;
    EXPECT_TRUE(backend.dispatch({{"action", "release"}})["success"].get<bool>());
    EXPECT_TRUE(backend.dispatch({{"action", "release"}})["success"].get<bool>());
}
#endif

TEST(ComputerUseApplicationIdentity, LaunchRefreshKeepsInstalledIdAndFindsItsWindow) {
    const std::vector<InstalledApplicationIdentity> installed{{"Vendor.Editor.Desktop", "Editor", "C:\\Apps\\Editor.exe"}};
    auto before = merge_discovered_applications(installed, nlohmann::json::array());
    ASSERT_EQ(before.size(), 1);
    EXPECT_FALSE(before[0]["isRunning"].get<bool>());
    auto after = merge_discovered_applications(installed, nlohmann::json::array({
        {{"id", 45}, {"pid", 123}, {"app", "c:/apps/editor.EXE"}, {"executable_path", "c:/apps/editor.EXE"}}
    }));
    ASSERT_EQ(after.size(), 1);
    EXPECT_EQ(after[0]["id"], before[0]["id"]);
    EXPECT_TRUE(after[0]["isRunning"].get<bool>());
    ASSERT_EQ(after[0]["windows"].size(), 1);
    EXPECT_EQ(after[0]["windows"][0]["app"], "Vendor.Editor.Desktop");
}

TEST(ComputerUseApplicationIdentity, ExplicitAumidDisambiguatesSharedExecutable) {
    const std::vector<InstalledApplicationIdentity> installed{
        {"Browser.ProfileA", "Profile A", "C:\\Apps\\Browser.exe"},
        {"Browser.ProfileB", "Profile B", "C:\\Apps\\Browser.exe"}
    };
    auto result = merge_discovered_applications(installed, nlohmann::json::array({
        {{"id", 45}, {"pid", 123}, {"app", "Browser.ProfileB"}, {"executable_path", "C:\\Apps\\Browser.exe"}}
    }));
    ASSERT_EQ(result.size(), 2);
    EXPECT_FALSE(result[0]["isRunning"].get<bool>());
    EXPECT_EQ(result[1]["id"], "Browser.ProfileB");
    EXPECT_TRUE(result[1]["isRunning"].get<bool>());
}

TEST(ComputerUseApplicationIdentity, SharedExecutableWithoutIdentityIsNotGuessed) {
    const std::vector<InstalledApplicationIdentity> installed{
        {"Browser.ProfileA", "Profile A", "C:\\Apps\\Browser.exe"},
        {"Browser.ProfileB", "Profile B", "C:\\Apps\\Browser.exe"}
    };
    auto result = merge_discovered_applications(installed, nlohmann::json::array({
        {{"id", 45}, {"pid", 123}, {"app", "C:\\Apps\\Browser.exe"}, {"executable_path", "C:\\Apps\\Browser.exe"}}
    }));
    ASSERT_EQ(result.size(), 3);
    for (const auto& app : result) {
        if (app["id"] == "C:\\Apps\\Browser.exe") {
            EXPECT_TRUE(app["isRunning"].get<bool>());
            EXPECT_EQ(app["windows"].size(), 1);
        } else {
            EXPECT_FALSE(app["isRunning"].get<bool>());
            EXPECT_TRUE(app["windows"].empty());
        }
    }
}

TEST(ComputerUseApplicationIdentity, UnknownExplicitIdentityIsNotReplacedByPathGuess) {
    const std::vector<InstalledApplicationIdentity> installed{{"Browser.ProfileA", "Profile A", "C:\\Apps\\Browser.exe"}};
    auto result = merge_discovered_applications(installed, nlohmann::json::array({
        {{"id", 45}, {"app", "Browser.ProfileB"}, {"executable_path", "C:\\Apps\\Browser.exe"}}
    }));
    ASSERT_EQ(result.size(), 2);
    EXPECT_EQ(result[0]["id"], "Browser.ProfileA");
    EXPECT_FALSE(result[0]["isRunning"].get<bool>());
    EXPECT_EQ(result[1]["id"], "Browser.ProfileB");
    EXPECT_TRUE(result[1]["isRunning"].get<bool>());
}

TEST(ComputerUseApplicationIdentity, NormalizesExtendedPathsAndRetainsUninstalledWindows) {
    const std::vector<InstalledApplicationIdentity> installed{{"Vendor.Editor", "Editor", "\\\\?\\C:\\Apps\\Editor.exe"}};
    auto result = merge_discovered_applications(installed, nlohmann::json::array({
        {{"id", 45}, {"app", "C:\\Apps\\Editor.exe"}},
        {{"id", 46}, {"app", "C:\\Portable\\Other.exe"}}
    }));
    ASSERT_EQ(result.size(), 2);
    EXPECT_EQ(result[0]["id"], "C:\\Portable\\Other.exe");
    EXPECT_EQ(result[1]["id"], "Vendor.Editor");
    EXPECT_TRUE(result[1]["isRunning"].get<bool>());
    EXPECT_EQ(application_path_key("\\\\?\\UNC\\Server\\Share\\App.exe"), application_path_key("\\\\server\\share\\app.exe"));
}

TEST(ComputerUseAccessibilityActions, AdvertisesFocusOnlyForActionableFocusableControls) {
    auto actions = nlohmann::json::array({"invoke"});
    append_accessibility_focus_actions(actions, true, false, true);
    EXPECT_EQ(actions, nlohmann::json::array({"invoke", "focus", "raise"}));
    for (const auto flags : {std::array<bool, 3>{false, false, true}, {true, true, true}, {true, false, false}}) {
        auto unavailable = nlohmann::json::array();
        append_accessibility_focus_actions(unavailable, flags[0], flags[1], flags[2]);
        EXPECT_TRUE(unavailable.empty());
    }
}

TEST(ComputerUseAccessibilityContext, PrefersFocusAndFallsBackToVisibleDocument) {
    const int visible_document = accessibility_document_priority(false, false, false, true);
    const int focused_text = accessibility_document_priority(false, false, true, false);
    EXPECT_GT(visible_document, 0);
    EXPECT_GT(focused_text, visible_document);
    EXPECT_EQ(accessibility_document_priority(false, false, false, false), 0);
    EXPECT_EQ(accessibility_document_priority(true, false, true, true), 0);
    EXPECT_EQ(accessibility_document_priority(false, true, false, true), 0);
    EXPECT_EQ(accessibility_document_priority(false, true, true, true), 0);
}

} // namespace acecode::computer_use
