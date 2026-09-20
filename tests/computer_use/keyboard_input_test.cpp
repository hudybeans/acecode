#include "computer_use/keyboard_input.hpp"
#include <gtest/gtest.h>

#ifdef _WIN32
namespace acecode::computer_use::keyboard_input {
namespace {

void expect_single_key(const std::string& name, int virtual_key, bool extended = false) {
    const auto parsed = parse_chord(name);
    ASSERT_TRUE(parsed) << name << ": " << parsed.error;
    ASSERT_EQ(parsed.keys.size(), 1u) << name;
    EXPECT_EQ(parsed.keys[0].virtual_key, virtual_key) << name;
    EXPECT_EQ(parsed.keys[0].extended, extended) << name;
}

TEST(ComputerUseKeyboard, ExistingNamedAliasesRemainAvailable) {
    const std::pair<const char*, int> plain[] = {
        {"ctrl", VK_CONTROL}, {"control", VK_CONTROL}, {"Control_L", VK_LCONTROL},
        {"alt", VK_MENU}, {"Alt_L", VK_LMENU}, {"shift", VK_SHIFT},
        {"Shift_L", VK_LSHIFT}, {"Shift_R", VK_RSHIFT}, {"Return", VK_RETURN}, {"Enter", VK_RETURN},
        {"tab", VK_TAB}, {"Escape", VK_ESCAPE}, {"esc", VK_ESCAPE}, {"space", VK_SPACE},
        {"BackSpace", VK_BACK}, {"back", VK_BACK}, {"capslock", VK_CAPITAL},
        {"period", VK_OEM_PERIOD}, {"comma", VK_OEM_COMMA}, {"minus", VK_OEM_MINUS}, {"equal", VK_OEM_PLUS},
        {"semicolon", VK_OEM_1}, {"slash", VK_OEM_2}, {"backslash", VK_OEM_5}, {"apostrophe", VK_OEM_7},
        {"bracketleft", VK_OEM_4}, {"bracketright", VK_OEM_6}, {"grave", VK_OEM_3}, {"plus", VK_ADD},
    };
    for (const auto& [name, key] : plain) expect_single_key(name, key);
    const std::pair<const char*, int> extended[] = {
        {"Control_R", VK_RCONTROL}, {"Alt_R", VK_RMENU}, {"win", VK_LWIN}, {"super", VK_LWIN},
        {"Super_L", VK_LWIN}, {"Super_R", VK_RWIN}, {"meta", VK_LWIN},
        {"delete", VK_DELETE}, {"insert", VK_INSERT}, {"home", VK_HOME}, {"end", VK_END},
        {"left", VK_LEFT}, {"right", VK_RIGHT}, {"up", VK_UP}, {"down", VK_DOWN},
        {"pageup", VK_PRIOR}, {"page_up", VK_PRIOR}, {"prior", VK_PRIOR},
        {"pagedown", VK_NEXT}, {"page_down", VK_NEXT}, {"next", VK_NEXT},
    };
    for (const auto& [name, key] : extended) expect_single_key(name, key, true);
    for (int number = 1; number <= 24; ++number)
        expect_single_key("F" + std::to_string(number), static_cast<WORD>(VK_F1 + number - 1));
    expect_single_key("a", 'A');
    expect_single_key("Z", 'Z');
    expect_single_key("1", '1');
}

TEST(ComputerUseKeyboard, ShiftedPunctuationNeverAddsImplicitModifiers) {
    for (const auto* name : {"period", "greater", ".", ">"}) expect_single_key(name, VK_OEM_PERIOD);
    for (const auto* name : {"comma", "less", ",", "<"}) expect_single_key(name, VK_OEM_COMMA);
    for (const auto* name : {"slash", "question", "/", "?"}) expect_single_key(name, VK_OEM_2);
    for (const auto* chord : {"Control_L+Shift_L+period", " Control_L + Shift_L + greater ", "Control_L+Shift_L+>"}) {
        const auto parsed = parse_chord(chord);
        ASSERT_TRUE(parsed) << parsed.error;
        ASSERT_EQ(parsed.keys.size(), 3u);
        EXPECT_EQ(parsed.keys[0].virtual_key, VK_LCONTROL);
        EXPECT_EQ(parsed.keys[1].virtual_key, VK_LSHIFT);
        EXPECT_EQ(parsed.keys[2].virtual_key, VK_OEM_PERIOD);
    }
    const auto comment_shortcut = parse_chord("Ctrl+/");
    ASSERT_TRUE(comment_shortcut);
    ASSERT_EQ(comment_shortcut.keys.size(), 2u);
    EXPECT_EQ(comment_shortcut.keys[0].virtual_key, VK_CONTROL);
    EXPECT_EQ(comment_shortcut.keys[1].virtual_key, VK_OEM_2);
    const auto question_shortcut = parse_chord("Ctrl+question");
    ASSERT_TRUE(question_shortcut);
    ASSERT_EQ(question_shortcut.keys.size(), 2u);
    EXPECT_EQ(question_shortcut.keys[1].virtual_key, VK_OEM_2);
}

TEST(ComputerUseKeyboard, LiteralOemPunctuationMapsToPrimaryKeys) {
    const std::pair<const char*, int> punctuation[] = {
        {"-", VK_OEM_MINUS}, {"_", VK_OEM_MINUS}, {"=", VK_OEM_PLUS},
        {";", VK_OEM_1}, {":", VK_OEM_1}, {"\\", VK_OEM_5}, {"|", VK_OEM_5},
        {"'", VK_OEM_7}, {"\"", VK_OEM_7}, {"[", VK_OEM_4}, {"{", VK_OEM_4},
        {"]", VK_OEM_6}, {"}", VK_OEM_6}, {"`", VK_OEM_3}, {"~", VK_OEM_3},
    };
    for (const auto& [name, key] : punctuation) expect_single_key(name, key);
}

TEST(ComputerUseKeyboard, NumpadAliasesKeepTheirPhysicalIdentity) {
    for (int number = 0; number <= 9; ++number) {
        const WORD key = static_cast<WORD>(VK_NUMPAD0 + number);
        expect_single_key("KP_" + std::to_string(number), key);
        expect_single_key("Numpad_" + std::to_string(number), key);
    }
    const std::pair<const char*, int> operators[] = {
        {"Add", VK_ADD}, {"Subtract", VK_SUBTRACT}, {"Multiply", VK_MULTIPLY},
        {"Divide", VK_DIVIDE}, {"Decimal", VK_DECIMAL}, {"Enter", VK_RETURN},
    };
    for (const auto& [name, key] : operators) {
        const bool extended = key == VK_DIVIDE || key == VK_RETURN;
        expect_single_key("KP_" + std::string(name), key, extended);
        expect_single_key("Numpad_" + std::string(name), key, extended);
    }
    const auto distinct_enter_keys = parse_chord("Enter+KP_Enter");
    ASSERT_TRUE(distinct_enter_keys);
    ASSERT_EQ(distinct_enter_keys.keys.size(), 2u);
    EXPECT_FALSE(distinct_enter_keys.keys[0].extended);
    EXPECT_TRUE(distinct_enter_keys.keys[1].extended);
}

TEST(ComputerUseKeyboard, EnterAndNumpadEnterGenerateDistinctBalancedInputFlags) {
    const auto parsed = parse_chord("Control_R+Numpad_Enter");
    ASSERT_TRUE(parsed);
    ASSERT_EQ(parsed.keys.size(), 2u);
    for (const auto key : parsed.keys) {
        const auto down = make_input(key, false);
        const auto up = make_input(key, true);
        EXPECT_EQ(down.type, static_cast<DWORD>(INPUT_KEYBOARD));
        EXPECT_EQ(down.ki.wVk, key.virtual_key);
        EXPECT_EQ(down.ki.wScan, 0);
        EXPECT_EQ(down.ki.dwFlags, static_cast<DWORD>(KEYEVENTF_EXTENDEDKEY));
        EXPECT_EQ(up.ki.wVk, down.ki.wVk);
        EXPECT_EQ(up.ki.dwFlags, static_cast<DWORD>(KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP));
    }
    const auto enter = parse_chord("Return");
    ASSERT_TRUE(enter);
    EXPECT_EQ(make_input(enter.keys[0], false).ki.dwFlags, 0u);
    EXPECT_EQ(make_input(enter.keys[0], true).ki.dwFlags, static_cast<DWORD>(KEYEVENTF_KEYUP));
}

TEST(ComputerUseKeyboard, InvalidOrDuplicateChordsNeverReturnPartialKeys) {
    for (const auto* chord : {"", " ", "\t", "+", "Ctrl+", "Ctrl+ ", "+A", "Ctrl++A",
        "Ctrl+Control", "Control_L+Ctrl+A", "Shift+Shift_L+A", "Alt+Alt_L+A",
        "a+A", "Enter+Return", "KP_Enter+Numpad_Enter", "period+greater", "Ctrl+/+question",
        "F0", "F25", "F01", "F1x", "KP_10", "Numpad_10", "Ctrl+NotAKey",
        "a+b+c+d+e+f+g+h+i", "Ctrl+\nA"}) {
        const auto parsed = parse_chord(chord);
        EXPECT_FALSE(parsed) << chord;
        EXPECT_TRUE(parsed.keys.empty()) << chord;
        EXPECT_FALSE(parsed.error.empty()) << chord;
    }
    EXPECT_FALSE(parse_chord(std::string(257, 'a')));
    EXPECT_FALSE(parse_chord(std::string("Ctrl+\0A", 7)));
    EXPECT_TRUE(parse_chord("a+b+c+d+e+f+g+h"));
}

} // namespace
} // namespace acecode::computer_use::keyboard_input
#endif // _WIN32
