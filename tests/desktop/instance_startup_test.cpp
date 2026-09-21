#include <gtest/gtest.h>

#include "desktop/instance_startup.hpp"

using acecode::desktop::is_valid_instance_id;
using acecode::desktop::parse_allow_multiple_instances;
using acecode::desktop::plan_instance_startup;

TEST(DesktopInstanceStartup, PrimaryRetainsStableRuntimeWithEitherPreference) {
    for (bool enabled : {false, true}) {
        const auto plan = plan_instance_startup(enabled, true, "primary");
        EXPECT_TRUE(plan.start);
        EXPECT_TRUE(plan.primary);
        EXPECT_EQ(plan.run_subdirectory, "desktop-shared");
    }
}

TEST(DesktopInstanceStartup, DisabledPreferenceRejectsAdditionalInstance) {
    const auto plan = plan_instance_startup(false, false, "extra");
    EXPECT_FALSE(plan.start);
    EXPECT_FALSE(plan.primary);
    EXPECT_TRUE(plan.run_subdirectory.empty());
}

TEST(DesktopInstanceStartup, EnabledPreferenceSeparatesAllAdditionalRuntimes) {
    const auto first = plan_instance_startup(true, false, "instance-a");
    const auto second = plan_instance_startup(true, false, "instance-b");
    EXPECT_TRUE(first.start);
    EXPECT_TRUE(second.start);
    EXPECT_FALSE(first.primary);
    EXPECT_FALSE(second.primary);
    EXPECT_EQ(first.run_subdirectory, "desktop-instances/instance-a");
    EXPECT_NE(first.run_subdirectory, second.run_subdirectory);
    EXPECT_NE(second.run_subdirectory, "desktop-shared");
}

TEST(DesktopInstanceStartup, AcceptsIdentitiesSafeForEveryFilesystem) {
    EXPECT_TRUE(is_valid_instance_id("acecode-f33bbdb9cef6"));
    EXPECT_TRUE(is_valid_instance_id("a"));
    EXPECT_TRUE(is_valid_instance_id("My.Project_2"));
    EXPECT_TRUE(is_valid_instance_id(std::string(64, 'a')));
}

TEST(DesktopInstanceStartup, RejectsAnythingThatCouldEscapeItsDirectory) {
    EXPECT_FALSE(is_valid_instance_id(""));
    EXPECT_FALSE(is_valid_instance_id("with space"));
    EXPECT_FALSE(is_valid_instance_id("path/traversal"));
    EXPECT_FALSE(is_valid_instance_id(".."));
    EXPECT_FALSE(is_valid_instance_id("../escape"));
    EXPECT_FALSE(is_valid_instance_id("back\\slash"));
    EXPECT_FALSE(is_valid_instance_id(std::string("null\0inside", 11)));
    EXPECT_FALSE(is_valid_instance_id(std::string(65, 'a')));
}

TEST(DesktopInstanceStartup, RejectsAllDotIdentitiesThatResolveToADirectory) {
    // 字符白名单会放过点号，必须单独挡掉"."与".."这类目录自指
    EXPECT_FALSE(is_valid_instance_id("."));
    EXPECT_FALSE(is_valid_instance_id(".."));
    EXPECT_FALSE(is_valid_instance_id("..."));
    // 含点号但不是一个纯点号序列的标识仍然有效
    EXPECT_TRUE(is_valid_instance_id("a.b"));
    EXPECT_TRUE(is_valid_instance_id("a..b"));
    EXPECT_TRUE(is_valid_instance_id("..a"));
    EXPECT_TRUE(is_valid_instance_id("-"));
}

TEST(DesktopInstanceStartup, MultipleInstanceOverrideUsesAnAffirmativeWhitelist) {
    for (const std::string value : {"1", "true", "TRUE", "True", "yes", "YES", "on", "ON"}) {
        EXPECT_TRUE(parse_allow_multiple_instances(value)) << value;
    }
    for (const std::string value : {"", "0", "false", "no", "off", "maybe", "2", "-1"}) {
        EXPECT_FALSE(parse_allow_multiple_instances(value)) << value;
    }
}

TEST(DesktopInstanceStartup, InjectedIdentityOnlyAppliesToAdditionalInstances) {
    const auto primary = plan_instance_startup(false, true, "acecode-f33bbdb9cef6");
    EXPECT_EQ(primary.run_subdirectory, "desktop-shared");
    const auto extra = plan_instance_startup(true, false, "acecode-f33bbdb9cef6");
    EXPECT_EQ(extra.run_subdirectory, "desktop-instances/acecode-f33bbdb9cef6");
}
