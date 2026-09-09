#include "ask_question_layout.hpp"

#include "ask_question_text.hpp"

#include <algorithm>

namespace acecode::tui {
namespace {

constexpr int kAskQuestionMinimumContentWidth = 8;
constexpr int kAskQuestionTerminalChromeWidth = 10;
constexpr int kAskQuestionMainColumnChromeWidth = 8;
constexpr int kOuterFrameHorizontalChromeWidth = 2;
constexpr int kSidebarSeparatorWidth = 1;

bool continuation(unsigned char c) { return (c & 0xc0) == 0x80; }
std::size_t glyph_end(const std::string& text, std::size_t start) {
    if (start >= text.size()) return text.size();
    const auto c = static_cast<unsigned char>(text[start]);
    std::size_t length = c < 0x80 ? 1 : (c < 0xe0 ? 2 : (c < 0xf0 ? 3 : 4));
    if (start + length > text.size()) return start + 1;
    for (std::size_t i = start + 1; i < start + length; ++i) {
        if (!continuation(static_cast<unsigned char>(text[i]))) return start + 1;
    }
    return start + length;
}

int glyph_width(const std::string& text, std::size_t start, std::size_t end) {
    if (start >= text.size() || start >= end) return 0;
    return std::max(0, ask_question_codepoint_width(
        std::string_view(text).substr(start, end - start)));
}

void append_row(AskQuestionLayout& layout,
                AskQuestionLayoutKind kind,
                int question_index,
                int option_index,
                std::string number,
                std::string title,
                std::string description,
                bool focused,
                bool selected,
                bool recommended,
                int y) {
    layout.rows.push_back({kind, question_index, option_index,
                           std::move(number), std::move(title),
                           std::move(description), focused, selected,
                           recommended, false, 0, 0, {0, y, 0, 1}});
}

std::string display_option_label(const std::string& label, bool recommended) {
    if (!recommended) return label;
    constexpr const char* kParenSuffix = "(Recommended)";
    constexpr const char* kBracketSuffix = "[Recommended]";
    if (label.size() >= std::char_traits<char>::length(kBracketSuffix) &&
        label.compare(label.size() - std::char_traits<char>::length(kBracketSuffix),
                      std::char_traits<char>::length(kBracketSuffix),
                      kBracketSuffix) == 0) {
        return label;
    }
    if (label.size() >= std::char_traits<char>::length(kParenSuffix) &&
        label.compare(label.size() - std::char_traits<char>::length(kParenSuffix),
                      std::char_traits<char>::length(kParenSuffix),
                      kParenSuffix) == 0) {
        return label.substr(0, label.size() -
                               std::char_traits<char>::length(kParenSuffix)) +
            kBracketSuffix;
    }
    return label + " [Recommended]";
}

} // namespace

int ask_question_display_width(const std::string& text) {
    return ask_question_text_width(text);
}

int ask_question_content_width_for_frame(int terminal_width,
                                         int measured_main_column_width,
                                         bool regular_sidebar_visible,
                                         int regular_sidebar_width) {
    terminal_width = std::max(1, terminal_width);
    regular_sidebar_width = std::max(0, regular_sidebar_width);

    int estimated_main_column_width =
        terminal_width - kOuterFrameHorizontalChromeWidth;
    if (regular_sidebar_visible) {
        estimated_main_column_width -=
            regular_sidebar_width + kSidebarSeparatorWidth;
    }

    int main_column_width = estimated_main_column_width;
    if (measured_main_column_width > kAskQuestionMainColumnChromeWidth) {
        main_column_width = std::min(
            measured_main_column_width, estimated_main_column_width);
    }

    const int terminal_bound = std::max(
        kAskQuestionMinimumContentWidth,
        terminal_width - kAskQuestionTerminalChromeWidth);
    const int main_column_bound = std::max(
        kAskQuestionMinimumContentWidth,
        main_column_width - kAskQuestionMainColumnChromeWidth);
    return std::min(terminal_bound, main_column_bound);
}

int ask_question_visible_rows_for_terminal(int terminal_rows,
                                           int minimum_visible_rows) {
    return std::max(std::clamp(minimum_visible_rows, 2, 12),
                    terminal_rows - 12);
}

std::vector<std::string> ask_question_wrap(const std::string& text, int width) {
    width = std::max(1, width);
    std::vector<std::string> lines;
    std::size_t line_start = 0;
    while (line_start <= text.size()) {
        const auto newline = text.find('\n', line_start);
        const auto end = newline == std::string::npos ? text.size() : newline;
        if (line_start == end) lines.emplace_back();
        std::size_t pos = line_start;
        std::size_t part_start = pos;
        int current_width = 0;
        while (pos < end) {
            const auto next = glyph_end(text, pos);
            const int next_width = glyph_width(text, pos, next);
            if (current_width > 0 && current_width + next_width > width) {
                lines.push_back(text.substr(part_start, pos - part_start));
                part_start = pos;
                current_width = 0;
            }
            current_width += next_width;
            pos = next;
        }
        if (part_start < end) lines.push_back(text.substr(part_start, end - part_start));
        if (newline == std::string::npos) break;
        line_start = newline + 1;
    }
    return lines;
}

std::size_t ask_question_text_byte_offset_for_x(const std::string& text,
                                                std::size_t byte_begin,
                                                std::size_t byte_end,
                                                int x) {
    byte_begin = std::min(byte_begin, text.size());
    byte_end = std::clamp(byte_end, byte_begin, text.size());
    if (x <= 0) return byte_begin;

    int column = 0;
    std::size_t pos = byte_begin;
    while (pos < byte_end) {
        const auto next = glyph_end(text, pos);
        const int width = glyph_width(text, pos, next);
        if (x < column + (width + 1) / 2) return pos;
        column += width;
        pos = next;
    }
    return byte_end;
}

std::vector<std::pair<std::size_t, std::size_t>> ask_question_wrap_ranges(
    const std::string& text, int width) {
    width = std::max(1, width);
    std::vector<std::pair<std::size_t, std::size_t>> ranges;
    std::size_t line_start = 0;
    while (line_start <= text.size()) {
        const auto newline = text.find('\n', line_start);
        const auto end = newline == std::string::npos ? text.size() : newline;
        if (line_start == end) ranges.emplace_back(line_start, end);
        std::size_t pos = line_start;
        std::size_t part_start = pos;
        int current_width = 0;
        while (pos < end) {
            const auto next = glyph_end(text, pos);
            const int next_width = glyph_width(text, pos, next);
            if (current_width > 0 && current_width + next_width > width) {
                ranges.emplace_back(part_start, pos);
                part_start = pos;
                current_width = 0;
            }
            current_width += next_width;
            pos = next;
        }
        if (part_start < end) ranges.emplace_back(part_start, end);
        if (newline == std::string::npos) break;
        line_start = newline + 1;
    }
    return ranges;
}

int clamp_ask_question_layout_scroll(int offset, int total_rows, int visible_rows) {
    if (total_rows <= 0 || visible_rows <= 0 || total_rows <= visible_rows) return 0;
    return std::clamp(offset, 0, total_rows - visible_rows);
}

AskQuestionLayout build_ask_question_layout(const AskQuestionLayoutInput& input) {
    AskQuestionLayout layout;
    if (!input.snapshot) return layout;

    const auto& snapshot = *input.snapshot;
    const int width = std::max(1, input.viewport_width);
    const int content_width = std::max(1, width - 2);
    layout.terminal_too_narrow = content_width < 16;
    // The scrollbar occupies a small fixed column beside the content. Keep the
    // two option columns within the remaining width so a long title cannot
    // push the description column out of alignment.
    const int row_content_width = std::max(1, content_width - 3);
    layout.number_width = std::min(8, std::max(1, row_content_width / 5));
    const int columns_width = std::max(2, row_content_width - layout.number_width);
    const int content_rows = std::max(1, input.viewport_height - 5);
    const int requested_minimum = std::clamp(input.minimum_visible_rows, 2, 12);
    layout.visible_rows = std::min(
        std::max(1, input.viewport_height),
        std::max(content_rows, requested_minimum));
    layout.title_width = columns_width < 16
        ? std::max(1, columns_width / 2)
        : std::clamp(columns_width * 2 / 5, 8, 36);
    layout.title_width = std::min(layout.title_width,
                                  std::max(1, columns_width - 1));
    layout.description_width = std::max(1, columns_width - layout.title_width);
    layout.scrollbar_x = width - 1;

    int y = 0;
    if (snapshot.page == AskQuestionPage::Summary) {
        append_row(layout, AskQuestionLayoutKind::Header, -1, -1, {},
                   "Summary", {}, false, false, false, y++);
        for (std::size_t qi = 0; qi < snapshot.answers.size(); ++qi) {
            const auto& answer = snapshot.answers[qi];
            std::string value;
            for (const auto& selected : answer.selected) {
                if (!value.empty()) value += ", ";
                value += selected;
            }
            if (!answer.custom_text.empty()) {
                if (!value.empty()) value += ", ";
                value += answer.custom_text;
            }
            if (value.empty()) value = "Not answered";
            if (answer.auto_selected) value = "[Auto-selected] " + value;
            const auto value_lines = ask_question_wrap(value, content_width - 8);
            for (std::size_t line = 0; line < value_lines.size(); ++line) {
                append_row(layout, AskQuestionLayoutKind::Summary,
                           static_cast<int>(qi), -1,
                           line == 0 ? std::to_string(qi + 1) : "",
                           value_lines[line], {}, false,
                           !answer.not_answered, answer.auto_selected, y++);
            }
        }
        append_row(layout, AskQuestionLayoutKind::Submit, -1, 0,
                   "1", "Submit answers", {}, snapshot.submit_focus == 0,
                   false, false, y++);
        append_row(layout, AskQuestionLayoutKind::Cancel, -1, 1,
                   "2", "Cancel", {}, snapshot.submit_focus == 1,
                   false, false, y++);
    } else {
        append_row(layout, AskQuestionLayoutKind::Header,
                   snapshot.current_question, -1, {},
                   "Question " + std::to_string(snapshot.current_question + 1) +
                       "/" + std::to_string(std::max(1, snapshot.total_questions)),
                   snapshot.question_header, false, false, false, y++);
        for (const auto& line : ask_question_wrap(snapshot.question_text, content_width)) {
            append_row(layout, AskQuestionLayoutKind::Question,
                       snapshot.current_question, -1, {}, line, {}, false, false, false, y++);
        }
        for (std::size_t i = 0; i < snapshot.options.size(); ++i) {
            const auto& option = snapshot.options[i];
            const bool focused = snapshot.focused_option == static_cast<int>(i);
            const std::string marker = snapshot.multi_select
                ? (option.selected ? "[x]" : "[ ]")
                : (option.selected ? "(*)" : "( )");
            const auto title_lines = ask_question_wrap(
                display_option_label(option.label, option.recommended),
                layout.title_width);
            const auto description_lines = ask_question_wrap(option.description,
                                                               layout.description_width);
            const std::size_t line_count = std::max(title_lines.size(), description_lines.size());
            for (std::size_t line = 0; line < line_count; ++line) {
                append_row(layout, AskQuestionLayoutKind::Option,
                           snapshot.current_question, static_cast<int>(i),
                           line == 0 ? std::to_string(i + 1) + " " + marker : "",
                           line < title_lines.size() ? title_lines[line] : "",
                           line < description_lines.size() ? description_lines[line] : "",
                           focused, option.selected,
                           option.recommended, y++);
            }
        }
        const int custom_index = static_cast<int>(snapshot.options.size());
        const bool custom_focused =
            snapshot.focused_option == custom_index;
        const bool show_full_custom = snapshot.editing_custom ||
            snapshot.custom_selected || custom_focused;
        std::string custom_value;
        if (snapshot.custom_text.empty() && !show_full_custom) {
            custom_value = "Type your own answer here";
        } else if (!show_full_custom) {
            const auto first_line_end = snapshot.custom_text.find('\n');
            custom_value = snapshot.custom_text.substr(0, first_line_end);
            if (first_line_end != std::string::npos) custom_value += "...";
        } else {
            custom_value = snapshot.custom_text;
        }
        const int custom_width = std::max(1, content_width - 8);
        const auto custom_ranges = snapshot.editing_custom
            ? ask_question_wrap_ranges(snapshot.custom_text, custom_width)
            : ask_question_wrap_ranges(custom_value, custom_width);
        const auto ranges = custom_ranges.empty()
            ? std::vector<std::pair<std::size_t, std::size_t>>{{0, 0}}
            : custom_ranges;
        for (std::size_t line = 0; line < ranges.size(); ++line) {
            const auto [begin, end] = ranges[line];
            std::string line_text = custom_value.substr(begin, end - begin);
            if (line_text.empty() && !snapshot.editing_custom && custom_value.empty()) {
                line_text = "Type your own answer here";
            }
            auto& custom_row = layout.rows.emplace_back(
                AskQuestionLayoutRow{AskQuestionLayoutKind::Custom,
                                      snapshot.current_question, custom_index,
                                      line == 0 ? std::to_string(custom_index + 1) : "",
                                      std::move(line_text), {},
                                      snapshot.focused_option == custom_index,
                                      snapshot.custom_selected, false, false,
                                      begin, end, {0, y++, 0, 1}});
        }
    }
    if (input.timeout_remaining_seconds > 0) {
        append_row(layout, AskQuestionLayoutKind::Hint, -1, -1, {},
                   std::to_string(input.timeout_remaining_seconds) +
                       "s remaining; unanswered items use Recommended when available",
                   {}, false, false, false, y++);
    }
    if (!input.toast.empty()) append_row(layout, AskQuestionLayoutKind::Toast,
                                          -1, -1, {}, input.toast, {}, false, false,
                                          false, y++);
    layout.total_rows = static_cast<int>(layout.rows.size());
    int requested_scroll = snapshot.scroll_offset;
    int focused_begin = -1;
    int focused_end = -1;
    for (int i = 0; i < layout.total_rows; ++i) {
        if (!layout.rows[static_cast<std::size_t>(i)].focused) continue;
        if (focused_begin < 0) focused_begin = i;
        focused_end = i;
    }
    if (focused_begin >= 0 && layout.visible_rows > 0) {
        if (focused_begin < requested_scroll) requested_scroll = focused_begin;
        if (focused_end >= requested_scroll + layout.visible_rows) {
            requested_scroll = focused_end - layout.visible_rows + 1;
        }
    }
    layout.scroll_offset = clamp_ask_question_layout_scroll(
        requested_scroll, layout.total_rows, layout.visible_rows);
    const int end = std::min(layout.total_rows,
                             layout.scroll_offset + layout.visible_rows);
    layout.scrollbar_track = {width - 1, 0, 1, layout.visible_rows};
    if (layout.total_rows > layout.visible_rows && layout.visible_rows > 0) {
        const int thumb_height = std::max(
            1, layout.visible_rows * layout.visible_rows / layout.total_rows);
        const int thumb_range = layout.visible_rows - thumb_height;
        const int max_offset = layout.total_rows - layout.visible_rows;
        const int thumb_y = max_offset > 0
            ? layout.scroll_offset * thumb_range / max_offset : 0;
        layout.scrollbar_thumb = {width - 1, thumb_y, 1, thumb_height};
    } else {
        layout.scrollbar_thumb = {width - 1, 0, 1, 0};
    }
    for (int i = 0; i < layout.total_rows; ++i) {
        auto& row = layout.rows[static_cast<std::size_t>(i)];
        row.rect = {0, i - layout.scroll_offset, content_width, 1};
        if (i < layout.scroll_offset || i >= end) row.rect.height = 0;
        if (row.focused) {
            if (layout.focused_row_begin < 0) layout.focused_row_begin = i;
            layout.focused_row_end = i;
        }
    }
    return layout;
}

int ask_question_scroll_offset_for_y(int y, const AskQuestionLayout& layout) {
    return ask_question_scroll_offset_for_track_y(
        y, layout.scrollbar_track.y, layout.scrollbar_track.height,
        layout.total_rows, layout.visible_rows);
}

int ask_question_scroll_offset_for_track_y(int y,
                                           int track_y,
                                           int track_height,
                                           int total_rows,
                                           int visible_rows) {
    if (total_rows <= visible_rows || visible_rows <= 1 || track_height <= 1) {
        return 0;
    }
    const int relative = std::clamp(y - track_y, 0, track_height - 1);
    const int max_offset = total_rows - visible_rows;
    return clamp_ask_question_layout_scroll(
        relative * max_offset / (track_height - 1), total_rows, visible_rows);
}

int hit_test_ask_question_layout(const AskQuestionLayout& layout, int x, int y) {
    const auto hit = hit_test_ask_question_target(layout, x, y);
    if (hit.kind == AskQuestionHitKind::Option ||
        hit.kind == AskQuestionHitKind::Custom) {
        return hit.option_index;
    }
    return -1;
}

AskQuestionHit hit_test_ask_question_target(const AskQuestionLayout& layout,
                                            int x,
                                            int y) {
    if (layout.scrollbar_track.contains(x, y)) {
        return {AskQuestionHitKind::Scrollbar, -1, -1};
    }
    for (const auto& row : layout.rows) {
        if (row.rect.height <= 0 || !row.rect.contains(x, y)) continue;
        switch (row.kind) {
            case AskQuestionLayoutKind::Option:
                return {AskQuestionHitKind::Option, row.question_index,
                        row.option_index};
            case AskQuestionLayoutKind::Custom:
                return {AskQuestionHitKind::Custom, row.question_index,
                        row.option_index};
            case AskQuestionLayoutKind::Summary:
                return row.question_index >= 0
                    ? AskQuestionHit{AskQuestionHitKind::SummaryQuestion,
                                     row.question_index, -1}
                    : AskQuestionHit{AskQuestionHitKind::None, -1, -1};
            case AskQuestionLayoutKind::Submit:
                return {AskQuestionHitKind::Submit, -1, -1};
            case AskQuestionLayoutKind::Cancel:
                return {AskQuestionHitKind::Cancel, -1, -1};
            default:
                break;
        }
    }
    return {};
}

} // namespace acecode::tui
