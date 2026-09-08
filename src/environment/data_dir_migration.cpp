#include "data_dir_migration.hpp"

#include "../utils/logger.hpp"
#include "../utils/utf8_path.hpp"
#include "../utils/uuid.hpp"
#include "../utils/state_file.hpp"
#include "../daemon/platform.hpp"
#include <sqlite3.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <fstream>
#include <system_error>
#include <vector>
#include <set>

namespace acecode::environment {

namespace fs = std::filesystem;

namespace {
std::shared_mutex write_gate;
std::atomic<bool> writes_blocked{false};
}
std::shared_mutex& data_dir_write_mutex() { return write_gate; }
bool data_dir_writes_blocked() { return writes_blocked.load(); }
void reset_data_dir_write_gate_for_test() { writes_blocked.store(false); set_state_file_writes_paused(false); }

bool data_dir_has_other_daemons(const std::string& directory) {
    const auto root = path_from_utf8(directory);
    std::vector<fs::path> runs{root / "run"};
    std::error_code ec;
    if (fs::is_directory(root / "projects", ec)) {
        for (const auto& project : fs::directory_iterator(root / "projects", ec)) runs.push_back(project.path() / "run");
    }
    for (const auto& run : runs) {
        if (!fs::is_directory(run, ec)) continue;
        for (fs::recursive_directory_iterator it(run, ec), end; it != end; it.increment(ec)) {
            if (ec) return true;
            if (it->is_symlink(ec)) { it.disable_recursion_pending(); continue; }
            if (it->path().filename() != "daemon.pid") continue;
            long long pid = 0;
            std::ifstream(it->path()) >> pid;
            if (pid > 0 && pid != daemon::current_pid() && daemon::is_pid_alive(pid)) return true;
        }
    }
    return false;
}

namespace {

long long now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch()).count();
}

// 比较键:generic 形态 + 尾部分隔符;Windows 再小写。
std::string prefix_key(const fs::path& p) {
    std::string key = path_to_utf8_generic(p);
    if (key.empty() || key.back() != '/') key.push_back('/');
#ifdef _WIN32
    for (auto& ch : key) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
#endif
    return key;
}

fs::path canonical_or_normal(const fs::path& p) {
    std::error_code ec;
    fs::path c = fs::weakly_canonical(p, ec);
    if (ec || c.empty()) c = p.lexically_normal();
    return c;
}

bool starts_with(const std::string& text, const std::string& prefix) {
    return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
}

std::string lower_ascii(std::string s) {
    for (auto& ch : s) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    return s;
}

}  // namespace

const char* migration_target_error_code(MigrationTargetError error) {
    switch (error) {
        case MigrationTargetError::None:            return "OK";
        case MigrationTargetError::NotAbsolute:     return "TARGET_NOT_ABSOLUTE";
        case MigrationTargetError::SameAsCurrent:   return "TARGET_SAME_AS_CURRENT";
        case MigrationTargetError::InsideCurrent:   return "TARGET_INSIDE_CURRENT";
        case MigrationTargetError::ContainsCurrent: return "TARGET_CONTAINS_CURRENT";
        case MigrationTargetError::NotADirectory:   return "TARGET_NOT_A_DIRECTORY";
        case MigrationTargetError::NotEmpty:        return "TARGET_NOT_EMPTY";
        case MigrationTargetError::NotWritable:     return "TARGET_NOT_WRITABLE";
    }
    return "TARGET_INVALID";
}

MigrationTargetCheck validate_migration_target(const std::string& current_dir,
                                               const std::string& target) {
    MigrationTargetCheck out;
    auto fail = [&](MigrationTargetError e, std::string message) {
        out.error = e;
        out.message = std::move(message);
        return out;
    };

    const fs::path raw_target = path_from_utf8(target);
    if (target.empty() || !raw_target.is_absolute()) {
        return fail(MigrationTargetError::NotAbsolute, "target must be an absolute path");
    }
    const fs::path target_c = canonical_or_normal(raw_target);
    const fs::path current_c = canonical_or_normal(path_from_utf8(current_dir));
    out.normalized_target = path_to_utf8(target_c);

    const std::string target_key = prefix_key(target_c);
    const std::string current_key = prefix_key(current_c);
    if (target_key == current_key) {
        return fail(MigrationTargetError::SameAsCurrent, "target is the current data directory");
    }
    if (starts_with(target_key, current_key)) {
        return fail(MigrationTargetError::InsideCurrent,
                    "target is inside the current data directory");
    }
    if (starts_with(current_key, target_key)) {
        return fail(MigrationTargetError::ContainsCurrent,
                    "target contains the current data directory");
    }

    std::error_code ec;
    if (fs::exists(target_c, ec)) {
        if (!fs::is_directory(target_c, ec)) {
            return fail(MigrationTargetError::NotADirectory, "target exists and is not a directory");
        }
        for (const auto& entry : fs::directory_iterator(target_c, ec)) {
            (void)entry;
            return fail(MigrationTargetError::NotEmpty, "target directory is not empty");
        }
        if (ec) {
            return fail(MigrationTargetError::NotWritable,
                        "cannot list target directory: " + ec.message());
        }
    } else {
        fs::create_directories(target_c, ec);
        if (ec) {
            return fail(MigrationTargetError::NotWritable,
                        "cannot create target directory: " + ec.message());
        }
    }

    // 真写一个探针文件确认可写(只读盘 / 权限不足在这里暴露,而不是复制到一半)。
    const fs::path probe = target_c / ".acecode-write-probe";
    {
        std::ofstream ofs(probe, std::ios::binary | std::ios::trunc);
        if (!ofs.is_open()) {
            return fail(MigrationTargetError::NotWritable, "target directory is not writable");
        }
        ofs << "probe";
        if (!ofs) {
            ofs.close();
            fs::remove(probe, ec);
            return fail(MigrationTargetError::NotWritable, "target directory is not writable");
        }
    }
    fs::remove(probe, ec);
    return out;
}

bool migration_excludes_entry(const fs::path& relative) {
    if (relative.empty()) return false;
    const std::string first = path_to_utf8(*relative.begin());
    if (first == "run" || first == "tmp") return true;
    if (first == kDataDirRedirectFileName && std::distance(relative.begin(), relative.end()) == 1) {
        return true;
    }
    const std::string name = lower_ascii(path_to_utf8(relative.filename()));
    if (name.size() > 5 && name.compare(name.size() - 5, 5, ".lock") == 0) return true;
    return false;
}

bool migration_is_sqlite_family(const fs::path& relative) {
    const std::string name = lower_ascii(path_to_utf8(relative.filename()));
    auto ends_with = [&](const char* suffix) {
        const std::string s(suffix);
        return name.size() >= s.size() && name.compare(name.size() - s.size(), s.size(), s) == 0;
    };
    for (const auto* suffix : {".sqlite3", ".sqlite", ".db"}) {
        if (ends_with(suffix) || ends_with((std::string(suffix) + "-wal").c_str()) ||
                ends_with((std::string(suffix) + "-shm").c_str())) return true;
    }
    return false;
}

MigrationProgress run_data_dir_migration(const std::string& current_dir,
                                         const std::string& default_dir,
                                         const std::string& target,
                                         const MigrationProgressFn& on_progress) {
    MigrationProgress progress;
    progress.state = "running";
    progress.target = target;
    progress.started_at_ms = now_ms();
    fs::path owned_staging;

    auto fail = [&](std::string message) {
        progress.state = "failed";
        progress.error = std::move(message);
        progress.finished_at_ms = now_ms();
        // Only delete the private staging directory created by this operation.
        std::error_code rm_ec;
        if (!owned_staging.empty()) fs::remove_all(owned_staging, rm_ec);
        LOG_WARN("[data-dir] migration failed: " + progress.error);
        return progress;
    };

    const auto check = validate_migration_target(current_dir, target);
    if (check.error != MigrationTargetError::None) {
        return fail(std::string(migration_target_error_code(check.error)) + ": " + check.message);
    }
    const fs::path source = path_from_utf8(current_dir);
    if (!fs::is_directory(source)) return fail("source directory does not exist");
    const fs::path final_dest = path_from_utf8(check.normalized_target);
    const fs::path dest = final_dest.parent_path() / (".acecode-migration-" + generate_uuid());
    std::error_code staging_error;
    if (!fs::create_directory(dest, staging_error) || staging_error) return fail("cannot create migration staging directory");
    owned_staging = dest;
    progress.target = check.normalized_target;

    // 第一遍:清点(总字节数供进度条),同时把文件分成普通与 sqlite 两组。
    struct Item { fs::path relative; bool is_dir; std::uintmax_t size; fs::file_time_type modified{}; bool is_link = false; };
    std::vector<Item> regular;
    std::vector<Item> sqlite;
    std::error_code ec;
    for (fs::recursive_directory_iterator it(source, ec), end;
         it != end; it.increment(ec)) {
        if (ec) return fail("cannot enumerate source: " + ec.message());
        const fs::path relative = it->path().lexically_relative(source);
        if (migration_excludes_entry(relative)) {
            if (it->is_directory(ec)) it.disable_recursion_pending();
            continue;
        }
        std::error_code type_ec;
        if (it->is_symlink(type_ec)) {
            regular.push_back({relative, it->is_directory(type_ec), 0, {}, true});
            it.disable_recursion_pending();
            continue;
        }
        if (it->is_directory(type_ec)) {
            regular.push_back({relative, true, 0});
            continue;
        }
        if (!it->is_regular_file(type_ec)) return fail("source contains an unsupported file: " + path_to_utf8(relative));
        const std::uintmax_t size = it->file_size(type_ec);
        if (type_ec) return fail("cannot read source file metadata");
        Item item{relative, false, size, it->last_write_time(type_ec)};
        if (type_ec) return fail("cannot read source file timestamp");
        if (migration_is_sqlite_family(relative)) sqlite.push_back(item);
        else regular.push_back(item);
        progress.total_bytes += item.size;
    }
    if (ec) return fail("cannot enumerate source: " + ec.message());

    auto report = [&]() {
        if (on_progress) on_progress(progress.copied_bytes, progress.total_bytes);
    };
    report();

    std::set<std::string> snapshots;
    auto copy_item = [&](const Item& item) -> std::string {
        const fs::path from = source / item.relative;
        const fs::path to = dest / item.relative;
        std::error_code cec;
        if (item.is_link) {
            fs::create_directories(to.parent_path(), cec);
            auto link = fs::read_symlink(from, cec);
            if (cec) return "cannot read symbolic link: " + path_to_utf8(from);
            auto resolved = canonical_or_normal(link.is_absolute() ? link : from.parent_path() / link);
            const auto source_root = canonical_or_normal(source);
            if (starts_with(prefix_key(resolved), prefix_key(source_root))) {
                resolved = final_dest / resolved.lexically_relative(source_root);
            }
            if (item.is_dir) fs::create_directory_symlink(resolved, to, cec);
            else fs::create_symlink(resolved, to, cec);
            if (cec) return "cannot preserve symbolic link: " + path_to_utf8(from) + ": " + cec.message();
            return {};
        }
        if (item.is_dir) {
            fs::create_directories(to, cec);
            if (cec) return "cannot create " + path_to_utf8(to) + ": " + cec.message();
            return {};
        }
        fs::create_directories(to.parent_path(), cec);
        if (cec) return "cannot create " + path_to_utf8(to.parent_path()) + ": " + cec.message();
        const std::string relative_name = path_to_utf8(item.relative);
        for (const auto& database : snapshots) {
            if (relative_name == database + "-wal" || relative_name == database + "-shm") {
                progress.copied_bytes += item.size; report(); return {};
            }
        }
        char header[16]{};
        std::ifstream header_stream(from, std::ios::binary);
        header_stream.read(header, sizeof(header));
        const bool is_database = header_stream.gcount() == 16 &&
            std::string(header, 16) == std::string("SQLite format 3\0", 16);
        header_stream.close();
        if (is_database) {
            sqlite3* input = nullptr;
            sqlite3* output = nullptr;
            const int opened = sqlite3_open_v2(path_to_utf8(from).c_str(), &input, SQLITE_OPEN_READONLY, nullptr);
            int result = opened;
            if (opened == SQLITE_OK) result = sqlite3_open(path_to_utf8(to).c_str(), &output);
            if (result == SQLITE_OK) {
                sqlite3_busy_timeout(input, 5000);
                auto* backup = sqlite3_backup_init(output, "main", input, "main");
                if (backup) {
                    result = sqlite3_backup_step(backup, -1);
                    const int finished = sqlite3_backup_finish(backup);
                    if (result == SQLITE_DONE) result = finished;
                } else result = sqlite3_errcode(output);
            }
            if (output) sqlite3_close(output);
            if (input) sqlite3_close(input);
            if (result != SQLITE_OK) return "cannot snapshot database: " + path_to_utf8(from);
            snapshots.insert(relative_name);
        } else {
            fs::copy_file(from, to, fs::copy_options::none, cec);
        }
        if (cec) return "cannot copy " + path_to_utf8(from) + ": " + cec.message();
        progress.copied_bytes += item.size;
        report();
        return {};
    };

    for (const auto& item : regular) {
        if (std::string err = copy_item(item); !err.empty()) return fail(err);
    }
    // Snapshot each main database before skipping its WAL/SHM sidecars.
    std::sort(sqlite.begin(), sqlite.end(), [](const Item& a, const Item& b) { return a.relative < b.relative; });
    for (const auto& item : sqlite) {
        if (std::string err = copy_item(item); !err.empty()) return fail(err);
    }

    // Refuse a changing source rather than publishing a partial conversation/config.
    for (const auto& item : regular) {
        if (item.is_dir || item.is_link || path_to_utf8(*item.relative.begin()) == "logs") continue;
        const auto file = source / item.relative;
        if (fs::file_size(file, ec) != item.size || ec ||
                fs::last_write_time(file, ec) != item.modified || ec) {
            return fail("source changed during migration: " + path_to_utf8(item.relative) + "; retry when ACECode is idle");
        }
    }
    std::set<fs::path> expected;
    for (const auto& item : regular) expected.insert(item.relative);
    for (const auto& item : sqlite) expected.insert(item.relative);
    for (fs::recursive_directory_iterator it(source, ec), end; it != end; it.increment(ec)) {
        if (ec) return fail("cannot recheck source: " + ec.message());
        const auto relative = it->path().lexically_relative(source);
        if (migration_excludes_entry(relative) || path_to_utf8(*relative.begin()) == "logs") {
            it.disable_recursion_pending();
            continue;
        }
        if (it->is_symlink(ec)) it.disable_recursion_pending();
        if (!expected.count(relative)) return fail("source changed during migration; retry when ACECode is idle");
    }
    if (ec) return fail("cannot recheck source: " + ec.message());
    // Revalidate the actual target: the user may have added a file while copying.
    const auto final_check = validate_migration_target(current_dir, check.normalized_target);
    if (final_check.error != MigrationTargetError::None) return fail(final_check.message);
    if (!fs::remove(final_dest, ec) || ec) return fail("target is no longer empty");
    fs::rename(dest, final_dest, ec);
    if (ec) return fail("cannot publish copied workspace: " + ec.message());
    owned_staging.clear();

    DataDirRedirect redirect;
    redirect.data_dir = check.normalized_target;
    redirect.previous_data_dir = path_to_utf8(canonical_or_normal(source));
    redirect.migrated_at_ms = now_ms();
    redirect.previous_size_bytes = progress.copied_bytes;
    redirect.cleanup_pending = true;
    if (!write_data_dir_redirect(default_dir, redirect)) {
        // Keep a verified copy on pointer failure; never recursively remove a public path.
        return fail("cannot write redirect pointer; copied data remains at " + check.normalized_target);
    }

    progress.state = "done";
    progress.restart_required = true;
    progress.finished_at_ms = now_ms();
    LOG_INFO("[data-dir] migration complete: target=" + check.normalized_target +
             " bytes=" + std::to_string(progress.copied_bytes));
    return progress;
}

DataDirMigrationJob::~DataDirMigrationJob() {
    if (thread_.joinable()) thread_.join();
}

bool DataDirMigrationJob::start(const std::string& current_dir, const std::string& default_dir,
                                const std::string& target, std::string* error,
                                std::function<void()> before_copy, std::function<void()> on_failure) {
    std::lock_guard<std::mutex> lk(mu_);
    if (active_.load() || (progress_ && progress_->restart_required)) {
        if (error) *error = "a data directory migration is already running";
        return false;
    }
    if (thread_.joinable()) thread_.join();  // 上一次已结束的线程回收
    MigrationProgress initial;
    initial.state = "running";
    initial.target = target;
    initial.started_at_ms = now_ms();
    progress_ = initial;
    active_.store(true);
    writes_blocked.store(true);
    set_state_file_writes_paused(true);
    thread_ = std::thread([this, current_dir, default_dir, target, before_copy, on_failure]() {
        MigrationProgress result;
        try { if (before_copy) before_copy(); result = run_data_dir_migration(
            current_dir, default_dir, target,
            [this](unsigned long long copied, unsigned long long total) {
                std::lock_guard<std::mutex> plk(mu_);
                if (progress_) {
                    progress_->copied_bytes = copied;
                    progress_->total_bytes = total;
                }
            }); } catch (const std::exception& e) {
            result.state = "failed";
            result.error = e.what();
            result.target = target;
        }
        {
            std::lock_guard<std::mutex> plk(mu_);
            progress_ = result;
        }
        active_.store(false);
        if (result.state != "done") {
            writes_blocked.store(false);
            set_state_file_writes_paused(false);
            try { if (on_failure) on_failure(); }
            catch (const std::exception& e) { LOG_WARN(std::string("[data-dir] resume failed: ") + e.what()); }
        }
    });
    return true;
}

bool DataDirMigrationJob::active() const {
    return active_.load();
}

std::optional<MigrationProgress> DataDirMigrationJob::progress() const {
    std::lock_guard<std::mutex> lk(mu_);
    return progress_;
}

void DataDirMigrationJob::wait_for_test() {
    std::thread t;
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (thread_.joinable()) t = std::move(thread_);
    }
    if (t.joinable()) t.join();
}

std::string cleanup_previous_data_dir(const std::string& previous_dir,
                                      const std::string& default_dir) {
    if (previous_dir.empty()) return {};
    const fs::path prev = path_from_utf8(previous_dir);
    const auto redirect = read_data_dir_redirect(default_dir);
    if (!redirect || redirect->previous_data_dir.empty() ||
        prefix_key(canonical_or_normal(prev)) != prefix_key(canonical_or_normal(path_from_utf8(redirect->previous_data_dir)))) {
        return "previous workspace does not match the migration record";
    }
    const auto previous_key = prefix_key(canonical_or_normal(prev));
    const auto active_key = prefix_key(canonical_or_normal(path_from_utf8(redirect->data_dir)));
    if (!prev.is_absolute() || prev == prev.root_path() || starts_with(active_key, previous_key) || starts_with(previous_key, active_key)) {
        return "refusing to remove the active workspace or its parent";
    }
    std::error_code ec;
    if (!fs::is_directory(prev, ec)) return {};
    const bool keep_pointer =
        prefix_key(canonical_or_normal(prev)) ==
        prefix_key(canonical_or_normal(path_from_utf8(default_dir)));
    std::string first_error;
    for (const auto& entry : fs::directory_iterator(prev, ec)) {
        if (keep_pointer && entry.path().filename() == kDataDirRedirectFileName) continue;
        std::error_code rm_ec;
        fs::remove_all(entry.path(), rm_ec);
        if (rm_ec && first_error.empty()) {
            first_error = "cannot remove " + path_to_utf8(entry.path()) + ": " + rm_ec.message();
        }
    }
    if (ec && first_error.empty()) first_error = "cannot list " + previous_dir + ": " + ec.message();
    if (!keep_pointer && first_error.empty()) {
        std::error_code rm_ec;
        fs::remove(prev, rm_ec);  // 旧目录本身也删(不是默认目录时)
    }
    return first_error;
}

std::string acknowledge_data_dir_cleanup(const std::string& default_dir) {
    auto redirect = read_data_dir_redirect(default_dir);
    if (!redirect) return {};
    if (!redirect->cleanup_pending) return {};
    redirect->cleanup_pending = false;
    if (!write_data_dir_redirect(default_dir, *redirect)) {
        return "cannot update redirect pointer in " + default_dir;
    }
    return {};
}

DataDirStatus data_dir_status(RunMode mode) {
    DataDirStatus s;
    s.default_dir = resolve_default_data_dir(mode);
    s.effective_dir = resolve_data_dir(mode);
    if (auto redirect = read_data_dir_redirect(s.default_dir)) {
        s.redirect_target = redirect->data_dir;
        s.redirect_active =
            prefix_key(canonical_or_normal(path_from_utf8(s.effective_dir))) ==
            prefix_key(canonical_or_normal(path_from_utf8(redirect->data_dir)));
        s.migrated_at_ms = redirect->migrated_at_ms;
        s.previous_size_bytes = redirect->previous_size_bytes;
        s.cleanup_pending = redirect->cleanup_pending;
        std::error_code ec;
        const fs::path prev = path_from_utf8(redirect->previous_data_dir);
        if (!redirect->previous_data_dir.empty() && fs::is_directory(prev, ec)) {
            s.previous_dir = redirect->previous_data_dir;
            s.previous_exists = true;
            // 默认目录只剩指针文件时不算"仍有旧数据"。
            bool has_content = false;
            for (const auto& entry : fs::directory_iterator(prev, ec)) {
                if (entry.path().filename() == kDataDirRedirectFileName) continue;
                has_content = true;
                break;
            }
            s.previous_exists = has_content;
        }
        s.cleanup_prompt = s.redirect_active && s.cleanup_pending && s.previous_exists &&
                           s.previous_size_bytes > kCleanupPromptThresholdBytes;
    }
    return s;
}

}  // namespace acecode::environment
