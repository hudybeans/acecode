#include <gtest/gtest.h>

#include <algorithm>
#include <string>
#include <vector>

#include "ftxui/dom/elements.hpp"
#include "ftxui/screen/screen.hpp"
#include "tool/ask_user_question_types.hpp"
#include "tui/ask_question_controller.hpp"
#include "tui/ask_question_layout.hpp"
#include "tui/ask_question_panel.hpp"
#include "tui/ask_question_view.hpp"

namespace {

using acecode::AskQuestion;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionLayoutInput;
using acecode::tui::AskQuestionPanelColors;
using acecode::tui::AskQuestionPanelInput;
using acecode::tui::build_ask_question_layout;
using acecode::tui::build_ask_question_panel;
using acecode::tui::compose_ask_question_message_area;
using ftxui::Box;
using ftxui::Element;
using ftxui::Elements;
using ftxui::Render;
using ftxui::Screen;

ftxui::Element make_question_overlay(int viewport_rows) {
    Elements rows;
    for (int row = 0; row < std::max(1, viewport_rows - 2); ++row) {
        rows.push_back(ftxui::text("question row"));
    }
    return ftxui::vbox(std::move(rows)) | ftxui::border;
}

// Composes the same shape production uses -- header above and prompt below a
// shared chat viewport -- and returns the measured chat viewport height.
int render_viewport_rows(bool shared_area, int previous_rows) {
    Box viewport;
    auto message = ftxui::text("chat") | ftxui::reflect(viewport) | ftxui::flex;
    auto overlay = make_question_overlay(previous_rows);
    Element root;
    if (shared_area) {
        auto question_area = compose_ask_question_message_area(
            std::move(message), std::move(overlay), true);
        root = ftxui::vbox({
            ftxui::text("header"),
            std::move(question_area) | ftxui::flex,
            ftxui::text("footer"),
        });
    } else {
        root = ftxui::vbox({
            ftxui::text("header"),
            std::move(message),
            std::move(overlay),
            ftxui::text("footer"),
        });
    }
    auto screen = Screen::Create(ftxui::Dimension::Fixed(80),
                                 ftxui::Dimension::Fixed(24));
    Render(screen, root);
    return viewport.y_max >= viewport.y_min
        ? viewport.y_max - viewport.y_min + 1
        : 0;
}

} // namespace

// 场景:浮层不参与聊天视口的高度计算,否则多行内容会让视口逐帧抖动。
TEST(AskQuestionViewTest, OverlayDoesNotFeedItsHeightBackIntoChatViewport) {
    int previous_rows = 8;
    int first_rows = 0;
    for (int frame = 0; frame < 6; ++frame) {
        const int current_rows = render_viewport_rows(true, previous_rows);
        if (frame == 0) first_rows = current_rows;
        EXPECT_EQ(current_rows, first_rows);
        previous_rows = current_rows;
    }
}

TEST(AskQuestionViewTest, InactiveOverlayLeavesMessageViewUnchanged) {
    Box viewport;
    auto message = ftxui::text("chat") | ftxui::reflect(viewport);
    auto root = compose_ask_question_message_area(std::move(message),
                                                  ftxui::text("unused"), false);
    auto screen = Screen::Create(ftxui::Dimension::Fixed(20),
                                 ftxui::Dimension::Fixed(5));
    Render(screen, root);
    EXPECT_EQ(viewport.x_min, 0);
    EXPECT_EQ(viewport.y_min, 0);
    EXPECT_EQ(viewport.x_max, 19);
    EXPECT_EQ(viewport.y_max, 4);
}

// 场景:启用浮层时面板被推到共享区域的底部,而不是留在顶部,且四边仍在
// 聊天视口内。
TEST(AskQuestionViewTest, PanelIsPushedToTheBottomOfTheSharedArea) {
    AskQuestion question;
    question.question = "Pick?";
    question.header = "Pick";
    question.options = {{"Alpha", "first"}, {"Beta", "second"}};
    AskQuestionController controller({question}, {});
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout(
        AskQuestionLayoutInput{&snapshot, 40, 6, 4, 0});
    std::vector<Box> row_boxes(
        static_cast<std::size_t>(std::max(1, layout.visible_rows)));
    Box overlay;
    Box scrollbar;
    AskQuestionPanelInput input;
    input.layout = &layout;
    input.snapshot = &snapshot;
    input.colors = AskQuestionPanelColors{};
    input.row_boxes = &row_boxes;
    input.scrollbar_box = &scrollbar;
    input.overlay_box = &overlay;

    Box viewport;
    auto message = ftxui::text("chat") | ftxui::reflect(viewport) | ftxui::flex;
    auto area = compose_ask_question_message_area(
        std::move(message), build_ask_question_panel(input), true);
    auto root = ftxui::vbox({
        ftxui::text("header"),
        std::move(area) | ftxui::flex,
        ftxui::text("prompt"),
    });
    auto screen = Screen::Create(ftxui::Dimension::Fixed(60),
                                 ftxui::Dimension::Fixed(14));
    Render(screen, root);

    ASSERT_GE(viewport.y_min, 0);
    EXPECT_EQ(viewport.y_min, 1);
    EXPECT_EQ(viewport.y_max, 12);
    EXPECT_EQ(overlay.y_max, viewport.y_max)
        << "panel bottom must coincide with the chat viewport bottom";
    EXPECT_GE(overlay.y_min, viewport.y_min);
    EXPECT_EQ(overlay.y_max - overlay.y_min + 1, layout.visible_rows + 2);
    EXPECT_LE(overlay.x_max - overlay.x_min + 1,
              viewport.x_max - viewport.x_min + 1);
}
