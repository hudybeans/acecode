// 覆盖 src/environment/data_dir_migration.{hpp,cpp}:目标校验、排除规则、复制 + 指针、
// 后台任务壳、旧目录清理与清理提示阈值。全部在临时目录里跑,HOME / USERPROFILE 指向
// 临时目录以控制"平台默认目录"。

#include <gtest/gtest.h>

#include "environment/data_dir_migration.hpp"
#include "utils/encoding.hpp"
#include "utils/paths.hpp"
#include "utils/utf8_path.hpp"
#include "utils/state_file.hpp"

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <system_error>
#include <sqlite3.h>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

namespace fs = std::filesystem;
using namespace acecode::environment;

namespace {

#ifdef _WIN32
constexpr const char* kHomeEnv = "USERPROFILE";
#else
constexpr const char* kHomeEnv = "HOME";
#endif

void set_env(const char* name, const std::string& value) {
#ifdef _WIN32
    _putenv_s(name, value.c_str());
#else
    setenv(name, value.c_str(), 1);
#endif
}

void write_file(const fs::path& p, const std::string& content) {
    fs::create_directories(p.parent_path());
    std::ofstream ofs(p, std::ios::binary | std::ios::trunc);
    ofs << content;
}

class DataDirMigrationTest : public ::testing::Test {
protected:
    fs::path root;         // 临时根
    fs::path home;         // HOME
    fs::path default_dir;  // <home>/.acecode(平台默认目录 = 当前数据目录)
    std::string prev_home;
    bool had_home = false;

    void SetUp() override {
        acecode::reset_run_mode_for_test();
        if (const char* e = std::getenv(kHomeEnv)) { prev_home = e; had_home = true; }
        auto now = std::chrono::steady_clock::now().time_since_epoch().count();
        root = fs::temp_directory_path() / ("acecode-migration-" + std::to_string(now));
        home = root / "home";
        default_dir = home / ".acecode";
        fs::create_directories(default_dir);
        set_env(kHomeEnv, home.string());
        acecode::reset_data_dir_cache_for_test();
    }
    void TearDown() override {
        reset_data_dir_write_gate_for_test();
        if (had_home) set_env(kHomeEnv, prev_home);
        acecode::reset_run_mode_for_test();
        std::error_code ec;
        // 走扩展长度路径:超长路径用例留下的深层文件普通路径删不掉,会残留在 %TEMP%。
        fs::remove_all(acecode::to_extended_length_path(root), ec);
    }

    // 造一棵典型的数据目录:配置、会话、运行时文件、锁文件、sqlite 三件套。
    void populate_source(const fs::path& dir) {
        write_file(dir / "config.json", R"({"provider":""})");
        write_file(dir / "state.json", "{}");
        write_file(dir / "config.json.lock", "");
        write_file(dir / "projects" / "abc" / "sessions" / "s1.jsonl", "line1\nline2\n");
        write_file(dir / "projects" / "abc" / "workspace.json", "{}");
        write_file(dir / "memory" / "MEMORY.md", "# memory");
        write_file(dir / "run" / "daemon.pid", "123");
        write_file(dir / "tmp" / "scratch.txt", "junk");
        write_file(dir / "scheduled-loops.sqlite3", "db");
        write_file(dir / "scheduled-loops.sqlite3-wal", "wal");
        write_file(dir / "scheduled-loops.sqlite3-shm", "shm");
    }

    std::string s(const fs::path& p) const { return acecode::path_to_utf8(p); }
};

}  // namespace

TEST_F(DataDirMigrationTest, InvalidTargetsNeverDeleteExistingData) {
    populate_source(default_dir);
    for (const auto& target : {default_dir, home, root / "occupied"}) {
        write_file(target / "keep.txt", "keep");
        const auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(target));
        EXPECT_EQ(result.state, "failed");
        EXPECT_TRUE(fs::exists(target / "keep.txt"));
        EXPECT_TRUE(fs::exists(default_dir / "config.json"));
    }
}

TEST_F(DataDirMigrationTest, ChangingSourceDoesNotPublishPointer) {
    populate_source(default_dir);
    bool changed = false;
    const auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(root / "moved"),
        [&](auto copied, auto) {
            if (copied && !changed) { changed = true; write_file(default_dir / "new-session.jsonl", "new"); }
        });
    EXPECT_EQ(result.state, "failed");
    EXPECT_FALSE(acecode::read_data_dir_redirect(s(default_dir)));
    EXPECT_TRUE(fs::exists(default_dir / "new-session.jsonl"));
    // staging 前缀取常量:写死旧前缀的话,前缀改名后这条断言会永远空过。
    for (const auto& entry : fs::directory_iterator(root)) {
        EXPECT_EQ(entry.path().filename().string().find(kMigrationStagingPrefix), std::string::npos);
    }
}

TEST_F(DataDirMigrationTest, CopiesCommittedWalDataUsingDatabaseSnapshot) {
    sqlite3* db = nullptr;
    ASSERT_EQ(sqlite3_open(s(default_dir / "state.sqlite3").c_str(), &db), SQLITE_OK);
    ASSERT_EQ(sqlite3_exec(db, "PRAGMA journal_mode=WAL; CREATE TABLE messages(body TEXT); INSERT INTO messages VALUES('saved conversation');", nullptr, nullptr, nullptr), SQLITE_OK);
    const auto target = root / "moved";
    const auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(target));
    sqlite3_close(db);
    ASSERT_EQ(result.state, "done") << result.error;
    ASSERT_EQ(sqlite3_open(s(target / "state.sqlite3").c_str(), &db), SQLITE_OK);
    sqlite3_stmt* stmt = nullptr;
    ASSERT_EQ(sqlite3_prepare_v2(db, "SELECT body FROM messages", -1, &stmt, nullptr), SQLITE_OK);
    ASSERT_EQ(sqlite3_step(stmt), SQLITE_ROW);
    EXPECT_STREQ(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0)), "saved conversation");
    sqlite3_finalize(stmt);
    sqlite3_close(db);
    EXPECT_FALSE(fs::exists(target / "state.sqlite3-wal"));
}

TEST_F(DataDirMigrationTest, FailedJobReopensWritesAndResumesScheduler) {
    DataDirMigrationJob job;
    bool resumed = false;
    std::string error;
    ASSERT_TRUE(job.start(s(default_dir), s(default_dir), s(root / "moved"), &error,
        [] { EXPECT_FALSE(acecode::try_write_state_flag("late_background_write", true)); throw std::runtime_error("cannot pause writer"); }, [&] { resumed = true; }));
    job.wait_for_test();
    ASSERT_TRUE(job.progress());
    EXPECT_EQ(job.progress()->state, "failed");
    EXPECT_FALSE(data_dir_writes_blocked());
    EXPECT_TRUE(resumed);
    EXPECT_TRUE(acecode::try_write_state_flag("after_failed_migration", true));
}

// 场景:目标校验的每一种拒绝原因。
// 期望:相对路径 / 同目录 / 在当前目录里 / 包含当前目录 / 是文件 / 非空目录 各自
// 命中稳定错误码;有效的不存在目标被创建为空目录并通过。
TEST_F(DataDirMigrationTest, ValidateTargetRejectsEachInvalidShape) {
    populate_source(default_dir);
    const std::string cur = s(default_dir);

    EXPECT_EQ(validate_migration_target(cur, "relative/dir").error, MigrationTargetError::NotAbsolute);
    EXPECT_EQ(validate_migration_target(cur, cur).error, MigrationTargetError::SameAsCurrent);
    EXPECT_EQ(validate_migration_target(cur, s(default_dir / "backup")).error,
              MigrationTargetError::InsideCurrent);
    EXPECT_EQ(validate_migration_target(cur, s(home)).error, MigrationTargetError::ContainsCurrent);

    write_file(root / "afile.txt", "x");
    EXPECT_EQ(validate_migration_target(cur, s(root / "afile.txt")).error,
              MigrationTargetError::NotADirectory);

    fs::create_directories(root / "nonempty");
    write_file(root / "nonempty" / "keep.txt", "x");
    EXPECT_EQ(validate_migration_target(cur, s(root / "nonempty")).error,
              MigrationTargetError::NotEmpty);

    auto ok = validate_migration_target(cur, s(root / "fresh"));
    EXPECT_EQ(ok.error, MigrationTargetError::None) << ok.message;
    EXPECT_TRUE(fs::is_directory(root / "fresh")) << "有效目标应被创建为空目录";
    EXPECT_FALSE(fs::exists(root / "fresh" / ".acecode-write-probe")) << "探针文件必须清掉";

    EXPECT_STREQ(migration_target_error_code(MigrationTargetError::NotEmpty), "TARGET_NOT_EMPTY");
    EXPECT_STREQ(migration_target_error_code(MigrationTargetError::InsideCurrent),
                 "TARGET_INSIDE_CURRENT");
}

// 场景:大小写 / 尾部分隔符不同的同一目录(Windows 常见)。
// 期望:仍判为同一目录,不能靠改大小写绕过。
TEST_F(DataDirMigrationTest, ValidateTargetUsesCanonicalComparison) {
#ifdef _WIN32
    populate_source(default_dir);
    std::string upper = s(default_dir);
    for (auto& ch : upper) ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
    EXPECT_EQ(validate_migration_target(s(default_dir), upper + "\\").error,
              MigrationTargetError::SameAsCurrent);
#else
    GTEST_SKIP() << "case-insensitive comparison is Windows-only";
#endif
}

// 场景:排除规则。
// 期望:顶层 run/、tmp/、指针文件、任意 *.lock 被排除;projects/ 下的会话文件与
// 深层目录不排除;sqlite 三件套被识别为最后复制的一组。
TEST_F(DataDirMigrationTest, ExclusionRules) {
    EXPECT_TRUE(migration_excludes_entry(fs::path("run")));
    EXPECT_TRUE(migration_excludes_entry(fs::path("run") / "daemon.pid"));
    EXPECT_TRUE(migration_excludes_entry(fs::path("tmp") / "x"));
    EXPECT_TRUE(migration_excludes_entry(fs::path("config.json.lock")));
    EXPECT_TRUE(migration_excludes_entry(fs::path("projects") / "a" / ".writer.lock"));
    EXPECT_TRUE(migration_excludes_entry(fs::path(acecode::kDataDirRedirectFileName)));
    EXPECT_FALSE(migration_excludes_entry(fs::path("projects") / "a" / "s.jsonl"));
    EXPECT_FALSE(migration_excludes_entry(fs::path("runbook.md")));
    EXPECT_FALSE(migration_excludes_entry(fs::path("memory")));

    EXPECT_TRUE(migration_is_sqlite_family(fs::path("scheduled-loops.sqlite3")));
    EXPECT_TRUE(migration_is_sqlite_family(fs::path("scheduled-loops.sqlite3-wal")));
    EXPECT_TRUE(migration_is_sqlite_family(fs::path("x") / "state.sqlite3-shm"));
    EXPECT_FALSE(migration_is_sqlite_family(fs::path("config.json")));
}

// 场景:完整迁移成功。
// 期望:目标里有 config.json / projects / memory / sqlite 三件套,没有 run、tmp、
// *.lock;默认目录里写下指针(目标、旧目录、复制字节数、cleanup_pending);
// 进度 state=done 且 restart_required;copied 等于被复制文件的总大小。
TEST_F(DataDirMigrationTest, MigrationCopiesAndWritesPointer) {
    populate_source(default_dir);
    const fs::path target = root / "moved";
    unsigned long long last_total = 0;
    auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(target),
        [&](unsigned long long, unsigned long long total) { last_total = total; });
    ASSERT_EQ(result.state, "done") << result.error;
    EXPECT_TRUE(result.restart_required);
    EXPECT_TRUE(fs::exists(target / "config.json"));
    EXPECT_TRUE(fs::exists(target / "projects" / "abc" / "sessions" / "s1.jsonl"));
    EXPECT_TRUE(fs::exists(target / "memory" / "MEMORY.md"));
    EXPECT_TRUE(fs::exists(target / "scheduled-loops.sqlite3-wal"));
    EXPECT_FALSE(fs::exists(target / "run"));
    EXPECT_FALSE(fs::exists(target / "tmp"));
    EXPECT_FALSE(fs::exists(target / "config.json.lock"));
    EXPECT_FALSE(fs::exists(target / acecode::kDataDirRedirectFileName));

    // 复制字节数 = 被复制文件大小之和(排除项不计)。
    unsigned long long expected = 0;
    for (const char* rel : {"config.json", "state.json", "projects/abc/sessions/s1.jsonl",
                            "projects/abc/workspace.json", "memory/MEMORY.md",
                            "scheduled-loops.sqlite3", "scheduled-loops.sqlite3-wal",
                            "scheduled-loops.sqlite3-shm"}) {
        expected += fs::file_size(default_dir / rel);
    }
    EXPECT_EQ(result.copied_bytes, expected);
    EXPECT_EQ(result.total_bytes, expected);
    EXPECT_EQ(last_total, expected);

    auto pointer = acecode::read_data_dir_redirect(s(default_dir));
    ASSERT_TRUE(pointer.has_value());
    EXPECT_TRUE(fs::equivalent(acecode::path_from_utf8(pointer->data_dir), target));
    EXPECT_TRUE(fs::equivalent(acecode::path_from_utf8(pointer->previous_data_dir), default_dir));
    EXPECT_EQ(pointer->previous_size_bytes, expected);
    EXPECT_TRUE(pointer->cleanup_pending);
    EXPECT_GT(pointer->migrated_at_ms, 0);

    // 指针生效:重新解析后数据目录指向 target。
    acecode::reset_data_dir_cache_for_test();
    EXPECT_TRUE(fs::equivalent(acecode::path_from_utf8(
        acecode::resolve_data_dir(acecode::RunMode::User)), target));
}

// 场景:目标不合法(在当前目录里面)。
// 期望:state=failed,错误带稳定错误码,不写指针,半成品目标被删掉。
TEST_F(DataDirMigrationTest, MigrationFailureLeavesNoPointerAndRemovesTarget) {
    populate_source(default_dir);
    const fs::path target = default_dir / "inner";
    auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(target));
    EXPECT_EQ(result.state, "failed");
    EXPECT_NE(result.error.find("TARGET_INSIDE_CURRENT"), std::string::npos);
    EXPECT_FALSE(acecode::read_data_dir_redirect(s(default_dir)).has_value());
    EXPECT_FALSE(fs::exists(target));
}

// 场景:后台任务壳。
// 期望:start 后 active;跑完 progress 为 done;跑的过程中再次 start 被拒;
// 结束后可再次 start。
TEST_F(DataDirMigrationTest, JobRunsInBackgroundAndRejectsConcurrentStart) {
    populate_source(default_dir);
    DataDirMigrationJob job;
    EXPECT_FALSE(job.progress().has_value());
    std::string err;
    ASSERT_TRUE(job.start(s(default_dir), s(default_dir), s(root / "moved-a"), &err)) << err;
    // 极短的复制可能瞬间完成;只断言"若仍在跑则第二次被拒"。
    if (job.active()) {
        std::string err2;
        EXPECT_FALSE(job.start(s(default_dir), s(default_dir), s(root / "moved-b"), &err2));
        EXPECT_FALSE(err2.empty());
    }
    job.wait_for_test();
    EXPECT_FALSE(job.active());
    auto p = job.progress();
    ASSERT_TRUE(p.has_value());
    EXPECT_EQ(p->state, "done") << p->error;
    EXPECT_TRUE(p->restart_required);
    EXPECT_TRUE(data_dir_writes_blocked());
    EXPECT_FALSE(job.start(s(default_dir), s(default_dir), s(root / "moved-b"), &err));
}

// 场景:清理旧目录。
// 期望:旧目录 = 默认目录时只保留指针文件;旧目录是别处时整个目录删除;
// acknowledge 把 cleanup_pending 清掉。
TEST_F(DataDirMigrationTest, CleanupPreviousKeepsPointerOnlyInDefaultDir) {
    populate_source(default_dir);
    acecode::DataDirRedirect r;
    r.data_dir = s(root / "elsewhere");
    r.previous_data_dir = s(default_dir);
    r.cleanup_pending = true;
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));

    EXPECT_EQ(cleanup_previous_data_dir(s(default_dir), s(default_dir)), "");
    EXPECT_TRUE(fs::exists(default_dir / acecode::kDataDirRedirectFileName));
    EXPECT_FALSE(fs::exists(default_dir / "config.json"));
    EXPECT_FALSE(fs::exists(default_dir / "projects"));

    fs::create_directories(root / "old-elsewhere" / "sub");
    write_file(root / "old-elsewhere" / "sub" / "f.txt", "x");
    EXPECT_FALSE(cleanup_previous_data_dir(s(root / "old-elsewhere"), s(default_dir)).empty());
    EXPECT_TRUE(fs::exists(root / "old-elsewhere" / "sub" / "f.txt"));
    r.previous_data_dir = s(root / "old-elsewhere");
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));
    EXPECT_EQ(cleanup_previous_data_dir(s(root / "old-elsewhere"), s(default_dir)), "");
    EXPECT_FALSE(fs::exists(root / "old-elsewhere"));

    r.previous_data_dir = s(root / "never-existed");
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));
    EXPECT_EQ(cleanup_previous_data_dir(r.previous_data_dir, s(default_dir)), "")
        << "不存在的旧目录视为已清理";

    EXPECT_EQ(acknowledge_data_dir_cleanup(s(default_dir)), "");
    auto back = acecode::read_data_dir_redirect(s(default_dir));
    ASSERT_TRUE(back.has_value());
    EXPECT_FALSE(back->cleanup_pending);
}

// 场景:状态汇总与 100 MB 阈值。
// 期望:大迁移 + pending + 旧目录仍有内容 → cleanup_prompt;小迁移 → 不提示但
// previous_dir 仍报出;acknowledge 后不再提示;没有指针 → 纯默认状态。
TEST_F(DataDirMigrationTest, StatusReportsCleanupPromptAboveThreshold) {
    auto plain = data_dir_status(acecode::RunMode::User);
    EXPECT_FALSE(plain.redirect_active);
    EXPECT_TRUE(plain.previous_dir.empty());
    EXPECT_FALSE(plain.cleanup_prompt);
    EXPECT_TRUE(fs::equivalent(acecode::path_from_utf8(plain.default_dir), default_dir));

    populate_source(default_dir);  // 旧数据留在默认目录
    const fs::path target = root / "moved";
    fs::create_directories(target);
    acecode::DataDirRedirect r;
    r.data_dir = s(target);
    r.previous_data_dir = s(default_dir);
    r.previous_size_bytes = kCleanupPromptThresholdBytes + 1;
    r.cleanup_pending = true;
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));
    acecode::reset_data_dir_cache_for_test();

    auto big = data_dir_status(acecode::RunMode::User);
    EXPECT_TRUE(big.redirect_active);
    EXPECT_TRUE(fs::equivalent(acecode::path_from_utf8(big.effective_dir), target));
    EXPECT_TRUE(big.previous_exists);
    EXPECT_TRUE(big.cleanup_pending);
    EXPECT_TRUE(big.cleanup_prompt);

    r.previous_size_bytes = 40ULL * 1024 * 1024;
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));
    auto small = data_dir_status(acecode::RunMode::User);
    EXPECT_FALSE(small.cleanup_prompt);
    EXPECT_FALSE(small.previous_dir.empty()) << "不足阈值仍要报旧目录供手动删除";

    r.previous_size_bytes = kCleanupPromptThresholdBytes + 1;
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));
    EXPECT_EQ(acknowledge_data_dir_cleanup(s(default_dir)), "");
    auto acked = data_dir_status(acecode::RunMode::User);
    EXPECT_FALSE(acked.cleanup_pending);
    EXPECT_FALSE(acked.cleanup_prompt);
}

namespace {

// 模拟 MSVC 的 system_category().message():中文 Windows 上它走 ANSI 代码页,返回的是
// GBK 字节。这里固定返回「系统找不到」的 GBK 编码(CF B5 CD B3 D5 D2 B2 BB B5 BD),
// 其中 D5 D2 不是合法 UTF-8 序列,整串一定是非法 UTF-8。
class GbkMessageCategory : public std::error_category {
public:
    const char* name() const noexcept override { return "gbk-test"; }
    std::string message(int) const override {
        return "\xCF\xB5\xCD\xB3\xD5\xD2\xB2\xBB\xB5\xBD";
    }
};

const GbkMessageCategory& gbk_message_category() {
    static const GbkMessageCategory category;
    return category;
}

}  // namespace

// 场景:迁移过程中某个文件系统调用失败,ec.message() 是 GBK 字节(中文 Windows 的常态,
// 0923 反馈日志原文就是 GBK 的「系统找不到指定的路径。」)。
// 期望:migration_os_error_text 的结果恒为合法 UTF-8;在 ACP=936 的机器上还要准确还原成
// 「系统找不到」,而不是被替换成 '?'。
// bug 表现:修复前这段文本原样进 progress.error,json dump 抛 type_error.316,
// /migration 与 /data-dir 每次轮询都 500,前端永远卡在「迁移中」只能重启。
TEST_F(DataDirMigrationTest, OsErrorTextIsAlwaysValidUtf8) {
    const std::error_code ec(3, gbk_message_category());
    ASSERT_FALSE(acecode::is_valid_utf8(ec.message()));  // 前提:原文确实是非法 UTF-8
    const auto text = migration_os_error_text(ec);
    EXPECT_TRUE(acecode::is_valid_utf8(text)) << text;
    EXPECT_FALSE(text.empty());
#ifdef _WIN32
    if (GetACP() == 936) {
        // 「系统找不到」的 UTF-8 字节,直接写字节避免依赖源文件编码 / char8_t。
        EXPECT_EQ(text, "\xE7\xB3\xBB\xE7\xBB\x9F\xE6\x89\xBE\xE4\xB8\x8D\xE5\x88\xB0");
    }
#endif
}

// 场景:后台迁移线程里抛出的异常 what() 带 GBK 字节(例如 before_copy 暂停写入方失败,
// 或标准库异常里拼进了 OS 错误文本)。
// 期望:任务失败(state=failed),progress.error 是合法 UTF-8,可以安全序列化成 JSON。
// bug 表现:修复前 result.error = e.what() 原样保存,同样让 /migration 永久 500。
TEST_F(DataDirMigrationTest, JobExceptionTextIsSanitizedToUtf8) {
    DataDirMigrationJob job;
    std::string error;
    ASSERT_TRUE(job.start(s(default_dir), s(default_dir), s(root / "moved"), &error,
        [] { throw std::runtime_error(std::string("cannot pause writer: ") + "\xCF\xB5\xCD\xB3\xD5\xD2"); }));
    job.wait_for_test();
    ASSERT_TRUE(job.progress());
    EXPECT_EQ(job.progress()->state, "failed");
    EXPECT_TRUE(acecode::is_valid_utf8(job.progress()->error)) << job.progress()->error;
    EXPECT_NE(job.progress()->error.find("cannot pause writer: "), std::string::npos);
}

namespace {

// 5 层、每层 60 字符的相对目录(约 305 字符),接在任何临时根后面都超过 MAX_PATH。
fs::path deep_relative_dir() {
    fs::path rel;
    for (int i = 0; i < 5; ++i) rel /= std::string(60, static_cast<char>('a' + i));
    return rel;
}

// 用扩展长度路径建目录 / 写文件:普通路径在 Windows 上建不出 >260 字符的文件。
void write_file_long(const fs::path& p, const std::string& content) {
    const fs::path io = acecode::to_extended_length_path(p);
    fs::create_directories(io.parent_path());
    std::ofstream ofs(io, std::ios::binary | std::ios::trunc);
    ofs << content;
}

std::string read_file_long(const fs::path& p) {
    std::ifstream ifs(acecode::to_extended_length_path(p), std::ios::binary);
    return std::string(std::istreambuf_iterator<char>(ifs), std::istreambuf_iterator<char>());
}

bool exists_long(const fs::path& p) {
    std::error_code ec;
    return fs::exists(acecode::to_extended_length_path(p), ec);
}

}  // namespace

// 场景:staging 目录名生成。
// 期望:以 kMigrationStagingPrefix 开头、总长 ≤ 21(前缀 13 + 8 位 hex),两次调用不同。
// 来由:原来是 ".acecode-migration-" + 完整 uuid,共 55 字符,staging 下的深层路径因此
// 比最终路径先顶破 MAX_PATH(260),正是 0923 反馈里「系统找不到指定的路径」的最后一截。
TEST_F(DataDirMigrationTest, StagingDirectoryNameIsShort) {
    const std::string a = make_migration_staging_name();
    const std::string b = make_migration_staging_name();
    EXPECT_EQ(a.rfind(kMigrationStagingPrefix, 0), 0u) << a;
    EXPECT_LE(a.size(), 21u) << a;
    EXPECT_NE(a, b);
}

// 场景:数据目录里有一个绝对路径超过 300 字符的文件(5 层 × 60 字符目录)。
// 期望:迁移成功(state=done),目标里同一相对路径的文件存在且内容一致。
// bug 表现:修复前 std::filesystem 走普通路径,受 MAX_PATH 限制,迁移报
// 「cannot copy …: 系统找不到指定的路径」(错误码 3),每次重试都必然失败。
TEST_F(DataDirMigrationTest, CopiesFilesBeyondMaxPath) {
    populate_source(default_dir);
    const fs::path rel = deep_relative_dir() / "deep.txt";
    const fs::path source_file = default_dir / rel;
    ASSERT_GT(s(source_file).size(), 300u) << "前提:源文件路径必须超过 MAX_PATH";
    write_file_long(source_file, "deep content");
    ASSERT_TRUE(exists_long(source_file));

    const fs::path target = root / "moved";
    const auto result = run_data_dir_migration(s(default_dir), s(default_dir), s(target));
    ASSERT_EQ(result.state, "done") << result.error;
    EXPECT_TRUE(exists_long(target / rel));
    EXPECT_EQ(read_file_long(target / rel), "deep content");
    EXPECT_TRUE(fs::exists(target / "config.json"));
}

// 场景:用户选择删除旧数据目录,旧目录里有超过 MAX_PATH 的文件(Agent 用 node / python
// 等长路径感知工具生成的深层产物)。
// 期望:cleanup_previous_data_dir 返回空串,旧目录整个被删除。
// bug 表现:修复前 remove_all 走普通路径删不掉深层文件,返回 CLEANUP_FAILED,旧目录残留。
TEST_F(DataDirMigrationTest, CleanupRemovesFilesBeyondMaxPath) {
    const fs::path old_dir = root / "old-elsewhere";
    write_file_long(old_dir / deep_relative_dir() / "deep.txt", "x");
    write_file(old_dir / "config.json", "{}");
    acecode::DataDirRedirect r;
    r.data_dir = s(root / "elsewhere");
    r.previous_data_dir = s(old_dir);
    r.cleanup_pending = true;
    ASSERT_TRUE(acecode::write_data_dir_redirect(s(default_dir), r));

    EXPECT_EQ(cleanup_previous_data_dir(s(old_dir), s(default_dir)), "");
    EXPECT_FALSE(exists_long(old_dir));
}
