#include "theme_store.hpp"

#include "../upgrade/version.hpp"
#include "../utils/atomic_file.hpp"
#include "../utils/sha256.hpp"
#include "../utils/utf8_path.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <iterator>
#include <map>
#include <memory>
#include <set>
#include <zip.h>

namespace acecode::themes {
namespace fs = std::filesystem;
using nlohmann::json;
namespace {
constexpr std::uintmax_t kMaxPackageBytes = 16 * 1024 * 1024;
constexpr std::uintmax_t kMaxPreviewBytes = 256 * 1024;
const std::set<std::string> kColors = {
    "bg", "surface", "surface-alt", "surface-hi", "shell-hi", "shell-bg",
    "border", "border-soft", "fg", "fg-2", "fg-mute", "accent", "accent-bg",
    "accent-soft", "ok", "ok-bg", "ok-border", "warn", "warn-bg", "danger",
    "danger-bg", "code-bg", "code-fg", "code-line", "selection", "on-selection",
    "send-bg", "send-fg"
};

bool hex(const json& value, std::size_t length, bool prefix = false) {
    if (!value.is_string()) return false;
    const auto& text = value.get_ref<const std::string&>();
    return text.size() == length && (!prefix || text[0] == '#') &&
        std::all_of(text.begin() + (prefix ? 1 : 0), text.end(), [](unsigned char c) {
            return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
        });
}

bool version_ok(const json& value) {
    if (!value.is_string()) return false;
    const auto& s = value.get_ref<const std::string&>();
    return !s.empty() && s.size() <= 40 && s.front() >= '0' && s.front() <= '9' &&
        std::all_of(s.begin(), s.end(), [](unsigned char c) {
            return (c >= '0' && c <= '9') || c == '.' || c == '-' || (c >= 'a' && c <= 'z');
        }) && s.find("..") == std::string::npos;
}

bool asset_ok(const json& asset, std::uintmax_t limit) {
    return asset.is_object() && asset.contains("bytes") && asset["bytes"].is_number_unsigned() &&
        asset["bytes"].get<std::uintmax_t>() > 0 && asset["bytes"].get<std::uintmax_t>() <= limit &&
        asset.contains("sha256") && hex(asset["sha256"], 64);
}

std::string read_file(const fs::path& file, std::uintmax_t limit) {
    std::error_code ec;
    if (!fs::is_regular_file(file, ec) || ec || fs::file_size(file, ec) > limit || ec) {
        throw ThemeError(404, "THEME_NOT_INSTALLED", "Theme resource is unavailable", path_to_utf8(file));
    }
    std::ifstream stream(file, std::ios::binary);
    if (!stream) throw ThemeError(404, "THEME_NOT_INSTALLED", "Theme resource is unavailable", path_to_utf8(file));
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}

json read_json(const fs::path& file) {
    return json::parse(read_file(file, 128 * 1024));
}

void write_file(const fs::path& file, const std::string& bytes) {
    if (!atomic_write_file(path_to_utf8(file), bytes)) {
        throw ThemeError(500, "THEME_SAVE_FAILED", "Could not save theme resources", path_to_utf8(file));
    }
}

bool matches_file(const fs::path& file, const json& expected) {
    try {
        auto bytes = read_file(file, kMaxPackageBytes);
        return bytes.size() == expected.at("bytes").get<std::uintmax_t>() &&
            sha256_hex(bytes) == expected.at("sha256").get<std::string>();
    } catch (...) { return false; }
}

bool png(const std::string& bytes) {
    return bytes.size() >= 24 && bytes.compare(0, 8, "\x89PNG\r\n\x1a\n", 8) == 0;
}

bool busy(const json& job) {
    const auto state = job.value("state", "idle");
    return state == "downloading" || state == "installing";
}

std::string theme_base(std::string update_base) {
    while (!update_base.empty() && update_base.back() == '/') update_base.pop_back();
    return update_base + "/themes/";
}

std::map<std::string, std::string> unpack(const fs::path& zip_path) {
    int error = 0;
    std::unique_ptr<zip_t, decltype(&zip_discard)> archive(
        zip_open(path_to_utf8(zip_path).c_str(), ZIP_RDONLY, &error), zip_discard);
    if (!archive || zip_get_num_entries(archive.get(), 0) != 3) {
        throw ThemeError(422, "THEME_INVALID_PACKAGE", "Theme archive must contain three resources");
    }
    std::map<std::string, std::string> files;
    for (zip_uint64_t i = 0; i < 3; ++i) {
        zip_stat_t info{};
        zip_uint8_t os = 0;
        zip_uint32_t attributes = 0;
        if (zip_stat_index(archive.get(), i, 0, &info) || !info.name ||
            zip_file_get_external_attributes(archive.get(), i, 0, &os, &attributes)) {
            throw ThemeError(422, "THEME_INVALID_PACKAGE", "Invalid archive metadata");
        }
        const std::string name = info.name;
        const auto limit = name == "theme.json" ? 32 * 1024 :
            name == "thumbnail.png" ? kMaxPreviewBytes : kMaxPackageBytes;
        const auto type = (attributes >> 16) & 0170000;
        if ((name != "theme.json" && name != "background.png" && name != "thumbnail.png") ||
            files.count(name) || !info.size || info.size > limit ||
            ((os == ZIP_OPSYS_UNIX || os == ZIP_OPSYS_OS_X) && type && type != 0100000)) {
            throw ThemeError(422, "THEME_INVALID_PACKAGE", "Unsupported theme archive entry");
        }
        std::unique_ptr<zip_file_t, decltype(&zip_fclose)> file(zip_fopen_index(archive.get(), i, 0), zip_fclose);
        std::string bytes(static_cast<std::size_t>(info.size), '\0');
        std::size_t offset = 0;
        while (file && offset < bytes.size()) {
            const auto n = zip_fread(file.get(), bytes.data() + offset, bytes.size() - offset);
            if (n <= 0) break;
            offset += static_cast<std::size_t>(n);
        }
        if (!file || offset != bytes.size()) {
            throw ThemeError(422, "THEME_INVALID_PACKAGE", "Truncated theme archive entry");
        }
        files.emplace(name, std::move(bytes));
    }
    return files;
}
} // namespace

ThemeError::ThemeError(int status, std::string code, const std::string& message, std::string path)
    : std::runtime_error(message), status(status), code(std::move(code)), path(std::move(path)) {}

bool is_downloadable_theme(const std::string& id) { return id == "eva-01"; }

bool valid_theme_definition(const json& d) {
    try {
        if (d.at("schema_version") != 1 || d.at("id") != "eva-01" ||
            !version_ok(d.at("version")) || d.at("mode") != "light" ||
            !d.at("colors").is_object() || d.at("colors").size() != kColors.size() ||
            !asset_ok(d.at("background"), kMaxPackageBytes) ||
            !asset_ok(d.at("thumbnail"), kMaxPreviewBytes)) return false;
        for (const auto& key : kColors) if (!hex(d.at("colors").at(key), 7, true)) return false;
        return true;
    } catch (...) { return false; }
}

bool valid_theme_catalog(const json& catalog) {
    try {
        if (catalog.at("schema_version") != 1 || !catalog.at("themes").is_array() ||
            catalog.at("themes").size() != 1) return false;
        const auto& e = catalog.at("themes")[0];
        if (e.at("id") != "eva-01" || !version_ok(e.at("version")) ||
            !asset_ok(e.at("package"), kMaxPackageBytes) ||
            !asset_ok(e.at("thumbnail"), kMaxPreviewBytes) ||
            !e.at("swatches").is_array() || e.at("swatches").size() != 3) return false;
        const auto prefix = "eva-01/" + e.at("version").get<std::string>() + "/";
        if (e.at("package").at("path") != prefix + "theme.zip" ||
            e.at("thumbnail").at("path") != prefix + "thumbnail.png") return false;
        for (const auto& color : e.at("swatches")) if (!hex(color, 7, true)) return false;
        return true;
    } catch (...) { return false; }
}

ThemeStore::ThemeStore(fs::path root, std::string update_base, ThemeTransport transport)
    : ThemeStore(std::move(root), [update_base = std::move(update_base)] { return update_base; },
                 std::move(transport)) {}

ThemeStore::ThemeStore(fs::path root, UpdateBaseProvider update_base, ThemeTransport transport)
    : root_(std::move(root)), update_base_(std::move(update_base)),
      base_(theme_base(update_base_())), transport_(std::move(transport)) {
    if (!transport_.fetch) transport_.fetch = [](const std::string& url) { return upgrade::fetch_text(url, 10000); };
    if (!transport_.download) transport_.download = [](const std::string& url, const fs::path& path,
            const upgrade::DownloadProgressCallback& progress, const upgrade::HttpCancelCheck& cancel) {
        return upgrade::download_to_file(url, path, 120000, progress, cancel);
    };
    try {
        auto cached = read_json(root_ / "catalog.json");
        if (cached.value("source_base_url", "") == base_ && valid_theme_catalog(cached.at("catalog"))) {
            catalog_ = std::move(cached["catalog"]);
        }
    }
    catch (...) {}
}

ThemeStore::~ThemeStore() {
    cancel_.store(true);
    if (worker_.joinable()) worker_.join();
}

json ThemeStore::catalog(bool refresh) {
    std::lock_guard<std::mutex> fetch_lock(catalog_mu_);
    const auto current_base = theme_base(update_base_());
    if (base_ != current_base) {
        base_ = current_base;
        catalog_ = nullptr;
    }
    bool offline = false;
    std::string failure_message = "Could not load theme catalog";
    if (refresh || catalog_.is_null()) {
        try {
            auto response = transport_.fetch(base_ + "catalog.json");
            if (response.body.size() > 128 * 1024) {
                throw ThemeError(503, "THEME_CATALOG_UNAVAILABLE", "Theme catalog is too large");
            }
            auto parsed = json::parse(response.body, nullptr, false);
            if (response.status_code != 200 || !response.error.empty())
                throw ThemeError(503, "THEME_CATALOG_UNAVAILABLE", response.error.empty()
                    ? "Theme catalog request failed: HTTP " + std::to_string(response.status_code) : response.error);
            if (!valid_theme_catalog(parsed))
                throw ThemeError(503, "THEME_CATALOG_UNAVAILABLE", "Invalid theme catalog response");
            catalog_ = std::move(parsed);
            write_file(root_ / "catalog.json", json{{"source_base_url", base_}, {"catalog", catalog_}}.dump());
        } catch (const std::exception& error) { offline = true; failure_message = error.what(); }
        catch (...) { offline = true; }
    }
    if (catalog_.is_null()) throw ThemeError(503, "THEME_CATALOG_UNAVAILABLE", failure_message, base_ + "catalog.json");
    auto result = catalog_;
    for (auto& entry : result["themes"]) {
        std::string installed_version;
        try { installed_version = definition(entry["id"]).at("version").get<std::string>(); }
        catch (const ThemeError&) {} // Missing or damaged resources remain downloadable.
        const auto local = upgrade::parse_sem_version(installed_version);
        const auto available = upgrade::parse_sem_version(entry["version"].get<std::string>());
        entry["installed"] = !installed_version.empty();
        entry["installed_version"] = installed_version;
        entry["update_available"] = local && available && upgrade::compare_sem_version(*available, *local) > 0;
        entry["package"]["url"] = base_ + entry["package"]["path"].get<std::string>();
        entry["thumbnail"]["url"] = base_ + entry["thumbnail"]["path"].get<std::string>();
    }
    result["offline"] = offline;
    result["job"] = job();
    return result;
}

json ThemeStore::descriptor(const std::string& id) {
    if (!is_downloadable_theme(id)) throw ThemeError(404, "THEME_NOT_FOUND", "Unknown theme");
    return catalog().at("themes").at(0);
}

fs::path ThemeStore::installed_directory(const std::string& id) const {
    if (!is_downloadable_theme(id)) throw ThemeError(404, "THEME_NOT_FOUND", "Unknown theme");
    const auto pointer = read_json(root_ / id / "installed.json");
    if (!version_ok(pointer.at("version"))) throw ThemeError(404, "THEME_NOT_INSTALLED", "Theme is not installed");
    return root_ / id / pointer.at("version").get<std::string>();
}

json ThemeStore::definition(const std::string& id) const {
    try {
        const auto dir = installed_directory(id);
        const auto d = read_json(dir / "theme.json");
        if (d.at("id") == id && valid_theme_definition(d) &&
            d.at("version") == dir.filename().string() &&
            matches_file(dir / "background.png", d.at("background")) &&
            matches_file(dir / "thumbnail.png", d.at("thumbnail"))) return d;
    } catch (...) {}
    throw ThemeError(404, "THEME_NOT_INSTALLED", "Theme is not installed or is incomplete");
}

bool ThemeStore::installed(const std::string& id) const {
    try { definition(id); return true; } catch (...) { return false; }
}

std::string ThemeStore::image(const std::string& id, const std::string& kind) {
    if (kind != "background" && kind != "thumbnail") throw ThemeError(404, "THEME_NOT_FOUND", "Unknown theme resource");
    if (installed(id)) return read_file(installed_directory(id) / (kind + ".png"), kMaxPackageBytes);
    if (kind == "background") throw ThemeError(404, "THEME_NOT_INSTALLED", "Theme is not installed");
    const auto e = descriptor(id);
    std::lock_guard<std::mutex> preview_lock(preview_mu_);
    const auto file = root_ / "previews" / (id + "-" + e.at("version").get<std::string>() + ".png");
    if (!matches_file(file, e.at("thumbnail"))) {
        fs::create_directories(file.parent_path());
        auto tmp = file; tmp += ".download";
        auto response = transport_.download(e.at("thumbnail").at("url").get<std::string>(), tmp,
            {}, [&] { std::error_code ec; return fs::exists(tmp, ec) && fs::file_size(tmp, ec) > kMaxPreviewBytes; });
        if (response.status_code != 200 || !response.error.empty() || !matches_file(tmp, e.at("thumbnail"))) {
            std::error_code ec; fs::remove(tmp, ec);
            throw ThemeError(502, "THEME_PREVIEW_FAILED", "Could not load theme preview");
        }
        auto bytes = read_file(tmp, kMaxPreviewBytes);
        std::error_code ec; fs::remove(tmp, ec);
        if (!png(bytes)) throw ThemeError(422, "THEME_INVALID_PACKAGE", "Invalid preview image");
        write_file(file, bytes);
    }
    return read_file(file, kMaxPreviewBytes);
}

json ThemeStore::job() const { std::lock_guard<std::mutex> lock(mu_); return job_; }
void ThemeStore::update_job(const json& patch) { std::lock_guard<std::mutex> lock(mu_); job_.update(patch); }

json ThemeStore::start(const std::string& id, const json& consent) {
    std::lock_guard<std::mutex> start_lock(start_mu_);
    if (busy(job())) throw ThemeError(409, "THEME_DOWNLOAD_BUSY", "A theme is already downloading");
    const auto entry = descriptor(id);
    if (!consent.is_object() || consent.value("confirm_download", false) != true ||
        !consent.contains("sha256") || consent["sha256"] != entry["package"]["sha256"] ||
        !consent.contains("bytes") || consent["bytes"] != entry["package"]["bytes"] ||
        !consent.contains("version") || consent["version"] != entry["version"]) {
        throw ThemeError(409, "THEME_CONFIRMATION_REQUIRED", "Confirm the current theme package size before downloading");
    }
    if (worker_.joinable()) worker_.join();
    cancel_.store(false);
    {
        std::lock_guard<std::mutex> lock(mu_);
        job_ = {{"id", id}, {"version", entry["version"]}, {"state", "downloading"},
            {"bytes_downloaded", 0}, {"bytes_total", entry["package"]["bytes"]}};
    }
    worker_ = std::thread([this, entry] { install(entry); });
    return job();
}

json ThemeStore::cancel() { cancel_.store(true); return job(); }

void ThemeStore::install(json entry) {
    const auto id = entry.at("id").get<std::string>();
    const auto version = entry.at("version").get<std::string>();
    const auto staging = root_ / id / (version + ".staging");
    const auto archive = root_ / id / (version + ".download");
    const auto download_url = entry.at("package").at("url").get<std::string>();
    auto failure_path = download_url;
    const auto expected = entry.at("package").at("bytes").get<std::uintmax_t>();
    auto cleanup = [&] { std::error_code ec; fs::remove(archive, ec); fs::remove_all(staging, ec); };
    try {
        failure_path = path_to_utf8(archive);
        fs::create_directories(archive.parent_path());
        cleanup();
        failure_path = download_url;
        auto response = transport_.download(download_url, archive,
            [this](const upgrade::DownloadProgress& p) { update_job({{"bytes_downloaded", p.bytes_written}}); },
            [this, expected] { return cancel_.load() || job().value("bytes_downloaded", std::uintmax_t{0}) > expected; });
        if (cancel_.load()) throw ThemeError(499, "THEME_CANCELLED", "Theme download cancelled");
        if (response.status_code != 200 || !response.error.empty()) throw ThemeError(502, "THEME_DOWNLOAD_FAILED", "Could not download theme");
        if (!matches_file(archive, entry.at("package"))) throw ThemeError(422, "THEME_INVALID_PACKAGE", "Theme package integrity check failed");
        update_job({{"state", "installing"}});
        const auto files = unpack(archive);
        const auto definition = json::parse(files.at("theme.json"));
        if (!valid_theme_definition(definition) || definition.at("id") != id || definition.at("version") != version) {
            throw ThemeError(422, "THEME_INVALID_PACKAGE", "Invalid theme definition");
        }
        for (const auto* kind : {"background", "thumbnail"}) {
            const auto& bytes = files.at(std::string(kind) + ".png");
            if (!png(bytes) || bytes.size() != definition.at(kind).at("bytes") ||
                sha256_hex(bytes) != definition.at(kind).at("sha256")) {
                throw ThemeError(422, "THEME_INVALID_PACKAGE", "Theme image integrity check failed");
            }
        }
        failure_path = path_to_utf8(staging);
        for (const auto& [name, bytes] : files) write_file(staging / name, bytes);
        if (cancel_.load()) throw ThemeError(499, "THEME_CANCELLED", "Theme download cancelled");
        const auto destination = root_ / id / version;
        if (fs::exists(destination)) {
            bool identical = true;
            for (const auto& [name, bytes] : files) {
                try { if (read_file(destination / name, kMaxPackageBytes) != bytes) identical = false; }
                catch (...) { identical = false; }
            }
            if (!identical) {
                bool complete = false;
                try {
                    const auto old = read_json(destination / "theme.json");
                    complete = valid_theme_definition(old) && old.at("id") == id && old.at("version") == version &&
                        matches_file(destination / "background.png", old.at("background")) &&
                        matches_file(destination / "thumbnail.png", old.at("thumbnail"));
                } catch (...) {}
                if (complete) throw ThemeError(409, "THEME_VERSION_CONFLICT", "Theme version already exists with different content");
                // Repair only an incomplete installation using the three validated
                // resources. Atomic file writes make an interrupted repair retryable.
                for (const auto& [name, bytes] : files) write_file(destination / name, bytes);
            }
        } else fs::rename(staging, destination);
        write_file(root_ / id / "installed.json", json{{"version", version}}.dump());
        update_job({{"state", "completed"}, {"bytes_downloaded", expected}});
    } catch (const ThemeError& error) {
        update_job({{"state", error.code == "THEME_CANCELLED" ? "cancelled" : "failed"}, {"error", error.code},
            {"error_path", error.path.empty() ? failure_path : error.path}});
    } catch (...) { update_job({{"state", "failed"}, {"error", "THEME_INSTALL_FAILED"}, {"error_path", failure_path}}); }
    cleanup();
}
} // namespace acecode::themes
