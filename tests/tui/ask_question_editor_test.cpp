#include <gtest/gtest.h>

#include "tui/ask_question_editor.hpp"

using acecode::tui::AskQuestionEditor;

TEST(AskQuestionEditorTest, EditsUtf8AndReplacesSelection) {
    AskQuestionEditor editor("A\xE4\xB8\xAD" "B");
    editor.set_cursor(4); // after the three-byte Chinese glyph
    EXPECT_TRUE(editor.backspace());
    EXPECT_EQ(editor.text(), "AB");
    EXPECT_EQ(editor.cursor(), 1u);

    editor.select_all();
    editor.insert("done");
    EXPECT_EQ(editor.text(), "done");
    EXPECT_EQ(editor.cursor(), 4u);
    EXPECT_FALSE(editor.has_selection());
}

TEST(AskQuestionEditorTest, MovesAcrossLinesWithStableGoalColumn) {
    AskQuestionEditor editor("first\nxy\nthird");
    editor.set_cursor(3);
    EXPECT_TRUE(editor.move_down());
    EXPECT_EQ(editor.cursor(), 8u); // end of "xy"
    EXPECT_TRUE(editor.move_down());
    EXPECT_EQ(editor.cursor(), 12u); // third character of "third"
    EXPECT_TRUE(editor.move_up());
    EXPECT_EQ(editor.cursor(), 8u);
}

TEST(AskQuestionEditorTest, CutSelectionReturnsAndDeletesText) {
    AskQuestionEditor editor("hello");
    editor.set_cursor(1);
    EXPECT_TRUE(editor.move_right(true));
    EXPECT_TRUE(editor.move_right(true));
    EXPECT_EQ(editor.selected_text(), "el");
    EXPECT_EQ(editor.cut_selection(), "el");
    EXPECT_EQ(editor.text(), "hlo");
    EXPECT_EQ(editor.cursor(), 1u);
}

TEST(AskQuestionEditorTest, CollapsedSelectionDoesNotSelectInsertedText) {
    AskQuestionEditor editor;
    editor.select_all();
    editor.insert("answer");
    EXPECT_FALSE(editor.has_selection());
    EXPECT_EQ(editor.text(), "answer");
}
