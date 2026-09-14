#include <gtest/gtest.h>

#include <algorithm>
#include <string>
#include <vector>

#include "ftxui/dom/elements.hpp"
#include "ftxui/screen/screen.hpp"
#include "tui/ask_question_controller.hpp"
#include "tui/ask_question_adapter.hpp"
#include "tui/ask_question_layout.hpp"
#include "tui/ask_question_panel.hpp"
#include "tui/ask_question_view.hpp"

namespace {

using acecode::AskQuestion;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionEventKind;
using acecode::tui::AskQuestionLayout;
using acecode::tui::AskQuestionLayoutInput;
using acecode::tui::AskQuestionLayoutKind;
using acecode::tui::AskQuestionPanelColors;
using acecode::tui::AskQuestionPanelInput;
using acecode::tui::AskQuestionSnapshot;
using acecode::tui::build_ask_question_layout;
using acecode::tui::build_ask_question_help_line;
using acecode::tui::build_ask_question_panel;
using acecode::tui::ask_question_help_entries;

// Distinct colors so a cell's provenance is unambiguous.
const ftxui::Color kChatFg = ftxui::Color::Green;
const ftxui::Color kBorder = ftxui::Color::Cyan;
const ftxui::Color kQuestion = ftxui::Color::White;
const ftxui::Color kAnswer = ftxui::Color::RGB(250, 250, 250);
const ftxui::Color kDescription = ftxui::Color::GrayDark;
const ftxui::Color kPlaceholder = ftxui::Color::RGB(120, 120, 120);
const ftxui::Color kFocusBg = ftxui::Color::RGB(0, 80, 120);
const ftxui::Color kPanelBg = ftxui::Color::RGB(28, 32, 36);
const ftxui::Color kSecondary = ftxui::Color::RGB(160, 160, 160);

AskQuestionPanelColors test_colors() {
    AskQuestionPanelColors colors;
    colors.border = kBorder;
    colors.question = kQuestion;
    colors.answer = kAnswer;
    colors.description = kDescription;
    colors.placeholder = kPlaceholder;
    colors.focus_bg = kFocusBg;
    colors.panel_bg = kPanelBg;
    colors.secondary = kSecondary;
    colors.selection_fg = ftxui::Color::White;
    colors.selection_bg = ftxui::Color::Magenta;
    return colors;
}

AskQuestion single_choice() {
    AskQuestion q;
    q.question = "Pick?";
    q.header = "Pick";
    q.options = {{"Alpha", "first"}, {"Beta", "second"}};
    return q;
}

AskQuestion multi_choice() {
    AskQuestion q = single_choice();
    q.multi_select = true;
    return q;
}

// Reflected geometry is written by the panel while it builds, so it lives in a
// separate mutable holder that the finished frame then copies.
struct FrameGeometry {
    ftxui::Box overlay{0, -1, 0, -1};
    std::vector<ftxui::Box> rows;
    ftxui::Box scrollbar{0, -1, 0, -1};
};

// ftxui::Screen has no default constructor, so the frame is aggregate-built.
struct RenderedFrame {
    ftxui::Screen screen;
    ftxui::Box overlay;
    std::vector<ftxui::Box> rows;
    ftxui::Box scrollbar;
    AskQuestionLayout layout;
};

// Mirrors the production composition: chat viewport with the panel anchored to
// its bottom edge, header above and prompt below.
RenderedFrame render_frame(const AskQuestionSnapshot& snapshot, int width,
                           int height, int viewport_height = 8) {
    const auto layout = build_ask_question_layout(
        AskQuestionLayoutInput{&snapshot, width, viewport_height, 4, 0});
    FrameGeometry geometry;
    geometry.rows.assign(
        static_cast<std::size_t>(std::max(1, layout.visible_rows)),
        ftxui::Box{0, -1, 0, -1});

    AskQuestionPanelInput input;
    input.layout = &layout;
    input.snapshot = &snapshot;
    input.colors = test_colors();
    input.terminal_too_narrow = layout.terminal_too_narrow;
    input.row_boxes = &geometry.rows;
    input.scrollbar_box = &geometry.scrollbar;
    input.overlay_box = &geometry.overlay;
    auto panel = build_ask_question_panel(input);

    ftxui::Elements chat_lines;
    for (int i = 0; i < 6; ++i) {
        chat_lines.push_back(ftxui::text(" chat line " + std::to_string(i)) |
                             ftxui::color(kChatFg));
    }
    auto message = ftxui::vbox(std::move(chat_lines)) | ftxui::flex;
    auto area = acecode::tui::compose_ask_question_message_area(
        std::move(message), std::move(panel), true);
    auto root = ftxui::vbox({
        ftxui::text("header"),
        std::move(area) | ftxui::flex,
        ftxui::text("prompt"),
    });
    auto screen = ftxui::Screen::Create(ftxui::Dimension::Fixed(width),
                                        ftxui::Dimension::Fixed(height));
    ftxui::Render(screen, root);
    return RenderedFrame{std::move(screen), geometry.overlay,
                         std::move(geometry.rows), geometry.scrollbar, layout};
}

int first_row_of_kind(const AskQuestionLayout& layout, AskQuestionLayoutKind kind,
                      bool focused_only = false) {
    for (std::size_t i = 0; i < layout.rows.size(); ++i) {
        const auto& row = layout.rows[i];
        if (row.kind != kind) continue;
        if (focused_only && !row.focused) continue;
        return static_cast<int>(i);
    }
    return -1;
}

TEST(AskQuestionPanelTest, OverflowScrollbarDoesNotCaptureOptionClicks) {
    auto question = single_choice();
    question.options[1].description = std::string(180, 'b');
    AskQuestionController controller({question}, {});
    const auto frame = render_frame(controller.snapshot(), 50, 20, 4);
    ASSERT_GT(frame.layout.total_rows, frame.layout.visible_rows);
    // The rendered bar is one cell with one padding cell on each side.
    EXPECT_EQ(frame.scrollbar.x_max - frame.scrollbar.x_min + 1, 3);

    acecode::tui::AskQuestionFrame hit_frame;
    hit_frame.layout = frame.layout;
    hit_frame.row_boxes = frame.rows;
    hit_frame.scrollbar_box = frame.scrollbar;
    const int option_row = first_row_of_kind(frame.layout, AskQuestionLayoutKind::Option);
    ASSERT_GE(option_row, frame.layout.scroll_offset);
    const auto& box = frame.rows[option_row - frame.layout.scroll_offset];
    const auto hit = acecode::tui::hit_test_ask_question_frame(
        hit_frame, box.x_min + frame.layout.title_x, box.y_min);
    EXPECT_EQ(hit.kind, acecode::tui::AskQuestionHitKind::Option);
    EXPECT_EQ(hit.option_index, 0);
    EXPECT_EQ(acecode::tui::hit_test_ask_question_frame(
        hit_frame, frame.scrollbar.x_min, frame.scrollbar.y_min).kind,
        acecode::tui::AskQuestionHitKind::Scrollbar);
}

TEST(AskQuestionPanelTest, LongCustomEditorKeepsOneVisibleCaretAfterResize) {
    AskQuestionController controller({single_choice()}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0,
                       "\nfirst line\n" + std::string(100, 'a') + "\nlast line"});
    for (const int width : {32, 50, 72}) {
        auto frame = render_frame(controller.snapshot(), width, 20, 4);
        auto wrapped = std::find_if(frame.layout.rows.begin(), frame.layout.rows.end(),
            [](const auto& row) {
                return row.kind == AskQuestionLayoutKind::Custom &&
                       row.text_byte_begin > 20;
            });
        ASSERT_NE(wrapped, frame.layout.rows.end());
        const auto boundary = wrapped->text_byte_begin;
        for (const auto cursor : {std::size_t{0}, boundary}) {
            controller.handle({AskQuestionEventKind::MoveCursorTo, -1, 0, {}, cursor});
            frame = render_frame(controller.snapshot(), width, 20, 4);
            const auto caret_row = std::find_if(frame.layout.rows.begin(), frame.layout.rows.end(),
                [](const auto& row) { return row.has_cursor; });
            ASSERT_NE(caret_row, frame.layout.rows.end());
            EXPECT_EQ(std::count_if(frame.layout.rows.begin(), frame.layout.rows.end(),
                [](const auto& row) { return row.has_cursor; }), 1);
            EXPECT_EQ(caret_row->text_byte_begin, cursor);
            ASSERT_GT(caret_row->rect.height, 0);
            EXPECT_EQ(frame.screen.cursor().shape, ftxui::Screen::Cursor::Block);
            EXPECT_EQ(frame.screen.cursor().y,
                      frame.overlay.y_min + 1 + caret_row->rect.y);
            EXPECT_EQ(frame.screen.cursor().x,
                      frame.overlay.x_min + 1 + frame.layout.title_x);
        }

        AskQuestionController full_line({single_choice()}, {});
        full_line.handle({AskQuestionEventKind::BeginCustom});
        const auto empty_frame = render_frame(full_line.snapshot(), width, 20, 4);
        const int capacity = empty_frame.layout.title_width +
                             empty_frame.layout.column_gap +
                             empty_frame.layout.description_width;
        full_line.handle({AskQuestionEventKind::InsertText, -1, 0,
                          std::string(capacity, 'a')});
        const auto full_frame = render_frame(full_line.snapshot(), width, 20, 4);
        EXPECT_EQ(full_frame.screen.cursor().shape, ftxui::Screen::Cursor::Block);
        EXPECT_LT(full_frame.screen.cursor().x, full_frame.scrollbar.x_min);
    }
}

// Screen row of a logical layout row, given the reflected panel geometry.
int screen_y_of(const RenderedFrame& frame, int logical_row) {
    return frame.overlay.y_min + 1 + (logical_row - frame.layout.scroll_offset);
}

std::string row_text(const ftxui::Screen& screen, int y) {
    std::string out;
    for (int x = 0; x < screen.dimx(); ++x) {
        const auto& character = screen.PixelAt(x, y).character;
        out += character.empty() ? " " : character;
    }
    return out;
}

} // namespace

// 场景:面板必须固定在聊天视口底部,四边都在聊天视口内,不能越出聊天区。
TEST(AskQuestionPanelTest, PanelIsAnchoredToTheBottomOfTheChatViewport) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);

    ASSERT_GE(frame.overlay.x_min, 0);
    ASSERT_LE(frame.overlay.x_max, 60);
    EXPECT_EQ(frame.overlay.y_max, 10) << "panel must sit on the chat bottom edge";
    EXPECT_GE(frame.overlay.y_min, 1);
    EXPECT_EQ(frame.overlay.y_max - frame.overlay.y_min + 1,
              frame.layout.visible_rows + 2);
    // The panel spans the chat viewport, and its interior matches the width the
    // layout grid was computed against.
    EXPECT_EQ(frame.overlay.x_max - frame.overlay.x_min + 1, 60);
    EXPECT_EQ(frame.overlay.x_max - frame.overlay.x_min - 1,
              frame.layout.content_width);
}

// 场景:只有面板矩形自身绘制颜色。面板以外的聊天文字必须保持原色,
// 不能被面板的前景色或底色整体染色。
TEST(AskQuestionPanelTest, ChatContentOutsideThePanelKeepsItsOwnColors) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);

    const int chat_y = 1;
    ASSERT_LT(chat_y, frame.overlay.y_min) << "test needs a visible chat row";
    const auto& cell = frame.screen.PixelAt(2, chat_y);
    EXPECT_EQ(cell.foreground_color, kChatFg);
    EXPECT_EQ(cell.background_color, ftxui::Color::Default)
        << "the panel's background must not bleed above it";
    EXPECT_NE(cell.background_color, kPanelBg);
}

// 场景:边框使用自己的语义色,不需要通过父容器统一着色。
TEST(AskQuestionPanelTest, BorderUsesTheBorderColorOnly) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);
    EXPECT_EQ(frame.screen.PixelAt(frame.overlay.x_min, frame.overlay.y_min)
                  .foreground_color,
              kBorder);
    EXPECT_EQ(frame.screen.PixelAt(frame.overlay.x_min, frame.overlay.y_max)
                  .foreground_color,
              kBorder);
}

// 场景:题目白色加粗;答案白色不加粗;说明灰色不加粗。
TEST(AskQuestionPanelTest, QuestionAnswerAndDescriptionKeepTheirWeights) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);
    const int origin_x = frame.overlay.x_min + 1;

    const int question_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Question);
    ASSERT_GE(question_row, 0);
    {
        const auto& cell =
            frame.screen.PixelAt(origin_x, screen_y_of(frame, question_row));
        EXPECT_EQ(cell.foreground_color, kQuestion);
        EXPECT_TRUE(cell.bold);
    }

    const int option_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Option);
    ASSERT_GE(option_row, 0);
    const auto& option = frame.layout.rows[static_cast<std::size_t>(option_row)];
    const int y = screen_y_of(frame, option_row);
    {
        const auto& cell = frame.screen.PixelAt(frame.overlay.x_min + 1 +
                                                    frame.layout.title_x,
                                                y);
        EXPECT_EQ(cell.foreground_color, kAnswer);
        EXPECT_FALSE(cell.bold);
    }
    {
        const auto& cell = frame.screen.PixelAt(
            frame.overlay.x_min + 1 + frame.layout.description_x, y);
        EXPECT_EQ(cell.foreground_color, kDescription);
        EXPECT_FALSE(cell.bold);
    }
    EXPECT_FALSE(option.description.empty());
}

// 场景:编号、标记、标题、说明四列在屏幕上从固定偏移开始,自定义行与预设项
// 共用同一组偏移,并显示选择标记。
TEST(AskQuestionPanelTest, OptionAndCustomRowsShareOneColumnGrid) {
    AskQuestionController controller({multi_choice()}, {});
    controller.handle({AskQuestionEventKind::ToggleFocused});  // select Alpha
    controller.handle({AskQuestionEventKind::MoveDown});       // focus Beta
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);
    const int origin_x = frame.overlay.x_min + 1;

    const auto& layout = frame.layout;
    const int alpha_row =
        first_row_of_kind(layout, AskQuestionLayoutKind::Option);
    ASSERT_GE(alpha_row, 0);
    const int beta_row = alpha_row + 1;
    ASSERT_EQ(layout.rows[static_cast<std::size_t>(beta_row)].kind,
              AskQuestionLayoutKind::Option);

    for (const int row : {alpha_row, beta_row}) {
        const int y = screen_y_of(frame, row);
        EXPECT_EQ(frame.screen.PixelAt(origin_x, y).character,
                  layout.rows[static_cast<std::size_t>(row)].number);
        // Marker column: both rows start their marker at the same x. This test
        // uses a multi-select question, so the marker is a checkbox.
        EXPECT_EQ(frame.screen.PixelAt(origin_x + layout.number_width + 1, y)
                      .character,
                  "[");
    }
    const int alpha_y = screen_y_of(frame, alpha_row);
    const int beta_y = screen_y_of(frame, beta_row);
    // Both titles start at the same column.
    EXPECT_EQ(frame.screen.PixelAt(origin_x + layout.title_x, alpha_y).character,
              "A");
    EXPECT_EQ(frame.screen.PixelAt(origin_x + layout.title_x, beta_y).character,
              "B");
    // Both descriptions start at the same column.
    EXPECT_EQ(frame.screen.PixelAt(origin_x + layout.description_x, alpha_y)
                  .character,
              "f");
    EXPECT_EQ(frame.screen.PixelAt(origin_x + layout.description_x, beta_y)
                  .character,
              "s");
}

TEST(AskQuestionPanelTest, CustomRowAlignsWithOptionTitlesAndShowsMarker) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);
    const int origin_x = frame.overlay.x_min + 1;

    const int custom_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Custom);
    ASSERT_GE(custom_row, 0);
    const int y = screen_y_of(frame, custom_row);
    const auto& custom = frame.layout.rows[static_cast<std::size_t>(custom_row)];
    ASSERT_TRUE(custom.placeholder);

    EXPECT_EQ(frame.screen.PixelAt(origin_x + frame.layout.title_x, y).character,
              "T");
    EXPECT_EQ(frame.screen.PixelAt(origin_x + frame.layout.title_x, y)
                  .foreground_color,
              kPlaceholder);
    EXPECT_EQ(frame.screen.PixelAt(origin_x + frame.layout.number_width + 1, y)
                  .character,
              "(");
    EXPECT_EQ(frame.screen.PixelAt(origin_x + frame.layout.number_width + 1, y)
                  .foreground_color,
              kDescription);
}

// 场景:已选中项不使用底色,只有焦点项使用底色,并且焦点不改变文字颜色与字重。
TEST(AskQuestionPanelTest, OnlyTheFocusedRowUsesAFocusBackground) {
    AskQuestionController controller({multi_choice()}, {});
    controller.handle({AskQuestionEventKind::ToggleFocused});
    controller.handle({AskQuestionEventKind::MoveDown});
    const auto snapshot = controller.snapshot();
    ASSERT_TRUE(snapshot.options[0].selected);
    ASSERT_FALSE(snapshot.options[1].selected);
    ASSERT_EQ(snapshot.focused_option, 1);

    const auto frame = render_frame(snapshot, 60, 12);
    const int origin_x = frame.overlay.x_min + 1;
    const int alpha_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Option);
    const int beta_row = alpha_row + 1;

    const auto& selected_cell =
        frame.screen.PixelAt(origin_x + frame.layout.title_x,
                             screen_y_of(frame, alpha_row));
    EXPECT_EQ(selected_cell.background_color, kPanelBg)
        << "a selected row must not paint a selection background";

    const auto& focus_cell =
        frame.screen.PixelAt(origin_x + frame.layout.title_x,
                             screen_y_of(frame, beta_row));
    EXPECT_EQ(focus_cell.background_color, kFocusBg);
    EXPECT_EQ(focus_cell.foreground_color, kAnswer)
        << "focus must not change the text color";
    EXPECT_FALSE(focus_cell.bold) << "focus must not change the text weight";
}

// 场景:每道题的汇总块问题与答案顶部对齐、答案列共用同一左边界,
// 块之间空一行,并且问题文本始终在答案之前出现。
TEST(AskQuestionPanelTest, SummaryPairsQuestionsWithAnswersInAlignedColumns) {
    AskQuestionController controller({single_choice(), single_choice()}, {});
    for (int i = 0; i < 2; ++i) {
        controller.handle({AskQuestionEventKind::ChooseOption, 0});
        controller.handle({AskQuestionEventKind::SelectionFeedbackElapsed});
    }
    const auto snapshot = controller.snapshot();
    ASSERT_EQ(snapshot.page, acecode::tui::AskQuestionPage::Summary);
    const auto frame = render_frame(snapshot, 70, 14, 10);
    ASSERT_FALSE(frame.layout.summary_stacked);

    const int origin_x = frame.overlay.x_min + 1;
    int first_item_row = -1;
    int second_item_row = -1;
    int spacer_row = -1;
    for (std::size_t i = 0; i < frame.layout.rows.size(); ++i) {
        const auto& row = frame.layout.rows[i];
        if (row.kind != AskQuestionLayoutKind::Summary) continue;
        if (row.question_index < 0) {
            spacer_row = static_cast<int>(i);
            continue;
        }
        if (row.question_index == 0 && first_item_row < 0) {
            first_item_row = static_cast<int>(i);
        }
        if (row.question_index == 1 && second_item_row < 0) {
            second_item_row = static_cast<int>(i);
        }
    }
    ASSERT_GE(first_item_row, 0);
    ASSERT_GE(second_item_row, 0);
    ASSERT_GE(spacer_row, 0);
    EXPECT_LT(spacer_row, second_item_row) << "items must be separated by a blank row";

    // The answer column starts at the same x for both items.
    const int answer_x = origin_x + frame.layout.summary_answer_x;
    EXPECT_EQ(frame.screen.PixelAt(answer_x, screen_y_of(frame, first_item_row))
                  .character,
              "A");
    EXPECT_EQ(frame.screen.PixelAt(answer_x, screen_y_of(frame, second_item_row))
                  .character,
              "A");
    // The question starts one column group to the left and ends with the colon.
    const int question_x =
        origin_x + frame.layout.number_width + 2;
    EXPECT_EQ(frame.screen.PixelAt(question_x, screen_y_of(frame, first_item_row))
                  .character,
              "P");
}

// 场景:编辑态下终端光标绑定在自定义文本的真实插入点,而不是面板左上角。
TEST(AskQuestionPanelTest, CaretSitsOnTheCustomInsertionPoint) {
    AskQuestionController controller({single_choice()}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "abc"});
    const auto snapshot = controller.snapshot();
    ASSERT_TRUE(snapshot.editing_custom);
    ASSERT_EQ(snapshot.editor.cursor, 3u);

    const auto frame = render_frame(snapshot, 60, 12);
    const int custom_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Custom);
    ASSERT_GE(custom_row, 0);
    EXPECT_EQ(frame.screen.cursor().shape, ftxui::Screen::Cursor::Block);
    EXPECT_EQ(frame.screen.cursor().y, screen_y_of(frame, custom_row));
    EXPECT_EQ(frame.screen.cursor().x,
              frame.overlay.x_min + 1 + frame.layout.title_x + 3);
}

TEST(AskQuestionPanelTest, EmptyCustomBufferStillShowsTheCaret) {
    AskQuestionController controller({single_choice()}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    const auto snapshot = controller.snapshot();
    ASSERT_TRUE(snapshot.editing_custom);
    const auto frame = render_frame(snapshot, 60, 12);
    const int custom_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Custom);
    ASSERT_GE(custom_row, 0);
    EXPECT_EQ(frame.screen.cursor().shape, ftxui::Screen::Cursor::Block);
    EXPECT_EQ(frame.screen.cursor().y, screen_y_of(frame, custom_row));
    EXPECT_EQ(frame.screen.cursor().x,
              frame.overlay.x_min + 1 + frame.layout.title_x);
}

// 场景:面板必须擦掉底下的聊天内容。bgcolor 只画背景色、不写字符,缺了
// clear_under 时没被面板写字的格子会保留聊天文字,表现为「切换模型的提示跑到
// 提问框里」「选项标签后面莫名多出几个字」。
TEST(AskQuestionPanelTest, PanelErasesChatContentUnderneath) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();

    const int width = 60;
    const int height = 16;
    const auto layout = build_ask_question_layout(
        AskQuestionLayoutInput{&snapshot, width, 8, 4, 0});
    std::vector<ftxui::Box> rows(
        static_cast<std::size_t>(std::max(1, layout.visible_rows)));
    ftxui::Box overlay;
    ftxui::Box scrollbar;
    AskQuestionPanelInput input;
    input.layout = &layout;
    input.snapshot = &snapshot;
    input.colors = test_colors();
    input.row_boxes = &rows;
    input.scrollbar_box = &scrollbar;
    input.overlay_box = &overlay;
    auto panel = build_ask_question_panel(input);

    // Chat body filled wall-to-wall with a sentinel glyph so any unerased cell
    // inside the panel is detectable.
    ftxui::Elements chat_lines;
    for (int i = 0; i < 12; ++i) {
        chat_lines.push_back(ftxui::text(std::string(200, 'X')) |
                             ftxui::color(kChatFg));
    }
    auto message = ftxui::vbox(std::move(chat_lines)) | ftxui::flex;
    auto area = acecode::tui::compose_ask_question_message_area(
        std::move(message), std::move(panel), true);
    auto root = ftxui::vbox({
        ftxui::text("header"),
        std::move(area) | ftxui::flex,
        ftxui::text("prompt"),
    });
    auto screen = ftxui::Screen::Create(ftxui::Dimension::Fixed(width),
                                        ftxui::Dimension::Fixed(height));
    ftxui::Render(screen, root);

    ASSERT_GE(overlay.y_min, 1);
    for (int y = overlay.y_min; y <= overlay.y_max; ++y) {
        for (int x = overlay.x_min; x <= overlay.x_max; ++x) {
            EXPECT_NE(screen.PixelAt(x, y).character, "X")
                << "chat content leaked into the panel at (" << x << "," << y
                << ")";
        }
    }
    // And the sentinel is still visible above the panel (the panel did not
    // clear outside its own rectangle).
    EXPECT_EQ(screen.PixelAt(1, 1).character, "X");
}

// 场景:面板内部不承载全局瞬时状态行,否则模型切换之类的通知会被塞进提问框。
TEST(AskQuestionPanelTest, PanelDoesNotRenderTheGlobalStatusLine) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 14);
    std::string drawn;
    for (int y = frame.overlay.y_min; y <= frame.overlay.y_max; ++y) {
        drawn += row_text(frame.screen, y);
    }
    EXPECT_EQ(drawn.find("Switched to"), std::string::npos);
    EXPECT_EQ(drawn.find("openai/"), std::string::npos);
}

// 场景:进入/离开自定义编辑不能让面板随帮助行高度位移。帮助区固定占 2 行时,
// 单选预设焦点、多选预设焦点与行内编辑态渲染出的高度必须一致。
TEST(AskQuestionPanelTest, HelpLineHeightIsStableAcrossInteractionStates) {
    const auto measure = [](const AskQuestionSnapshot& snapshot) {
        const auto help = ask_question_help_entries(snapshot, false);
        auto element = build_ask_question_help_line(
            help, test_colors(), 200, /*minimum_rows=*/2);
        auto size = ftxui::Dimension::Fit(element);
        return size.dimy;
    };

    AskQuestionController preset({single_choice()}, {});
    const int preset_rows = measure(preset.snapshot());

    AskQuestionController multi({multi_choice()}, {});
    const int multi_rows = measure(multi.snapshot());

    AskQuestionController editing({single_choice()}, {});
    editing.handle({AskQuestionEventKind::BeginCustom});
    const int editing_rows = measure(editing.snapshot());

    EXPECT_EQ(preset_rows, 2);
    EXPECT_EQ(multi_rows, 2);
    EXPECT_EQ(editing_rows, 2);
}

// 场景:点击自定义行必须命中自定义行本身,从而进入行内编辑;命中失败就会
// 退回普通输入路径,表现成「弹出底部输入框」。
TEST(AskQuestionPanelTest, CustomRowIsTheClickTargetForInlineEditing) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto frame = render_frame(snapshot, 60, 12);
    const int custom_row =
        first_row_of_kind(frame.layout, AskQuestionLayoutKind::Custom);
    ASSERT_GE(custom_row, 0);
    const auto& row = frame.layout.rows[static_cast<std::size_t>(custom_row)];

    const auto hit = acecode::tui::hit_test_ask_question_target(
        frame.layout, row.rect.x + 1, row.rect.y);
    EXPECT_EQ(hit.kind, acecode::tui::AskQuestionHitKind::Custom);
    EXPECT_EQ(hit.option_index, static_cast<int>(snapshot.options.size()));
}

// 场景:非编辑态面板不得抢占终端光标。
TEST(AskQuestionPanelTest, PanelDoesNotClaimTheCaretOutsideEditing) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    ASSERT_FALSE(snapshot.editing_custom);
    const auto frame = render_frame(snapshot, 60, 12);
    EXPECT_EQ(frame.screen.cursor().shape, ftxui::Screen::Cursor::Hidden);
}

// 场景:快捷键帮助使用“键名: 功能”分层,键名与功能颜色不同。
TEST(AskQuestionPanelTest, HelpLineLayersKeysAndActions) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto help = ask_question_help_entries(snapshot, false);
    ASSERT_FALSE(help.empty());
    EXPECT_EQ(help.front().key, "\xE2\x86\x91\xE2\x86\x93");
    EXPECT_EQ(help.front().action, "移动焦点");
    for (const auto& entry : help) {
        EXPECT_FALSE(entry.key.empty());
        EXPECT_FALSE(entry.action.empty());
        EXPECT_EQ(entry.key.find("up/down"), std::string::npos);
        EXPECT_EQ(entry.key.find("submit"), std::string::npos);
    }

    auto element = build_ask_question_help_line(help, test_colors(), 200);
    auto screen = ftxui::Screen::Create(ftxui::Dimension::Fixed(200),
                                        ftxui::Dimension::Fixed(4));
    ftxui::Render(screen, element);
    EXPECT_EQ(screen.PixelAt(0, 0).foreground_color, kAnswer);
    EXPECT_EQ(screen.PixelAt(2, 0).character, ":");
    EXPECT_EQ(screen.PixelAt(2, 0).foreground_color, kSecondary);
}

TEST(AskQuestionPanelTest, HelpLineWrapsWithinNarrowWidth) {
    AskQuestionController controller({single_choice()}, {});
    const auto snapshot = controller.snapshot();
    const auto help = ask_question_help_entries(snapshot, true);
    auto element = build_ask_question_help_line(help, test_colors(), 30);
    auto screen = ftxui::Screen::Create(ftxui::Dimension::Fixed(30),
                                        ftxui::Dimension::Fixed(10));
    ftxui::Render(screen, element);
    bool wrapped = false;
    for (int y = 1; y < 10; ++y) {
        if (row_text(screen, y).find_first_not_of(' ') != std::string::npos) {
            wrapped = true;
            break;
        }
    }
    EXPECT_TRUE(wrapped) << "long help must wrap instead of overflowing";
    for (int y = 0; y < 10; ++y) {
        for (int x = 30; x < screen.dimx(); ++x) {
            EXPECT_EQ(screen.PixelAt(x, y).character, "");
        }
    }
}

TEST(AskQuestionPanelTest, SummaryHelpUsesRealKeyNames) {
    AskQuestionController controller({single_choice(), single_choice()}, {});
    for (int i = 0; i < 2; ++i) {
        controller.handle({AskQuestionEventKind::ChooseOption, 0});
        controller.handle({AskQuestionEventKind::SelectionFeedbackElapsed});
    }
    const auto snapshot = controller.snapshot();
    const auto help = ask_question_help_entries(snapshot, false);
    ASSERT_FALSE(help.empty());
    EXPECT_EQ(help[0].key, "\xE2\x86\x90");
    EXPECT_EQ(help[1].key, "\xE2\x86\x92");
    EXPECT_EQ(help[2].key, "Enter");
    EXPECT_EQ(help[3].key, "Esc");
}
