#include <gtest/gtest.h>
#include "themes/theme_store.hpp"
#include "utils/sha256.hpp"
#include "utils/utf8_path.hpp"
#include <chrono>
#include <fstream>
#include <map>
#include <vector>
#include <zip.h>

namespace {
namespace fs = std::filesystem;
using nlohmann::json;
using namespace acecode::themes;

class ThemeStoreTest : public ::testing::Test {
protected:
    fs::path root;
    std::string archive_bytes;
    json definition;
    json catalog;
    std::atomic<int> downloads{0};
    bool corrupt = false;
    bool offline = false;
    bool hold = false;
    bool fail_download = false;

    void SetUp() override {
        root = fs::temp_directory_path() / ("ace-theme-test-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count()));
        fs::create_directories(root);
        const std::string png = std::string("\x89PNG\r\n\x1a\n", 8) + std::string(24, 'x');
        json colors = json::object();
        for (const auto* key : {"bg", "surface", "surface-alt", "surface-hi", "shell-hi", "shell-bg",
            "border", "border-soft", "fg", "fg-2", "fg-mute", "accent", "accent-bg", "accent-soft",
            "ok", "ok-bg", "ok-border", "warn", "warn-bg", "danger", "danger-bg", "code-bg", "code-fg",
            "code-line", "selection", "on-selection", "send-bg", "send-fg"}) colors[key] = "#ABCDEF";
        definition = {{"schema_version", 1}, {"id", "eva-01"}, {"version", "1.0.0"}, {"mode", "light"},
            {"colors", colors}, {"background", {{"bytes", png.size()}, {"sha256", acecode::sha256_hex(png)}}},
            {"thumbnail", {{"bytes", png.size()}, {"sha256", acecode::sha256_hex(png)}}}};
        make_archive({{"theme.json", definition.dump()}, {"background.png", png}, {"thumbnail.png", png}});
        catalog = {{"schema_version", 1}, {"themes", json::array({{
            {"id", "eva-01"}, {"version", "1.0.0"}, {"swatches", {"#ABCDEF", "#FFFFFF", "#ABCDEF"}},
            {"package", {{"path", "eva-01/1.0.0/theme.zip"}, {"bytes", archive_bytes.size()}, {"sha256", acecode::sha256_hex(archive_bytes)}}},
            {"thumbnail", {{"path", "eva-01/1.0.0/thumbnail.png"}, {"bytes", png.size()}, {"sha256", acecode::sha256_hex(png)}}}
        }})}};
    }

    void TearDown() override { std::error_code ec; fs::remove_all(root, ec); }

    void make_archive(const std::map<std::string, std::string>& files) {
        const auto path = root / "fixture.zip";
        int error = 0;
        auto* zip = zip_open(acecode::path_to_utf8(path).c_str(), ZIP_CREATE | ZIP_TRUNCATE, &error);
        ASSERT_NE(zip, nullptr);
        for (const auto& [name, bytes] : files) {
            auto* source = zip_source_buffer(zip, bytes.data(), bytes.size(), 0);
            ASSERT_GE(zip_file_add(zip, name.c_str(), source, ZIP_FL_ENC_UTF_8), 0);
        }
        ASSERT_EQ(zip_close(zip), 0);
        std::ifstream stream(path, std::ios::binary);
        archive_bytes = {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
    }

    ThemeTransport transport() {
        return {
            [this](const std::string&) {
                acecode::upgrade::HttpTextResult result;
                result.status_code = offline ? 503 : 200;
                result.body = catalog.dump();
                return result;
            },
            [this](const std::string&, const fs::path& path,
                   const acecode::upgrade::DownloadProgressCallback& progress,
                   const acecode::upgrade::HttpCancelCheck& cancel) {
                ++downloads;
                acecode::upgrade::DownloadResult result;
                if (fail_download) { result.status_code = 503; return result; }
                while (hold && !cancel()) std::this_thread::sleep_for(std::chrono::milliseconds(2));
                if (cancel()) { result.cancelled = true; return result; }
                std::ofstream stream(path, std::ios::binary);
                auto bytes = corrupt ? archive_bytes + "corruption" : archive_bytes;
                stream.write(bytes.data(), bytes.size()); stream.close();
                if (progress) progress({bytes.size()});
                result.status_code = 200;
                result.bytes_written = bytes.size();
                return result;
            }
        };
    }

    json consent() {
        auto e = catalog["themes"][0];
        return {{"confirm_download", true}, {"version", e["version"]},
            {"bytes", e["package"]["bytes"]}, {"sha256", e["package"]["sha256"]}};
    }

    json finish(ThemeStore& store) {
        for (int i = 0; i < 500; ++i) {
            auto job = store.job();
            if (job["state"] != "downloading" && job["state"] != "installing") return job;
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
        ADD_FAILURE() << "Theme job did not finish";
        return store.job();
    }
};

TEST_F(ThemeStoreTest, CatalogAndDefinitionRejectUnsafePathsAndExecutableValues) {
    EXPECT_TRUE(valid_theme_catalog(catalog));
    EXPECT_TRUE(valid_theme_definition(definition));
    auto invalid = catalog;
    invalid["themes"][0]["package"]["path"] = "https://example.com/theme.zip";
    EXPECT_FALSE(valid_theme_catalog(invalid));
    invalid = catalog; invalid["themes"][0]["version"] = "../outside";
    EXPECT_FALSE(valid_theme_catalog(invalid));
    auto theme = definition; theme["colors"]["bg"] = "url(https://example.com)";
    EXPECT_FALSE(valid_theme_definition(theme));
    theme = definition; theme["colors"]["unknown"] = "#FFFFFF";
    EXPECT_FALSE(valid_theme_definition(theme));
    theme = definition; theme["mode"] = "dark";
    EXPECT_FALSE(valid_theme_definition(theme));
}

TEST_F(ThemeStoreTest, NoDownloadUntilExactSizeAndIdentityAreConfirmed) {
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    EXPECT_FALSE(store.catalog()["themes"][0]["installed"]);
    EXPECT_EQ(downloads.load(), 0);
    EXPECT_THROW(store.start("eva-01", json::object()), ThemeError);
    auto wrong = consent(); wrong["bytes"] = 1;
    EXPECT_THROW(store.start("eva-01", wrong), ThemeError);
    wrong = consent(); wrong["sha256"] = std::string(64, '0');
    EXPECT_THROW(store.start("eva-01", wrong), ThemeError);
    EXPECT_EQ(downloads.load(), 0);
}

TEST_F(ThemeStoreTest, CatalogFailureReportsTheConfiguredMirrorAddress) {
    offline = true;
    ThemeStore store(root / "cache", "https://mirror.example/custom/", transport());
    try {
        store.catalog(true);
        FAIL() << "Expected catalogue failure";
    } catch (const ThemeError& error) {
        EXPECT_EQ(error.code, "THEME_CATALOG_UNAVAILABLE");
        EXPECT_EQ(error.path, "https://mirror.example/custom/themes/catalog.json");
        EXPECT_NE(std::string(error.what()).find("503"), std::string::npos);
    }
    EXPECT_EQ(downloads.load(), 0);
}

TEST_F(ThemeStoreTest, CurrentServerReplacesStartupAddressAndScopesCachedCatalog) {
    std::string base = "https://old.example/aupdate/";
    ThemeStore store(root / "cache", [&] { return base; }, transport());
    offline = true;
    EXPECT_THROW(store.catalog(), ThemeError);

    base = "http://new.example:82/aupdate/";
    offline = false;
    EXPECT_EQ(store.catalog()["themes"][0]["package"]["url"],
              base + "themes/eva-01/1.0.0/theme.zip");

    offline = true;
    ThemeStore same_server(root / "cache", base, transport());
    EXPECT_TRUE(same_server.catalog(true)["offline"]);
    base = "https://old.example/aupdate/";
    try {
        store.catalog();
        FAIL() << "A different server must not reuse the previous catalogue";
    } catch (const ThemeError& error) {
        EXPECT_EQ(error.path, base + "themes/catalog.json");
    }
    ThemeStore different_server(root / "cache", base, transport());
    EXPECT_THROW(different_server.catalog(), ThemeError);
    EXPECT_EQ(downloads.load(), 0);
}

TEST_F(ThemeStoreTest, ActiveDownloadRetainsConfirmedSourceAfterServerChange) {
    std::string base = "https://old.example/aupdate/";
    auto io = transport();
    const auto download = io.download;
    std::atomic<bool> started{false};
    std::atomic<bool> wait_for_switch{true};
    std::vector<std::string> download_urls;
    io.download = [&](const std::string& url, const fs::path& path,
                      const acecode::upgrade::DownloadProgressCallback& progress,
                      const acecode::upgrade::HttpCancelCheck& cancel) {
        download_urls.push_back(url);
        started.store(true);
        while (wait_for_switch.load() && !cancel()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
        return download(url, path, progress, cancel);
    };
    ThemeStore store(root / "cache", [&] { return base; }, std::move(io));
    store.start("eva-01", consent());
    for (int i = 0; i < 500 && !started.load(); ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    ASSERT_TRUE(started.load());
    base = "http://new.example:82/aupdate/";
    const auto entry = store.catalog()["themes"][0];
    EXPECT_EQ(entry["package"]["url"], base + "themes/eva-01/1.0.0/theme.zip");
    EXPECT_EQ(entry["thumbnail"]["url"], base + "themes/eva-01/1.0.0/thumbnail.png");
    wait_for_switch.store(false);
    ASSERT_EQ(finish(store)["state"], "completed");
    store.start("eva-01", consent());
    ASSERT_EQ(finish(store)["state"], "completed");
    ASSERT_EQ(download_urls.size(), 2u);
    EXPECT_EQ(download_urls[0], "https://old.example/aupdate/themes/eva-01/1.0.0/theme.zip");
    EXPECT_EQ(download_urls[1], base + "themes/eva-01/1.0.0/theme.zip");
}

TEST_F(ThemeStoreTest, DownloadFailureReportsArchiveAddressAndSuccessfulRetryClearsIt) {
    ThemeStore store(root / "cache", "https://mirror.example/custom/", transport());
    EXPECT_EQ(store.catalog()["themes"][0]["package"]["url"],
              "https://mirror.example/custom/themes/eva-01/1.0.0/theme.zip");
    fail_download = true;
    store.start("eva-01", consent());
    const auto failed = finish(store);
    EXPECT_EQ(failed["error"], "THEME_DOWNLOAD_FAILED");
    EXPECT_EQ(failed["error_path"], "https://mirror.example/custom/themes/eva-01/1.0.0/theme.zip");
    EXPECT_FALSE(store.installed("eva-01"));
    fail_download = false;
    store.start("eva-01", consent());
    const auto completed = finish(store);
    EXPECT_EQ(completed["state"], "completed");
    EXPECT_FALSE(completed.contains("error_path"));
}

TEST_F(ThemeStoreTest, VerifiedInstallationSurvivesOfflineRestartWithoutRedownload) {
    {
        ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
        store.start("eva-01", consent());
        EXPECT_EQ(finish(store)["state"], "completed");
        EXPECT_EQ(store.definition("eva-01"), definition);
        EXPECT_EQ(store.image("eva-01", "background").size(), 32);
    }
    offline = true;
    ThemeStore reopened(root / "cache", "https://example.com/aupdate/", transport());
    EXPECT_TRUE(reopened.installed("eva-01"));
    EXPECT_TRUE(reopened.catalog(true)["offline"]);
    EXPECT_EQ(reopened.definition("eva-01")["mode"], "light");
    EXPECT_EQ(downloads.load(), 1);
}

TEST_F(ThemeStoreTest, CorruptedDownloadIsNotInstalledAndCanBeRetried) {
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    corrupt = true;
    store.start("eva-01", consent());
    EXPECT_EQ(finish(store)["error"], "THEME_INVALID_PACKAGE");
    EXPECT_FALSE(store.installed("eva-01"));
    corrupt = false;
    store.start("eva-01", consent());
    EXPECT_EQ(finish(store)["state"], "completed");
}

TEST_F(ThemeStoreTest, CancellationAndConcurrentInstallRetainNoPartialTheme) {
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    hold = true;
    store.start("eva-01", consent());
    EXPECT_THROW(store.start("eva-01", consent()), ThemeError);
    store.cancel();
    EXPECT_EQ(finish(store)["state"], "cancelled");
    EXPECT_FALSE(store.installed("eva-01"));
}

TEST_F(ThemeStoreTest, RedownloadRepairsDamagedInstalledResources) {
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    store.start("eva-01", consent());
    ASSERT_EQ(finish(store)["state"], "completed");
    {
        std::ofstream damaged(root / "cache/eva-01/1.0.0/background.png", std::ios::binary);
        damaged << "damaged";
    }
    EXPECT_FALSE(store.installed("eva-01"));
    store.start("eva-01", consent());
    EXPECT_EQ(finish(store)["state"], "completed");
    EXPECT_EQ(store.definition("eva-01"), definition);
    EXPECT_EQ(downloads.load(), 2);
}

TEST_F(ThemeStoreTest, AuthenticatedHashCannotAuthorizeAnUnsafeArchiveEntry) {
    make_archive({{"../outside", "evil"}, {"theme.json", definition.dump()}, {"thumbnail.png", "x"}});
    catalog["themes"][0]["package"]["bytes"] = archive_bytes.size();
    catalog["themes"][0]["package"]["sha256"] = acecode::sha256_hex(archive_bytes);
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    store.start("eva-01", consent());
    EXPECT_EQ(finish(store)["error"], "THEME_INVALID_PACKAGE");
    EXPECT_FALSE(fs::exists(root / "outside"));
}

TEST_F(ThemeStoreTest, NewVersionRequiresConsentAndPreservesOldResourcesUntilSuccessfulUpdate) {
    ThemeStore store(root / "cache", "https://example.com/aupdate/", transport());
    store.start("eva-01", consent());
    ASSERT_EQ(finish(store)["state"], "completed");
    const auto old_consent = consent();
    const auto old_definition = definition;
    const auto old_catalog = catalog;
    const auto png = store.image("eva-01", "background");
    definition["version"] = "1.0.1";
    make_archive({{"theme.json", definition.dump()}, {"background.png", png}, {"thumbnail.png", png}});
    auto& e = catalog["themes"][0];
    e["version"] = "1.0.1";
    e["package"] = {{"path", "eva-01/1.0.1/theme.zip"}, {"bytes", archive_bytes.size()},
                    {"sha256", acecode::sha256_hex(archive_bytes)}};
    e["thumbnail"]["path"] = "eva-01/1.0.1/thumbnail.png";
    const auto available = store.catalog(true)["themes"][0];
    EXPECT_TRUE(available["installed"]);
    EXPECT_EQ(available["installed_version"], "1.0.0");
    EXPECT_TRUE(available["update_available"]);
    EXPECT_EQ(downloads.load(), 1);
    EXPECT_THROW(store.start("eva-01", old_consent), ThemeError);
    EXPECT_EQ(downloads.load(), 1);

    corrupt = true;
    store.start("eva-01", consent());
    ASSERT_EQ(finish(store)["state"], "failed");
    EXPECT_EQ(store.definition("eva-01"), old_definition);
    EXPECT_TRUE(store.catalog()["themes"][0]["update_available"]);
    corrupt = false;
    store.start("eva-01", consent());
    ASSERT_EQ(finish(store)["state"], "completed");
    EXPECT_EQ(store.definition("eva-01"), definition);
    EXPECT_EQ(store.catalog()["themes"][0]["installed_version"], "1.0.1");
    EXPECT_FALSE(store.catalog()["themes"][0]["update_available"]);
    EXPECT_TRUE(fs::is_regular_file(root / "cache/eva-01/1.0.0/background.png"));

    catalog = old_catalog;
    EXPECT_FALSE(store.catalog(true)["themes"][0]["update_available"]);
    EXPECT_EQ(store.definition("eva-01")["version"], "1.0.1");
}
} // namespace
