#include "config/mcp_config.hpp"
#include "utils/utf8_path.hpp"
#include "utils/text_file_buffer.hpp"
#include "utils/paths.hpp"
#include "tool/apply_patch_tool.hpp"
#include "tool/file_read_tool.hpp"
#include "tool/file_edit_tool.hpp"
#include "tool/file_write_tool.hpp"

#include <gtest/gtest.h>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>

namespace {
using namespace acecode;
using json = nlohmann::json;
namespace fs = std::filesystem;

class ScopedMcpTestHome {
public:
#ifdef _WIN32
    static constexpr const char* name = "USERPROFILE";
#else
    static constexpr const char* name = "HOME";
#endif
    explicit ScopedMcpTestHome(const std::string& home) {
        if (const char* old = std::getenv(name)) previous = old;
        set(home.c_str());
    }
    ~ScopedMcpTestHome() { set(previous ? previous->c_str() : nullptr); }
private:
    std::optional<std::string> previous;
    static void set(const char* value) {
#ifdef _WIN32
        _putenv_s(name, value ? value : "");
#else
        if (value) setenv(name, value, 1);
        else unsetenv(name);
#endif
    }
};

class McpConfigTest : public testing::Test {
protected:
    fs::path root;
    void SetUp() override {
        static std::atomic<unsigned> serial{0};
        root = fs::path(testing::TempDir()) /
            ("ace-mcp-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) +
             "-" + std::to_string(serial++));
        fs::create_directories(root);
        // A user may keep their home directory in Git. Never let a temporary
        // test project discover or mutate that enclosing repository's config.
        fs::create_directories(root / ".git");
    }
    void TearDown() override { std::error_code ec; fs::remove_all(root, ec); }
    static void write(const fs::path& path, const std::string& value) {
        fs::create_directories(path.parent_path());
        std::ofstream out(path, std::ios::binary);
        out << value;
    }
    static std::string read(const fs::path& path) {
        std::ifstream in(path, std::ios::binary);
        return {std::istreambuf_iterator<char>(in), {}};
    }
};

TEST_F(McpConfigTest, SchemaValidatesRawTypesAndTransportRequirements) {
    const json valid = {
        {"local", {{"command", "runner"}, {"args", {"one", "two"}}, {"timeout_seconds", 7}}},
        {"remote", {{"transport", "http"}, {"url", "https://example.test/mcp"}}},
        {"events", {{"transport", "sse"}, {"url", "http://localhost:9000"}, {"disabled", true}}}
    };
    EXPECT_TRUE(validate_mcp_config(valid).empty());
    auto parsed = parse_mcp_config(valid);
    EXPECT_EQ(parsed.at("remote").sse_endpoint, "/mcp");
    EXPECT_EQ(parsed.at("local").timeout_seconds, 7);
    EXPECT_TRUE(validate_mcp_config(serialize_mcp_config(parsed)).empty());
    // JSON Schema integer is a mathematical type: 7.0 is also integral.
    EXPECT_EQ(parse_mcp_config({{"x", {{"command", "ok"}, {"timeout_seconds", 7.0}}}})
                  .at("x").timeout_seconds, 7);
    const std::vector<json> invalid = {
        nullptr, json::array(), {{"x", 1}}, {{"x", json::object()}},
        {{"x", {{"command", " "}}}}, {{"x", {{"command", "ok"}, {"args", "arg"}}}},
        {{"x", {{"command", "ok"}, {"env", {{"TOKEN", 1}}}}}},
        {{"x", {{"command", "ok"}, {"disabled", "false"}}}},
        {{"x", {{"command", "ok"}, {"timeout_seconds", 0}}}},
        {{"x", {{"command", "ok"}, {"timeout_seconds", 1.5}}}},
        {{"x", {{"command", "ok"}, {"timeout_seconds", 18446744073709551615ull}}}},
        {{"x", {{"command", "ok"}, {"transport", "typo"}}}},
        {{"x", {{"command", "ok"}, {"unknown", true}}}},
        {{"x", {{"transport", "http"}}}},
        {{"x", {{"transport", "http"}, {"url", "file:///bad"}}}},
        {{"x", {{"transport", "http"}, {"url", "https://user:secret@host"}}}},
        {{"x", {{"command", "ok"}, {"headers", {{"Authorization", "one\r\ntwo"}}}}}},
        {{"x", {{"command", "ok\n"}}}},
        {{"x", {{"command", "ok"}, {"headers", {{"X-Token\n", "value"}}}}}},
        {{"x", {{"transport", "http"}, {"url", "https://host.test\n"}}}},
        {{std::string(1, '\x1f') + "reserved", {{"command", "ok"}}}}
    };
    for (const auto& candidate : invalid) {
        EXPECT_FALSE(validate_mcp_config(candidate).empty()) << candidate.dump();
        EXPECT_THROW(parse_mcp_config(candidate), McpConfigError);
    }
}

TEST_F(McpConfigTest, DiagnosticsContainSchemaAndPointersWithoutSecretValues) {
    try {
        parse_mcp_config({{"server", {{"command", "ok"}, {"env", {{"TOKEN", json::array({"secret-123"})}}}}}});
        FAIL();
    } catch (const McpConfigError& e) {
        EXPECT_EQ(e.payload()["schema"], mcp_config_schema());
        EXPECT_EQ(e.payload()["errors"][0]["path"], "/server/env/TOKEN");
        EXPECT_EQ(std::string(e.what()).find("secret-123"), std::string::npos);
    }
}

TEST_F(McpConfigTest, HiddenTokensArePreservedOnlyWhenOmitted) {
    const auto prior = parse_mcp_config({{"x", {{"transport", "http"}, {"url", "https://example.test"}, {"auth_token", "secret"}}}});
    auto safe = serialize_mcp_config(prior, false);
    EXPECT_FALSE(safe["x"].contains("auth_token"));
    EXPECT_EQ(parse_mcp_config(safe, &prior).at("x").auth_token, "secret");
    safe["x"]["auth_token"] = "";
    EXPECT_TRUE(parse_mcp_config(safe, &prior).at("x").auth_token.empty());
}

TEST_F(McpConfigTest, ProjectOverlayShadowsWithoutMutatingGlobalAndResolvesFromSubdirectory) {
    fs::create_directories(root / ".git");
    fs::create_directories(root / "src" / "nested");
    const auto global = parse_mcp_config({{"shared", {{"command", "global"}}}, {"other", {{"command", "other"}}}});
    save_project_mcp_config(path_to_utf8(root), {{"shared", {{"command", "project"}, {"disabled", true}}}});
    const auto project = load_project_mcp_config(path_to_utf8(root / "src" / "nested"));
    const auto effective = effective_mcp_config(global, project);
    EXPECT_TRUE(effective.at("shared").disabled);
    EXPECT_EQ(effective.at("shared").command, "project");
    EXPECT_EQ(effective.at("other").command, "other");
    EXPECT_EQ(global.at("shared").command, "global");
    EXPECT_EQ(mcp_project_server_id(path_to_utf8(root), "shared"),
              mcp_project_server_id(path_to_utf8(root / "src"), "shared"));
    fs::create_directories(root / "nested-repo" / ".git");
    EXPECT_TRUE(load_project_mcp_config(path_to_utf8(root / "nested-repo")).empty());
}

TEST_F(McpConfigTest, InvalidProjectWritesLeaveFileAndSnapshotUnchanged) {
    const auto cwd = path_to_utf8(root);
    save_project_mcp_config(cwd, {{"x", {{"command", "good"}}}});
    const auto path = mcp_project_config_path(cwd);
    const auto before = read(path_from_utf8(path));
    const auto snapshot = read(path_from_utf8(mcp_last_good_path(path)));
    EXPECT_THROW(save_project_mcp_config(cwd, {{"x", {{"command", 7}}}}), McpConfigError);
    EXPECT_EQ(read(path_from_utf8(path)), before);
    EXPECT_EQ(read(path_from_utf8(mcp_last_good_path(path))), snapshot);
}

TEST_F(McpConfigTest, ProjectDiscoveryStopsBeforeTheGlobalHomeRepository) {
    const auto home = root / "home";
    const auto workspace = home / "projects" / "independent";
    fs::create_directories(workspace);
    fs::create_directories(home / ".git");
    ScopedMcpTestHome scoped_home(path_to_utf8(home));
    save_project_mcp_config(path_to_utf8(home), {{"home-only", {{"command", "home-command"}}}});
    EXPECT_TRUE(load_project_mcp_config(path_to_utf8(workspace)).empty());
    save_project_mcp_config(path_to_utf8(workspace), {{"local", {{"command", "local-command"}}}});
    EXPECT_TRUE(fs::exists(workspace / ".acecode" / "mcp.json"));
    EXPECT_EQ(load_project_mcp_config(path_to_utf8(home)).size(), 1u);
    EXPECT_TRUE(load_project_mcp_config(path_to_utf8(home)).count("home-only"));
}

TEST_F(McpConfigTest, ManagedEditsValidateTheMigratedGlobalDataDirectory) {
    const auto home = root / "home";
    const auto data = root / "relocated-data";
    fs::create_directories(data);
    ScopedMcpTestHome scoped_home(path_to_utf8(home));
    DataDirRedirect redirect;
    redirect.data_dir = path_to_utf8(data);
    ASSERT_TRUE(write_data_dir_redirect(path_to_utf8(home / ".acecode"), redirect));
    EXPECT_THROW(validate_mcp_file_edit(path_to_utf8(data / "config.json"),
        R"({"mcp_servers":{"bad":{"command":false}}})"), McpConfigError);
    EXPECT_TRUE(validate_mcp_file_edit(path_to_utf8(data / "config.json"),
        R"({"mcp_servers":{}})").has_value());
}

TEST_F(McpConfigTest, StartupRestoresInvalidProjectJsonAndRejectsInvalidSnapshot) {
    const auto cwd = path_to_utf8(root);
    save_project_mcp_config(cwd, {{"x", {{"command", "good"}}}});
    const auto path = mcp_project_config_path(cwd);
    write(path_from_utf8(path), "{broken");
    EXPECT_EQ(load_project_mcp_config(cwd).at("x").command, "good");
    EXPECT_EQ(json::parse(read(path_from_utf8(path)))["mcp_servers"]["x"]["command"], "good");
    write(path_from_utf8(path), "{broken-again");
    write(path_from_utf8(mcp_last_good_path(path)), R"({"x":{"command":3}})");
    EXPECT_THROW(load_project_mcp_config(cwd), McpConfigError);
    EXPECT_EQ(read(path_from_utf8(path)), "{broken-again");
}

TEST_F(McpConfigTest, SnapshotFailureRollsBackAcceptedProjectWrite) {
    const auto cwd = path_to_utf8(root);
    save_project_mcp_config(cwd, {{"x", {{"command", "original"}}}});
    const auto path = path_from_utf8(mcp_project_config_path(cwd));
    const auto snapshot = path_from_utf8(mcp_last_good_path(path_to_utf8(path)));
    const auto before = read(path);
    ASSERT_TRUE(fs::remove(snapshot));
    ASSERT_TRUE(fs::create_directory(snapshot));
    EXPECT_THROW(save_project_mcp_config(cwd, {{"x", {{"command", "replacement"}}}}), std::runtime_error);
    EXPECT_EQ(read(path), before);
    EXPECT_TRUE(fs::is_directory(snapshot));
}

TEST_F(McpConfigTest, GlobalRecoveryPreservesOtherSettingsAndNeverPartiallyLoads) {
    const auto path = path_to_utf8(root / "config.json");
    json original = {{"mcp_servers", {{"x", {{"command", "good"}}}}}, {"max_sessions", 10}};
    write(path_from_utf8(path), original.dump());
    EXPECT_FALSE(recover_mcp_config(original, path));
    json edited = {{"mcp_servers", {{"x", {{"command", "new"}}}, {"bad", {{"command", 4}}}}}, {"max_sessions", 55}};
    write(path_from_utf8(path), edited.dump());
    EXPECT_TRUE(recover_mcp_config(edited, path));
    EXPECT_EQ(edited["max_sessions"], 55);
    EXPECT_EQ(edited["mcp_servers"], original["mcp_servers"]);
    EXPECT_EQ(json::parse(read(path_from_utf8(path))), edited);
}

TEST_F(McpConfigTest, KnownConfigurationFileEditsAreStrictAndOtherFilesAreUnaffected) {
    const auto path = path_to_utf8(root / ".acecode" / "mcp.json");
    EXPECT_THROW(validate_mcp_file_edit(path, R"({"mcp_servers":{"bad":{}}})"), McpConfigError);
    EXPECT_THROW(validate_mcp_file_edit(path, R"({"mcp_servers":{},"typo":true})"), McpConfigError);
    EXPECT_THROW(validate_mcp_file_edit(path, "{bad-json"), McpConfigError);
    EXPECT_TRUE(validate_mcp_file_edit(path, R"({"mcp_servers":{}})")->empty());
    EXPECT_FALSE(validate_mcp_file_edit(path_to_utf8(root / "notes.json"), "anything").has_value());
}

TEST_F(McpConfigTest, GeneralConfigSaveAndStartupUseTheSameMcpContract) {
    const auto path = path_to_utf8(root / "config.json");
    auto config = load_config_from_path(path);
    config.mcp_servers = parse_mcp_config({{"x", {{"command", "good"}}}});
    save_config(config, path);
    const auto saved = read(path_from_utf8(path));
    config.mcp_servers.at("x").args = {std::string("bad\0arg", 7)};
    EXPECT_THROW(save_config(config, path), McpConfigError);
    EXPECT_EQ(read(path_from_utf8(path)), saved);
    auto corrupted = json::parse(saved);
    corrupted["max_sessions"] = 77;
    corrupted["mcp_servers"]["x"]["command"] = false;
    write(path_from_utf8(path), corrupted.dump());
    const auto recovered = load_config_from_path(path);
    EXPECT_EQ(recovered.mcp_servers.at("x").command, "good");
    EXPECT_EQ(recovered.max_sessions, 77);
}

TEST_F(McpConfigTest, ManagedWriteEditAndPatchRejectBeforeChangingAnyFiles) {
    const auto cwd = path_to_utf8(root);
    const auto path = mcp_project_config_path(cwd);
    ToolContext context;
    const auto invalid = R"({"mcp_servers":{"x":{"command":false}}})";
    auto result = create_file_write_tool().execute(
        json{{"file_path", path}, {"content", invalid}}.dump(), context);
    EXPECT_FALSE(result.success);
    EXPECT_FALSE(fs::exists(path_from_utf8(path)));
    EXPECT_NE(result.output.find("schema"), std::string::npos);
    save_project_mcp_config(cwd, {{"x", {{"command", "good"}}}});
    const auto before = read(path_from_utf8(path));
    ASSERT_TRUE(create_file_read_tool().execute(json{{"file_path", path}}.dump(), context).success);
    result = create_file_edit_tool().execute(
        json{{"file_path", path}, {"old_string", "\"good\""}, {"new_string", "false"}}.dump(), context);
    EXPECT_FALSE(result.success);
    EXPECT_EQ(read(path_from_utf8(path)), before);
    const auto other = path_to_utf8(root / "other.txt");
    const auto patch = "*** Begin Patch\n*** Add File: " + other + "\n+keep absent\n" +
        "*** Update File: " + path + "\n@@\n-      \"command\": \"good\"\n+      \"command\": false\n*** End Patch\n";
    result = create_apply_patch_tool().execute(json{{"patch", patch}}.dump(), context);
    EXPECT_FALSE(result.success);
    EXPECT_NE(result.output.find("schema"), std::string::npos);
    EXPECT_FALSE(fs::exists(path_from_utf8(other)));
    EXPECT_EQ(read(path_from_utf8(path)), before);
}
} // namespace
