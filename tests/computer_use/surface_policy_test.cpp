#include "computer_use/surface_policy.hpp"
#include <gtest/gtest.h>

namespace acecode::computer_use::surface_policy {
namespace {
Evidence base() {
    Evidence evidence;
    evidence.root = 10;
    evidence.candidate = 20;
    evidence.root_pid = evidence.candidate_pid = 42;
    evidence.visible = true;
    return evidence;
}
} // namespace

TEST(ComputerUseSurfacePolicy, SameProcessAndThreadAreInsufficientWithoutOwnership) {
    auto evidence = base();
    evidence.menu_thread_matches = true;
    EXPECT_FALSE(classify(evidence));
    evidence.owner_chain_same_process = true;
    evidence.owner_chain = {99};
    EXPECT_FALSE(classify(evidence));
    evidence.owner_chain = {30, 10};
    ASSERT_TRUE(classify(evidence));
    EXPECT_EQ(*classify(evidence), Relation::owned);
}

TEST(ComputerUseSurfacePolicy, OwnershipCannotCrossProcessesOrIncludeHiddenWindows) {
    auto evidence = base();
    evidence.owner_chain = {10};
    evidence.owner_chain_same_process = true;
    evidence.candidate_pid = 99;
    EXPECT_FALSE(classify(evidence));
    evidence.candidate_pid = 42;
    evidence.visible = false;
    EXPECT_FALSE(classify(evidence));
    evidence.visible = true;
    evidence.owner_chain_same_process = false;
    EXPECT_FALSE(classify(evidence));
}

TEST(ComputerUseSurfacePolicy, StandardMenuRequiresActiveMenuOwnerAndMatchingThread) {
    auto evidence = base();
    evidence.standard_menu = true;
    evidence.owner_chain = {10};
    evidence.owner_chain_same_process = true;
    EXPECT_FALSE(classify(evidence));
    evidence.menu_active = true;
    evidence.menu_thread_matches = true;
    EXPECT_FALSE(classify(evidence));
    evidence.menu_owner_in_root_tree = true;
    ASSERT_TRUE(classify(evidence));
    EXPECT_EQ(*classify(evidence), Relation::menu);
    evidence.menu_thread_matches = false;
    EXPECT_FALSE(classify(evidence));
}

TEST(ComputerUseSurfacePolicy, ComboListsRequireExactComboBoxInfoBinding) {
    auto evidence = base();
    evidence.combo_list = true;
    evidence.owner_chain = {10};
    evidence.owner_chain_same_process = true;
    EXPECT_FALSE(classify(evidence));
    evidence.exact_combo_list_match = true;
    ASSERT_TRUE(classify(evidence));
    EXPECT_EQ(*classify(evidence), Relation::combo);
}

TEST(ComputerUseSurfacePolicy, MainImageIdentityDoesNotDependOnPopupOrder) {
    auto evidence = base();
    evidence.candidate = evidence.root;
    EXPECT_EQ(*classify(evidence), Relation::root);
    const std::vector<std::string> screenshots{"root-image", "popup-image", "menu-image"};
    EXPECT_EQ(select_screenshot(screenshots, std::string("root-image")), 0);
    EXPECT_EQ(select_screenshot(screenshots, std::string("popup-image")), 1);
    EXPECT_EQ(select_screenshot(screenshots, std::string("menu-image")), 2);
}

TEST(ComputerUseSurfacePolicy, MultipleImagesRequireExplicitUnambiguousScreenshotId) {
    EXPECT_EQ(select_screenshot({"root", "popup"}, std::nullopt), -2);
    EXPECT_EQ(select_screenshot({"root", "popup"}, std::string("previous-observation")), -1);
    EXPECT_EQ(select_screenshot({"root", ""}, std::nullopt), 0);
    EXPECT_EQ(select_screenshot({"", "popup"}, std::nullopt), -1);
    EXPECT_EQ(select_screenshot({"", "popup"}, std::string("popup")), 1);
    EXPECT_EQ(select_screenshot({"", ""}, std::nullopt), -1);
    EXPECT_EQ(select_screenshot({"duplicate", "duplicate"}, std::string("duplicate")), -2);
}

} // namespace acecode::computer_use::surface_policy
