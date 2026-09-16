#include <gtest/gtest.h>
#include "channels/state.hpp"
#include <chrono>
#include <fstream>
#include <thread>

namespace acecode::channels {
namespace {
class ChannelStateTest : public testing::Test {
protected:
    std::filesystem::path dir = std::filesystem::path(testing::TempDir()) /
        ("acecode-channel-state-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count()));
    void TearDown() override { std::error_code ec; std::filesystem::remove_all(dir, ec); }
    Address dm{"100@s.whatsapp.net", "200@s.whatsapp.net", "200@s.whatsapp.net", false};
};
TEST_F(ChannelStateTest, DefaultsDenyAndPersistsIndependentBindings) {
    State state(dir); state.load();
    EXPECT_FALSE(state.enabled());
    EXPECT_FALSE(state.allowed(dm, true));
    state.set_enabled(true);
    state.set_access(dm.account, dm.sender, true);
    state.bind(dm, "session-one");
    state.remember(dm, "receipt-one");
    State restored(dir); restored.load();
    EXPECT_TRUE(restored.enabled());
    EXPECT_TRUE(restored.allowed(dm, false));
    EXPECT_EQ(restored.session(dm), "session-one");
    EXPECT_TRUE(restored.receipt(dm, "receipt-one"));
    auto other = dm; other.account = "101@s.whatsapp.net";
    EXPECT_FALSE(restored.allowed(other, true));
    EXPECT_FALSE(restored.session(other));
    EXPECT_FALSE(restored.receipt(other, "receipt-one"));
    restored.set_access(dm.account, dm.sender, false);
    EXPECT_FALSE(restored.allowed(dm, true));
}
TEST_F(ChannelStateTest, GroupRequiresPeerGroupAndMentionAndIsolatesSenders) {
    State state(dir);
    auto group = dm; group.chat = "123-456@g.us"; group.group = true;
    state.set_access(dm.account, dm.sender, true);
    EXPECT_FALSE(state.allowed(group, true));
    state.set_access(dm.account, group.chat, true);
    EXPECT_FALSE(state.allowed(group, false));
    EXPECT_TRUE(state.allowed(group, true));
    state.bind(group, "group-one");
    group.sender = "300@lid";
    EXPECT_FALSE(state.allowed(group, true));
    EXPECT_FALSE(state.session(group));
}
TEST_F(ChannelStateTest, SetupMergesAccessAndEnablesWithOneValidatedCommit) {
    State state(dir);
    state.set_access(dm.account, dm.sender, true);
    state.set_access(dm.account, "123-456@g.us", true);
    state.bind(dm, "existing-session");
    state.remember(dm, "receipt");
    const auto before = state.snapshot();
    EXPECT_THROW(state.enable_with_access(dm.account, {dm.account, "bad"}), std::exception);
    EXPECT_EQ(state.snapshot(), before);
    EXPECT_THROW(state.enable_with_access(dm.account, {}), std::exception);
    EXPECT_FALSE(state.enabled());
    state.enable_with_access(dm.account, {dm.account, "300@s.whatsapp.net"});
    State loaded(dir); loaded.load();
    EXPECT_TRUE(loaded.enabled());
    EXPECT_TRUE(loaded.allowed(dm, true));
    EXPECT_TRUE(loaded.allowed({dm.account, dm.account, dm.account, false}, true));
    EXPECT_TRUE(loaded.allowed({dm.account, "300@s.whatsapp.net", "300@s.whatsapp.net", false}, true));
    EXPECT_TRUE(loaded.allowed({dm.account, "123-456@g.us", dm.sender, true}, true));
    EXPECT_EQ(loaded.session(dm), "existing-session");
    EXPECT_TRUE(loaded.receipt(dm, "receipt"));
}
TEST_F(ChannelStateTest, RejectsInvalidIdentityAndCorruptState) {
    State state(dir);
    EXPECT_THROW(state.set_access(dm.account, "*@s.whatsapp.net", true), std::exception);
    EXPECT_THROW(state.bind(dm, "../other"), std::exception);
    EXPECT_FALSE(state.session(dm));
    auto bad = dm; bad.chat = "300@s.whatsapp.net";
    EXPECT_FALSE(bad.valid());
    std::filesystem::create_directories(dir);
    std::ofstream(dir / "state.json") << "{broken";
    EXPECT_THROW(state.load(), std::exception);
}
TEST_F(ChannelStateTest, ReceiptsAreIdempotentAndRollbackable) {
    State state(dir);
    state.remember(dm, "one"); state.remember(dm, "one");
    EXPECT_EQ(state.snapshot()["receipts"].size(), 1);
    state.forget(dm, "one");
    EXPECT_FALSE(state.receipt(dm, "one"));
    EXPECT_THROW(state.remember(dm, ""), std::exception);
}
TEST_F(ChannelStateTest, ConfigurationDoesNotTouchHistoryOrRefreshExistingInstances) {
    State owner(dir);
    owner.enable_with_access(dm.account, {dm.account});
    owner.bind(dm, "original-session");
    State standby(dir); standby.load();
    const auto before = owner.snapshot();
    State setup(dir); setup.load();
    setup.enable_with_access(dm.account, {dm.sender}, std::string(32, 'a'));
    std::ifstream file(dir / "state.json");
    EXPECT_EQ(Json::parse(file), before);
    file.close();
    EXPECT_FALSE(owner.allowed(dm, true));
    EXPECT_EQ(owner.transport_directory(), dir);
    owner.remember(dm, "late-receipt");
    owner.bind(dm, "updated-session");
    standby.reload_history();
    EXPECT_FALSE(standby.allowed(dm, true));
    EXPECT_EQ(standby.transport_directory(), dir);
    EXPECT_TRUE(standby.receipt(dm, "late-receipt"));
    EXPECT_EQ(standby.session(dm), "updated-session");
    State next(dir); next.load();
    EXPECT_TRUE(next.allowed(dm, true));
    EXPECT_TRUE(next.receipt(dm, "late-receipt"));
    EXPECT_EQ(next.session(dm), "updated-session");
    EXPECT_EQ(next.transport_directory(), dir / "profiles" / std::string(32, 'a'));
}
TEST_F(ChannelStateTest, LegacyOwnerCannotOverwriteSavedConfiguration) {
    auto legacy = State(dir).snapshot();
    legacy.erase("profile");
    legacy["enabled"] = true;
    legacy["access"][dm.account] = Json::array({dm.account});
    std::filesystem::create_directories(dir);
    std::ofstream(dir / "state.json") << legacy.dump();
    State setup(dir); setup.load();
    EXPECT_TRUE(setup.enabled());
    setup.enable_with_access(dm.account, {dm.sender});
    // Simulate an old binary rewriting its complete state after configuration.
    legacy["enabled"] = false;
    std::ofstream(dir / "state.json") << legacy.dump();
    State next(dir); next.load();
    EXPECT_TRUE(next.enabled());
    EXPECT_TRUE(next.allowed(dm, true));
    EXPECT_EQ(next.transport_directory(), dir);
}
TEST_F(ChannelStateTest, ConcurrentConfigurationEditsMergeWithoutUpdatingRuntimeSnapshots) {
    State first(dir), second(dir);
    first.enable_with_access(dm.account, {dm.account});
    second.load();
    std::thread a([&] { for (int i = 100; i < 110; ++i) first.set_access(dm.account, std::to_string(i) + "@lid", true); });
    std::thread b([&] { for (int i = 200; i < 210; ++i) second.set_access(dm.account, std::to_string(i) + "@lid", true); });
    a.join(); b.join();
    EXPECT_EQ(first.snapshot().at("access").at(dm.account).size(), 11);
    EXPECT_EQ(second.snapshot().at("access").at(dm.account).size(), 11);
    State next(dir); next.load();
    EXPECT_EQ(next.snapshot().at("access").at(dm.account).size(), 21);
    EXPECT_FALSE(std::filesystem::exists(dir / "state.json"));
}
TEST_F(ChannelStateTest, RejectsInvalidProfilesAndCorruptConfigurationWithoutChangingState) {
    State state(dir);
    const auto before = state.snapshot();
    for (const auto* profile : {"../auth", "C:/outside", "AA", ""}) {
        if (!*profile) continue;
        EXPECT_THROW(state.enable_with_access(dm.account, {dm.account}, std::string(profile)), std::exception);
        EXPECT_EQ(state.snapshot(), before);
    }
    std::filesystem::create_directories(dir);
    std::ofstream(dir / "config.json") << "{broken";
    EXPECT_THROW(state.load(), std::exception);
    EXPECT_THROW(state.set_enabled(true), std::exception);
    EXPECT_EQ(state.snapshot(), before);
}
TEST_F(ChannelStateTest, MediaContainmentUsesResolvedPath) {
    std::filesystem::create_directories(dir / "media");
    std::ofstream(dir / "outside.txt") << "outside";
    std::ofstream(dir / "media" / "inside.txt") << "inside";
    EXPECT_TRUE(path_inside(dir / "media" / "inside.txt", dir / "media"));
    EXPECT_FALSE(path_inside(dir / "media" / ".." / "outside.txt", dir / "media"));
    EXPECT_FALSE(path_inside(dir / "media", dir / "media"));
    EXPECT_FALSE(path_inside(dir / "media" / "missing.txt", dir / "media"));
}
} // namespace
} // namespace acecode::channels
