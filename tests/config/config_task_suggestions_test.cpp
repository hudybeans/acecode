#include <gtest/gtest.h>

#include "config/config.hpp"
#include "utils/uuid.hpp"

#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>

namespace {

class TaskSuggestionConfigTest : public ::testing::Test {
protected:
    void SetUp() override {
        root_ = std::filesystem::temp_directory_path() /
            ("acecode-task-config-" + acecode::generate_uuid_v7());
        std::filesystem::create_directories(root_);
        path_ = (root_ / "config.json").string();
    }
    void TearDown() override {
        std::error_code error;
        std::filesystem::remove_all(root_, error);
    }
    std::filesystem::path root_;
    std::string path_;
};

// 真实配置往返保留阈值和关闭选项,不读取用户配置。
TEST_F(TaskSuggestionConfigTest, ThresholdAndDisabledSettingRoundTrip) {
    for (int threshold : {0, 3, 7, 1000}) {
        acecode::AppConfig config;
        config.task_suggestion_compact_threshold = threshold;
        acecode::save_config(config, path_);
        const auto restored = acecode::load_config_from_path(path_);
        EXPECT_EQ(restored.task_suggestion_compact_threshold, threshold);
    }
}

// 旧配置或无效值保持默认,防止畸形配置变成每次压缩提醒。
TEST_F(TaskSuggestionConfigTest, InvalidThresholdKeepsDefault) {
    for (const auto& value : nlohmann::json::array({-1, 1001, "3", true, nullptr})) {
        {
            std::ofstream output(path_, std::ios::binary | std::ios::trunc);
            output << nlohmann::json{{"task_suggestion_compact_threshold", value}};
        }
        EXPECT_EQ(acecode::load_config_from_path(path_).task_suggestion_compact_threshold, 3);
    }
}

} // namespace
