// Throwaway FTXUI prototype for the redesigned TUI AskUserQuestion layout.
// This file intentionally does not reuse the production ask-question overlay.

#include <ftxui/component/component.hpp>
#include <ftxui/component/event.hpp>
#include <ftxui/component/screen_interactive.hpp>
#include <ftxui/dom/elements.hpp>
#include <ftxui/screen/box.hpp>
#include <ftxui/screen/color.hpp>

#include <algorithm>
#include <chrono>
#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace {

using namespace ftxui;

constexpr int kOptionTitleWidth = 28;
constexpr int kVisibleOptionRows = 6;
constexpr int kVisibleSummaryRows = 5;

const Color kBackground = Color::RGB(8, 12, 17);
const Color kPanel = Color::RGB(14, 21, 29);
const Color kPanelRaised = Color::RGB(18, 30, 42);
const Color kBorder = Color::RGB(48, 67, 84);
const Color kMuted = Color::RGB(139, 155, 170);
const Color kDim = Color::RGB(91, 107, 121);
const Color kAccent = Color::RGB(101, 181, 255);
const Color kAccentDark = Color::RGB(35, 50, 67);
const Color kSelected = Color::RGB(23, 59, 87);
const Color kSelectedFocus = Color::RGB(29, 78, 112);
const Color kSuccess = Color::RGB(117, 211, 156);
const Color kWarning = Color::RGB(242, 189, 104);
const Color kDanger = Color::RGB(238, 141, 141);

struct Option {
    std::string title;
    std::string description;
    bool recommended = false;
};

enum class Scene {
    Single,
    MultiQuestion,
    Multiple,
    Custom,
    Summary,
    Long,
    Timeout,
};

enum class Variant {
    TerminalFlow,
    FocusedCard,
    ProgressRail,
};

struct PrototypeState {
    Scene scene = Scene::Single;
    Variant variant = Variant::TerminalFlow;
    int focus = 0;
    int selected = 0;
    std::vector<bool> multi_selected = {false, true, false, true};
    bool custom_selected = false;
    bool editing = false;
    std::string custom_text;
    int scroll_offset = 0;
    int question_number = 1;
    std::string status = "等待选择";
    std::chrono::steady_clock::time_point toast_until{};
};

std::string scene_name(Scene scene) {
    switch (scene) {
    case Scene::Single: return "单题 · 单选";
    case Scene::MultiQuestion: return "多题 · 第 2/4 题";
    case Scene::Multiple: return "多选题";
    case Scene::Custom: return "自定义编辑";
    case Scene::Summary: return "汇总页";
    case Scene::Long: return "长内容滚动";
    case Scene::Timeout: return "超时自动选择";
    }
    return "提问";
}

std::string variant_name(Variant variant) {
    switch (variant) {
    case Variant::TerminalFlow: return "A · Terminal flow";
    case Variant::FocusedCard: return "B · Focused card";
    case Variant::ProgressRail: return "C · Progress rail";
    }
    return "A";
}

std::string question_text(Scene scene) {
    switch (scene) {
    case Scene::Single:
    case Scene::Custom:
        return "如果明天可以免费旅行，你最想去哪里？";
    case Scene::MultiQuestion:
        return "如果明天开始拥有一整个月的自由时间，你最想做什么？";
    case Scene::Multiple:
        return "哪些因素会影响你选择一个新的开发工具？";
    case Scene::Summary:
        return "请确认你对下面问题的回答";
    case Scene::Long:
        return "你最希望 ACECode 下一步优先改善哪些方面？";
    case Scene::Timeout:
        return "当任务遇到不确定选择时，你更偏好哪种处理方式？";
    }
    return "请选择一个答案";
}

std::vector<Option> options_for(Scene scene) {
    if (scene == Scene::Multiple) {
        return {
            {"上手速度", "尽快从想法进入可运行状态", true},
            {"类型安全", "尽早发现错误并获得编辑器提示"},
            {"生态与集成", "方便接入现有工具链和服务"},
            {"团队协作", "让约定、审查和交接更顺畅"},
        };
    }
    if (scene == Scene::Long) {
        return {
            {"更快的响应速度", "减少等待，保持连续的思考节奏", true},
            {"更清晰的工具反馈", "知道当前工具做了什么、还剩什么"},
            {"更灵活的模型切换", "按任务在不同模型之间快速切换"},
            {"更好的会话恢复", "中断后可以准确回到原来的上下文"},
            {"更简单的权限控制", "在安全和效率之间更容易做选择"},
            {"更完整的差异预览", "在写入前后都能看懂实际变化"},
            {"更多自动化能力", "把重复的检查、构建和验证交给代理"},
            {"更好的问答体验", "用最少操作表达清楚真实意图"},
        };
    }
    if (scene == Scene::Timeout) {
        return {
            {"自动选择推荐项", "让流程继续，不因短暂离开而阻塞", true},
            {"等待我回来", "保留现场，直到我明确做出选择"},
            {"取消当前问题", "无法确认时不让模型猜测我的意图"},
            {"交给模型判断", "由模型基于上下文选择风险最低的方案"},
        };
    }
    return {
        {"环游世界", "探索未知，体验不同文化与风景", true},
        {"掌握一项新技能", "持续学习并提升专业能力"},
        {"陪伴亲友并享受生活", "拥有充足时间陪伴亲友并享受生活"},
        {"做一件有意义的事", "帮助他人解决问题并创造积极影响"},
    };
}

std::string current_mode(const PrototypeState& state) {
    if (state.scene == Scene::Multiple) return "multi-select";
    if (state.editing) return "inline-edit";
    if (state.scene == Scene::Summary) return "summary";
    return "single-select";
}

void set_scene(PrototypeState& state, Scene scene) {
    state.scene = scene;
    state.scroll_offset = 0;
    state.focus = 0;
    state.editing = scene == Scene::Custom;
    state.custom_selected = scene == Scene::Custom;
    state.status = scene == Scene::Timeout
                       ? "已到截止时间：自动选择推荐项"
                       : "等待选择";
}

void ensure_focus_visible(PrototypeState& state, int total_rows) {
    const int visible = state.scene == Scene::Summary ? kVisibleSummaryRows : kVisibleOptionRows;
    if (state.focus < state.scroll_offset) state.scroll_offset = state.focus;
    if (state.focus >= state.scroll_offset + visible) {
        state.scroll_offset = state.focus - visible + 1;
    }
    const int max_offset = std::max(0, total_rows - visible);
    state.scroll_offset = std::clamp(state.scroll_offset, 0, max_offset);
}

void show_toast(PrototypeState& state) {
    state.toast_until = std::chrono::steady_clock::now() + std::chrono::milliseconds(1800);
    state.status = "已复制预设选项文本";
}

bool toast_visible(const PrototypeState& state) {
    return std::chrono::steady_clock::now() < state.toast_until;
}

Element key_label(const std::string& key) {
    return text("[" + key + "]") | color(Color::White) | bgcolor(Color::RGB(24, 35, 45));
}

Element footer_hint(const std::string& key, const std::string& label) {
    return hbox({key_label(key), text(" " + label) | color(kMuted)});
}

Element option_row(const Option& option,
                   int index,
                   bool selected,
                   bool focused,
                   bool multiple,
                   bool custom,
                   const std::string& custom_text,
                   Box& row_box) {
    std::string mark;
    if (custom) {
        mark = selected ? "(o)" : "( )";
    } else if (multiple) {
        mark = selected ? "[x]" : "[ ]";
    } else {
        mark = selected ? "(o)" : "( )";
    }

    const Color row_bg = selected && focused
                             ? kSelectedFocus
                             : selected ? kSelected : focused ? kAccentDark : kBackground;
    const Color mark_color = custom ? kSuccess : kAccent;

    std::string label = custom ? (custom_text.empty() ? "Type your own answer here" : custom_text)
                               : option.title;
    if (custom && focused) label = "> " + label + "_";
    if (!custom && option.recommended) label += " [Recommended]";

    auto row = hbox({
        text(std::to_string(index + 1)) | size(WIDTH, EQUAL, 3) | color(kMuted),
        text(mark) | size(WIDTH, EQUAL, 6) | color(mark_color),
        text(label) | size(WIDTH, EQUAL, kOptionTitleWidth) |
            (custom && !selected ? color(kDim) : color(Color::White)),
        text(custom ? (multiple ? "自定义回答可以与预设项同时存在" : "自定义回答与预设项互斥")
                    : option.description) |
            color(custom ? kMuted : kMuted) | flex,
    });
    return row | size(HEIGHT, EQUAL, 1) | bgcolor(row_bg) | reflect(row_box);
}

Element scrollbar(int total_rows, int visible_rows, int offset) {
    if (total_rows <= visible_rows) return text(" ");
    const int track = std::max(1, visible_rows);
    const int thumb = std::max(1, track * visible_rows / total_rows);
    const int max_offset = std::max(1, total_rows - visible_rows);
    const int thumb_start = (track - thumb) * offset / max_offset;
    std::string rail;
    for (int i = 0; i < track; ++i) {
        rail += (i >= thumb_start && i < thumb_start + thumb) ? "#\n" : ":\n";
    }
    return text(rail) | color(kAccent);
}

Element render_options(PrototypeState& state,
                       std::vector<Box>& row_boxes,
                       const std::vector<Option>& options) {
    row_boxes.clear();
    std::vector<Element> rows;
    const int total_rows = static_cast<int>(options.size()) + 1;
    const int visible = kVisibleOptionRows;
    ensure_focus_visible(state, total_rows);

    const int first = state.scroll_offset;
    const int last = std::min(total_rows, first + visible);
    for (int index = first; index < last; ++index) {
        row_boxes.emplace_back();
        const bool custom = index == static_cast<int>(options.size());
        const bool selected = custom
                                  ? state.custom_selected
                                  : state.scene == Scene::Multiple
                                        ? state.multi_selected[index]
                                        : state.selected == index;
        const bool focused = state.focus == index;
        const Option empty_option{"", ""};
        rows.push_back(option_row(custom ? empty_option : options[index],
                                  index,
                                  selected,
                                  focused,
                                  state.scene == Scene::Multiple,
                                  custom,
                                  state.custom_text,
                                  row_boxes.back()));
    }

    return hbox({
        vbox(std::move(rows)) | flex,
        scrollbar(total_rows, visible, state.scroll_offset) | size(WIDTH, EQUAL, 2),
    });
}

Element render_summary(PrototypeState& state, std::vector<Box>& row_boxes) {
    const std::vector<std::pair<std::string, std::string>> answers = {
        {"你最想去哪里？", "去海边度假"},
        {"你更希望如何安排时间？", "Not answered"},
        {"你会邀请谁一起出发？", "陪伴家人和朋友"},
        {"你最期待哪一种体验？", "探索新的文化和风景"},
    };
    row_boxes.clear();
    std::vector<Element> rows;
    for (std::size_t i = 0; i < answers.size(); ++i) {
        row_boxes.emplace_back();
        const bool focused = state.focus == static_cast<int>(i);
        const bool unanswered = answers[i].second == "Not answered";
        auto row = hbox({
            text(std::to_string(i + 1)) | size(WIDTH, EQUAL, 4) | color(kAccent),
            text(answers[i].first) | size(WIDTH, EQUAL, kOptionTitleWidth) | color(Color::White),
            text(answers[i].second) | color(unanswered ? kWarning : kSuccess) | flex,
        });
        rows.push_back(row | size(HEIGHT, EQUAL, 1) |
                       bgcolor(focused ? kAccentDark : kPanel) | reflect(row_boxes.back()));
    }

    return window(
               hbox({
                   text("回答汇总") | bold | color(Color::White),
                   filler(),
                   text("4 个问题 · 可返回修改") | color(kMuted),
               }),
               hbox({vbox(std::move(rows)) | flex,
                     scrollbar(static_cast<int>(answers.size()), kVisibleSummaryRows,
                               state.scroll_offset) |
                         size(WIDTH, EQUAL, 2)})) |
           borderRounded | color(kBorder);
}

Element progress_rail(const PrototypeState& state) {
    const std::vector<std::string> labels = {"出发地点", "时间安排", "同行的人", "最终确认"};
    std::vector<Element> rows;
    for (int i = 0; i < static_cast<int>(labels.size()); ++i) {
        const bool current = i == 1;
        const bool done = i == 0;
        rows.push_back(hbox({
            text(done ? " + " : current ? " 2 " : "   ") |
                color(done ? kSuccess : current ? kAccent : kDim),
            text(labels[i]) | color(done ? kSuccess : current ? Color::White : kMuted),
        }) | size(HEIGHT, EQUAL, 2) |
                       bgcolor(current ? kPanelRaised : kBackground));
    }
    return hbox({
               vbox({
                   text("QUESTIONNAIRE") | color(kDim),
                   separatorEmpty(),
                   vbox(std::move(rows)),
                   filler(),
                   text("4 questions") | color(kDim),
               }) | size(WIDTH, EQUAL, 22),
               separator(),
           });
}

Element question_header(const PrototypeState& state) {
    const bool summary = state.scene == Scene::Summary;
    const std::string left = summary ? "Questionnaire complete"
                                     : state.scene == Scene::MultiQuestion
                                           ? "Question 2/4 [Decision]"
                                           : "Question 1/1 [Decision]";
    const std::string progress = summary ? "[ * * * S ]" : "[ # * . . S ]";
    return vbox({
        hbox({text(left) | color(kAccent), filler(), text(progress) | color(kMuted)}),
        separatorEmpty(),
        text(question_text(state.scene)) | bold | color(Color::White),
        text("选择一项最符合你当前想法的答案") | color(kMuted),
    });
}

Element help_footer(const PrototypeState& state) {
    const bool summary = state.scene == Scene::Summary;
    const std::string line_one = summary
                                     ? "Enter 提交完整问卷   Left / Shift+Tab 回到最后一题   Right / Tab 回到第一题"
                                     : "Up/Down 选择   Space 切换   Enter 提交   Left/Right 切换题目   y 复制";
    const std::string line_two = summary
                                     ? "Esc 取消问答   Shift+X 取消问答"
                                     : "Tab 下一题   Esc 取消选择   Shift+X 取消问答";
    const std::string state_line = "prototype state: mode=" + current_mode(state) +
                                   "  focus=" + std::to_string(state.focus + 1) +
                                   "  scroll=" + std::to_string(state.scroll_offset) +
                                   "  variant=" + variant_name(state.variant);
    return vbox({
               separator(),
               text(line_one) | color(kMuted),
               text(line_two) | color(kDim),
               text(state_line) | color(kDim),
           }) |
           size(HEIGHT, EQUAL, 4);
}

Element status_line(const PrototypeState& state) {
    const Color status_color = state.scene == Scene::Timeout ? kWarning : kDim;
    return hbox({
               text("status: ") | color(kDim),
               text(state.status) | color(status_color),
               filler(),
               text("source: " +
                    std::string(state.scene == Scene::MultiQuestion || state.scene == Scene::Summary
                                    ? "subtask"
                                    : "main session")) |
                   color(Color::RGB(157, 130, 202)),
           }) |
           size(HEIGHT, EQUAL, 1);
}

Element content_for(PrototypeState& state,
                    std::vector<Box>& row_boxes,
                    const std::vector<Option>& options) {
    if (state.scene == Scene::Summary) return render_summary(state, row_boxes);

    auto options_element = render_options(state, row_boxes, options);
    if (state.scene == Scene::Long) {
        return vbox({
            options_element,
            text("scroll to view all options   " +
                 std::to_string(options.size() + 1) + " rows") |
                color(kDim),
        });
    }
    if (state.scene == Scene::Timeout) {
        return vbox({
            text("TIMEOUT: automatically selected Recommended option") | color(kWarning) |
                bgcolor(Color::RGB(53, 39, 17)),
            options_element,
        });
    }
    return options_element;
}

Element render_layout(PrototypeState& state,
                      std::vector<Box>& row_boxes,
                      const std::vector<Option>& options) {
    auto main_content = vbox({
        question_header(state),
        separatorEmpty(),
        content_for(state, row_boxes, options) | flex,
        filler(),
        status_line(state),
        help_footer(state),
    });

    if (state.variant == Variant::TerminalFlow) {
        return main_content | borderRounded | color(kBorder) | bgcolor(kBackground) | flex;
    }

    if (state.variant == Variant::FocusedCard) {
        return vbox({
                   filler(),
                   window(text(" AskUserQuestion ") | bold | color(kAccent),
                          main_content | bgcolor(kPanel)) |
                       borderRounded | color(kBorder) | size(WIDTH, GREATER_THAN, 76),
                   filler(),
               }) |
               center | bgcolor(kBackground) | flex;
    }

    return hbox({
               progress_rail(state),
               main_content | flex,
           }) |
           borderRounded | color(kBorder) | bgcolor(kBackground) | flex;
}

void select_option(PrototypeState& state, int index, int option_count) {
    if (index < 0 || index > option_count) return;
    state.focus = index;
    if (index == option_count) {
        state.custom_selected = true;
        state.editing = true;
        if (state.scene != Scene::Multiple) state.selected = -1;
        state.status = "正在编辑自定义回答";
        return;
    }
    if (state.scene == Scene::Multiple) {
        if (index >= static_cast<int>(state.multi_selected.size())) {
            state.multi_selected.resize(static_cast<std::size_t>(option_count), false);
        }
        state.multi_selected[index] = true;
        state.status = "已选中：" + std::to_string(index + 1);
    } else {
        state.selected = index;
        state.custom_selected = false;
        state.editing = false;
        state.status = "已选中：" + std::to_string(index + 1);
    }
}

bool handle_event(PrototypeState& state,
                  Event event,
                  const std::vector<Option>& options,
                  const std::vector<Box>& row_boxes,
                  const Closure& exit) {
    const int option_count = static_cast<int>(options.size());
    const int total_rows = option_count + 1;

    if (event == Event::Character('q') || event == Event::Character('Q')) {
        exit();
        return true;
    }
    if (event == Event::Character('v') || event == Event::Character('V')) {
        state.variant = static_cast<Variant>((static_cast<int>(state.variant) + 1) % 3);
        state.status = "已切换布局：" + variant_name(state.variant);
        return true;
    }
    if (event == Event::Character('m') || event == Event::Character('M')) {
        set_scene(state, Scene::Multiple);
        return true;
    }
    if (event == Event::Character('e') || event == Event::Character('E')) {
        set_scene(state, Scene::Custom);
        return true;
    }
    if (event == Event::Character('s') || event == Event::Character('S')) {
        set_scene(state, Scene::Summary);
        return true;
    }
    if (event == Event::Character('l') || event == Event::Character('L')) {
        set_scene(state, Scene::Long);
        return true;
    }
    if (event == Event::Character('t') || event == Event::Character('T')) {
        set_scene(state, Scene::Timeout);
        state.selected = 0;
        return true;
    }
    if (event == Event::Character('y') || event == Event::Character('Y')) {
        show_toast(state);
        return true;
    }

    if (event.is_mouse()) {
        const auto& mouse = event.mouse();
        if (mouse.button == Mouse::WheelDown) {
            state.scroll_offset = std::min(std::max(0, total_rows - kVisibleOptionRows),
                                           state.scroll_offset + 1);
            state.status = "滚动查看内容";
            return true;
        }
        if (mouse.button == Mouse::WheelUp) {
            state.scroll_offset = std::max(0, state.scroll_offset - 1);
            state.status = "滚动查看内容";
            return true;
        }
        if (mouse.button == Mouse::Left && mouse.motion == Mouse::Pressed) {
            for (std::size_t i = 0; i < row_boxes.size(); ++i) {
                if (!row_boxes[i].Contain(mouse.x, mouse.y)) continue;
                const int index = state.scroll_offset + static_cast<int>(i);
                select_option(state, index, option_count);
                return true;
            }
        }
        return false;
    }

    if (state.scene == Scene::Summary) {
        if (event == Event::ArrowLeft || event == Event::TabReverse) {
            set_scene(state, Scene::MultiQuestion);
            state.status = "回到最后一题";
            return true;
        }
        if (event == Event::ArrowRight || event == Event::Tab) {
            set_scene(state, Scene::MultiQuestion);
            state.status = "回到第一题";
            return true;
        }
        if (event == Event::Escape) {
            state.status = "已取消整个问答";
            return true;
        }
        if (event == Event::ArrowUp || event == Event::ArrowDown) return true;
    }

    if (event == Event::ArrowUp) {
        state.focus = std::max(0, state.focus - 1);
        ensure_focus_visible(state, total_rows);
        return true;
    }
    if (event == Event::ArrowDown) {
        state.focus = std::min(total_rows - 1, state.focus + 1);
        ensure_focus_visible(state, total_rows);
        return true;
    }
    if (event == Event::ArrowLeft) {
        state.status = "上一题";
        return true;
    }
    if (event == Event::ArrowRight || event == Event::Tab) {
        state.status = "下一题";
        return true;
    }
    if (event == Event::TabReverse) {
        state.status = "上一题";
        return true;
    }
    if (event == Event::Character(' ')) {
        if (state.focus == option_count) {
            state.custom_selected = !state.custom_selected;
            state.editing = state.custom_selected;
        } else if (state.scene == Scene::Multiple) {
            if (state.focus >= static_cast<int>(state.multi_selected.size())) {
                state.multi_selected.resize(static_cast<std::size_t>(option_count), false);
            }
            state.multi_selected[state.focus] = !state.multi_selected[state.focus];
        } else {
            state.selected = state.selected == state.focus ? -1 : state.focus;
        }
        state.status = "已切换当前选择";
        return true;
    }
    if (event == Event::Return) {
        if (state.editing) {
            state.status = state.custom_text.empty() ? "Not answered" : "已提交自定义回答";
            state.editing = false;
            return true;
        }
        select_option(state, state.focus, option_count);
        state.status = "已提交当前题";
        return true;
    }
    if (event == Event::Escape) {
        if (state.editing) {
            state.editing = false;
            state.status = "退出自定义编辑，保留草稿";
        } else {
            state.selected = -1;
            state.custom_selected = false;
            std::fill(state.multi_selected.begin(), state.multi_selected.end(), false);
            state.status = "已清除当前题选择";
        }
        return true;
    }
    if (event == Event::Backspace && state.editing) {
        if (!state.custom_text.empty()) state.custom_text.pop_back();
        return true;
    }
    if (event.is_character() && state.editing) {
        state.custom_text += event.character();
        state.status = "正在编辑自定义回答";
        return true;
    }
    if (event.is_character() && event.character().size() == 1 &&
        event.character()[0] >= '1' && event.character()[0] <= '9') {
        const int index = event.character()[0] - '1';
        if (index <= option_count) {
            select_option(state, index, option_count);
            state.status = "已选择第 " + std::to_string(index + 1) + " 项";
        }
        return true;
    }
    return false;
}

} // namespace

int main() {
    PrototypeState state;
    // Use the primary terminal buffer with an explicit full-screen size. The
    // TerminalOutput mode derives the frame height from the root requirement;
    // this prototype's flexible layout can legitimately report zero there,
    // which results in a blank frame on Windows.
    auto screen = ScreenInteractive::FullscreenPrimaryScreen();
    screen.TrackMouse(true);

    std::vector<Box> row_boxes;
    auto renderer = Renderer([&] {
        const auto options = options_for(state.scene);
        auto content = render_layout(state, row_boxes, options);
        if (toast_visible(state)) {
            content = dbox({content,
                            text(" Copied to clipboard ") | color(kSuccess) |
                                bgcolor(Color::RGB(16, 39, 29)) | borderRounded |
                                clear_under}) | flex;
        }
        return content;
    });

    auto app = CatchEvent(renderer, [&](const Event& event) {
        const auto options = options_for(state.scene);
        return handle_event(state, event, options, row_boxes, screen.ExitLoopClosure());
    });

    screen.Loop(app);
    return 0;
}
