#ifdef __APPLE__
#include "computer_use/native_backend.hpp"
#include "computer_use/macos_keyboard.hpp"
#include <gtest/gtest.h>

using namespace acecode::computer_use;
using nlohmann::json;

TEST(ComputerUseMacNative, RejectsMalformedAndUnobservedRequestsWithoutDesktopInput) {
    NativeBackend backend;
    EXPECT_FALSE(backend.dispatch(json::array())["success"].get<bool>());
    EXPECT_EQ(backend.dispatch({{"action", "unknown"}})["error"], "unsupported_action");
    EXPECT_EQ(backend.dispatch({{"action", "click"}, {"window", 1}, {"observation_id", "forged"}, {"x", 1}, {"y", 1}})["error"], "stale_observation");
    EXPECT_TRUE(backend.dispatch({{"action", "release"}})["success"].get<bool>());
    EXPECT_TRUE(backend.dispatch({{"action", "release"}})["success"].get<bool>());
}
TEST(ComputerUseMacKeyboard, NamedChordsUseDistinctModifiersAndNativeKeys) {
    const auto command = macos::parse_key_chord("Cmd+Shift+Enter");
    EXPECT_EQ(command.modifiers.size(), 2U);
    EXPECT_NE(command.flags, macos::parse_key_chord("Ctrl+Enter").flags);
    EXPECT_NE(command.key, macos::parse_key_chord("NumpadEnter").key);
    EXPECT_EQ(macos::parse_key_chord("Option+Left").key, macos::parse_key_chord("Alt+ArrowLeft").key);
}
TEST(ComputerUseMacKeyboard, InvalidChordsCannotProducePartialInput) {
    for (const auto* value : {"", "Cmd", "Cmd+", "Cmd++A", "Cmd+Command+A", "A+Shift", "Left+Right", "UnknownKey"})
        EXPECT_THROW(macos::parse_key_chord(value), std::exception) << value;
}
#endif
