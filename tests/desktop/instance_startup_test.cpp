#include <gtest/gtest.h>

#include "desktop/instance_startup.hpp"

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
