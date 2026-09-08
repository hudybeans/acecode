#pragma once

// 数据目录迁移(openspec: data-directory-relocation)。
//
// 流程:校验目标 → 后台复制整个数据目录(排除 run/、tmp/、*.lock 与指针文件本身)
// → 在**平台默认目录**写 data-dir.redirect.json → 要求重启。复制不是移动:失败时
// 删掉半成品目标即可重试,回滚只需删指针。迁移后首次启动若旧数据超过 100 MB,
// 由 status 端点报 cleanup 提示,用户决定删还是留。
//
// 纯逻辑(校验、排除规则、阈值)不依赖 web 层,进 acecode_testable 单测。

#include "../utils/paths.hpp"

#include <atomic>
#include <filesystem>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <shared_mutex>

namespace acecode::environment {

std::shared_mutex& data_dir_write_mutex();
bool data_dir_writes_blocked();
void reset_data_dir_write_gate_for_test();
bool data_dir_has_other_daemons(const std::string& directory);

inline constexpr unsigned long long kCleanupPromptThresholdBytes = 100ULL * 1024 * 1024;

enum class MigrationTargetError {
    None,
    NotAbsolute,     // 目标不是绝对路径
    SameAsCurrent,   // 目标就是当前数据目录
    InsideCurrent,   // 目标在当前数据目录里面(复制会递归自己)
    ContainsCurrent, // 目标包含当前数据目录
    NotADirectory,   // 目标存在但不是目录
    NotEmpty,        // 目标是非空目录(不合并进已有数据)
    NotWritable,     // 目标不可写
};

// 给 REST 用的稳定错误码:TARGET_NOT_ABSOLUTE / TARGET_SAME_AS_CURRENT /
// TARGET_INSIDE_CURRENT / TARGET_CONTAINS_CURRENT / TARGET_NOT_A_DIRECTORY /
// TARGET_NOT_EMPTY / TARGET_NOT_WRITABLE。
const char* migration_target_error_code(MigrationTargetError error);

struct MigrationTargetCheck {
    MigrationTargetError error = MigrationTargetError::None;
    std::string message;            // 人类可读原因
    std::string normalized_target;  // weakly_canonical 后的目标(供后续复制使用)
};

// 校验并规范化目标。通过时目标目录已存在(不存在会创建)且已验证可写。
// 路径比较全部先 weakly_canonical,junction / 大小写差异不会绕过检查。
MigrationTargetCheck validate_migration_target(const std::string& current_dir,
                                               const std::string& target);

// 相对数据根的条目是否被排除:顶层 run/、tmp/、指针文件,以及任何 *.lock。
bool migration_excludes_entry(const std::filesystem::path& relative);

// sqlite 主库 / wal / shm 要作为一组最后复制,尽量拿到一致快照。
bool migration_is_sqlite_family(const std::filesystem::path& relative);

struct MigrationProgress {
    std::string state = "idle";  // idle | running | done | failed
    std::string target;
    unsigned long long copied_bytes = 0;
    unsigned long long total_bytes = 0;
    std::string error;
    bool restart_required = false;
    long long started_at_ms = 0;
    long long finished_at_ms = 0;
};

using MigrationProgressFn = std::function<void(unsigned long long copied,
                                               unsigned long long total)>;

// 同步执行完整迁移(worker 线程与单测共用):复制 + 写指针。失败时删除目标目录。
MigrationProgress run_data_dir_migration(const std::string& current_dir,
                                         const std::string& default_dir,
                                         const std::string& target,
                                         const MigrationProgressFn& on_progress = {});

// 后台任务壳:同一时间只允许一个迁移。
class DataDirMigrationJob {
public:
    DataDirMigrationJob() = default;
    ~DataDirMigrationJob();
    DataDirMigrationJob(const DataDirMigrationJob&) = delete;
    DataDirMigrationJob& operator=(const DataDirMigrationJob&) = delete;

    // 启动后台复制。已有任务在跑 → false 并写 error。
    bool start(const std::string& current_dir, const std::string& default_dir,
               const std::string& target, std::string* error,
               std::function<void()> before_copy = {}, std::function<void()> on_failure = {});
    bool active() const;
    std::optional<MigrationProgress> progress() const;  // 从未启动 → nullopt
    void wait_for_test();                               // 等后台线程结束

private:
    mutable std::mutex mu_;
    std::optional<MigrationProgress> progress_;
    std::thread thread_;
    std::atomic<bool> active_{false};
};

// 清理旧目录内容。previous_dir 与 default_dir 是同一目录时保留指针文件。
// 返回错误串,空 = 成功(目录不存在也算成功)。
std::string cleanup_previous_data_dir(const std::string& previous_dir,
                                      const std::string& default_dir);

// 把指针的 cleanup_pending 置 false(用户选了「保留」或删除已完成)。
std::string acknowledge_data_dir_cleanup(const std::string& default_dir);

struct DataDirStatus {
    std::string effective_dir;
    std::string default_dir;
    bool redirect_active = false;
    std::string redirect_target;          // 指针目标(可能与 effective 不同:目标不可用时)
    std::string previous_dir;             // 指针记录的旧目录(存在时才填)
    bool previous_exists = false;
    unsigned long long previous_size_bytes = 0;
    long long migrated_at_ms = 0;
    bool cleanup_pending = false;
    bool cleanup_prompt = false;          // pending && previous 存在 && 大小超阈值
};

DataDirStatus data_dir_status(RunMode mode);

}  // namespace acecode::environment
