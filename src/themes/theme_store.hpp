#pragma once

#include "../upgrade/http.hpp"

#include <atomic>
#include <filesystem>
#include <functional>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <nlohmann/json.hpp>

namespace acecode::themes {

struct ThemeError : std::runtime_error {
    int status;
    std::string code;
    std::string path;
    ThemeError(int status, std::string code, const std::string& message, std::string path = {});
};

bool is_downloadable_theme(const std::string& id);
bool valid_theme_definition(const nlohmann::json& definition);
bool valid_theme_catalog(const nlohmann::json& catalog);

struct ThemeTransport {
    std::function<upgrade::HttpTextResult(const std::string&)> fetch;
    std::function<upgrade::DownloadResult(
        const std::string&, const std::filesystem::path&,
        const upgrade::DownloadProgressCallback&, const upgrade::HttpCancelCheck&)> download;
};

// Owns one cancellable installation; immutable version directories are only
// exposed after validation and an atomic installed-pointer update.
class ThemeStore {
public:
    using UpdateBaseProvider = std::function<std::string()>;
    ThemeStore(std::filesystem::path root, std::string update_base,
               ThemeTransport transport = {});
    ThemeStore(std::filesystem::path root, UpdateBaseProvider update_base,
               ThemeTransport transport = {});
    ~ThemeStore();
    nlohmann::json catalog(bool refresh = false);
    nlohmann::json definition(const std::string& id) const;
    bool installed(const std::string& id) const;
    std::string image(const std::string& id, const std::string& kind);
    nlohmann::json start(const std::string& id, const nlohmann::json& consent);
    nlohmann::json job() const;
    nlohmann::json cancel();

private:
    std::filesystem::path root_;
    UpdateBaseProvider update_base_;
    std::string base_;
    ThemeTransport transport_;
    mutable std::mutex mu_;
    std::mutex catalog_mu_;
    std::mutex start_mu_;
    std::mutex preview_mu_;
    nlohmann::json catalog_;
    nlohmann::json job_ = {{"state", "idle"}};
    std::atomic<bool> cancel_{false};
    std::thread worker_;
    nlohmann::json descriptor(const std::string& id);
    std::filesystem::path installed_directory(const std::string& id) const;
    void install(nlohmann::json entry);
    void update_job(const nlohmann::json& patch);
};

} // namespace acecode::themes
