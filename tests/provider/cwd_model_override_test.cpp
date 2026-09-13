// 覆盖 src/provider/cwd_model_override.{hpp,cpp} 的读写。对应
// openspec/changes/model-profiles 的任务 7.15-7.20,以及中文 cwd 的编码回归。
// 文件头与每个 TEST 都加中文注释,遵循 feedback_unit_test_chinese_comments 约定。
//
// 注意:cwd_model_override 内部用 SessionStorage::get_project_dir(cwd),
// 该函数把 ~/.acecode/projects/<hash> 解析为绝对路径(读 USERPROFILE/HOME)。
// 这里用一个真实存在的临时目录作 cwd,在 HOME 下生成对应 <hash>;测试结束
// 时把生成的 model_override.json 删掉,避免污染开发者环境。
//
// 场景清单:
//   7.16 文件不存在 → nullopt
//   7.17 malformed JSON → nullopt 且不抛
//   7.18 合法文件 → 读到 model_name
//   7.19 save/load round-trip
//   7.20 save 原子性(无 .tmp 残留)
//   额外 remove 语义
//   回归 中文 cwd(正斜杠 / 反斜杠两种形态)不抛、hash 与 UTF-8 口径一致

#include <gtest/gtest.h>

#include "provider/cwd_model_override.hpp"
#include "session/session_storage.hpp"
#include "utils/utf8_path.hpp"

#include <filesystem>
#include <fstream>
#include <random>
#include <string>

namespace fs = std::filesystem;
using namespace acecode;

namespace {

// 为本测试制造一个唯一的 cwd —— 用 temp_directory + 随机后缀,确保不同测试
// 之间的 model_override 文件互不干扰。返回该 cwd 的 UTF-8 路径(已 create)。
std::string make_unique_cwd() {
    auto tmp = fs::temp_directory_path() / ("acecode_cwdtest_" +
        std::to_string(std::random_device{}()));
    fs::create_directories(tmp);
    return path_to_utf8(tmp);
}

// 测试结束清理 —— 删本次写出的 model_override 文件(含 .tmp)。
void cleanup(const std::string& cwd) {
    std::string p = cwd_model_override_path(cwd);
    std::error_code ec;
    fs::remove(path_from_utf8(p), ec);
    fs::remove(path_from_utf8(p + ".tmp"), ec);
    // 不删 cwd —— 是 system temp 目录的子路径,留给系统清理。
}

// override 文件按 UTF-8 口径应当落在的位置:与 SessionStorage::get_project_dir
// 直接拼接,不经过任何 std::filesystem::path 的窄字符串隐式转换。
std::string expected_override_path(const std::string& cwd_utf8) {
    return path_to_utf8(
        path_from_utf8(SessionStorage::get_project_dir(cwd_utf8)) /
        "model_override.json");
}

} // namespace

// 7.16 — 文件不存在 → load 返回 nullopt。
TEST(CwdModelOverrideTest, LoadReturnsNulloptWhenMissing) {
    std::string cwd = make_unique_cwd();
    cleanup(cwd);  // 确保起点没有文件

    auto got = load_cwd_model_override(cwd);
    EXPECT_FALSE(got.has_value());

    cleanup(cwd);
}

// 7.17 — 文件 malformed JSON → load 返回 nullopt,不抛。
TEST(CwdModelOverrideTest, LoadHandlesMalformedJson) {
    std::string cwd = make_unique_cwd();
    std::string p = cwd_model_override_path(cwd);
    fs::create_directories(path_from_utf8(p).parent_path());
    {
        std::ofstream ofs(path_from_utf8(p));
        ofs << "{ this is not json";
    }

    EXPECT_NO_THROW({
        auto got = load_cwd_model_override(cwd);
        EXPECT_FALSE(got.has_value());
    });

    cleanup(cwd);
}

// 7.18 — 合法文件 `{"model_name": "x"}` → load 返回 "x"。
TEST(CwdModelOverrideTest, LoadReadsValidFile) {
    std::string cwd = make_unique_cwd();
    std::string p = cwd_model_override_path(cwd);
    fs::create_directories(path_from_utf8(p).parent_path());
    {
        std::ofstream ofs(path_from_utf8(p));
        ofs << R"({"model_name": "my-claude"})";
    }

    auto got = load_cwd_model_override(cwd);
    ASSERT_TRUE(got.has_value());
    EXPECT_EQ(*got, "my-claude");

    cleanup(cwd);
}

// 7.19 — save 后 load 可 round-trip(同 name 出来,不变形)。
TEST(CwdModelOverrideTest, SaveLoadRoundTrip) {
    std::string cwd = make_unique_cwd();
    cleanup(cwd);

    save_cwd_model_override(cwd, "round-trip-name");
    auto got = load_cwd_model_override(cwd);
    ASSERT_TRUE(got.has_value());
    EXPECT_EQ(*got, "round-trip-name");

    cleanup(cwd);
}

// 7.20 — save 原子性:写完后最终文件存在,tmp 文件 MUST NOT 残留。
TEST(CwdModelOverrideTest, SaveLeavesNoTempArtifact) {
    std::string cwd = make_unique_cwd();
    cleanup(cwd);

    save_cwd_model_override(cwd, "atomic-name");
    std::string final_path = cwd_model_override_path(cwd);
    std::string tmp_path = final_path + ".tmp";

    EXPECT_TRUE(fs::exists(path_from_utf8(final_path)));
    EXPECT_FALSE(fs::exists(path_from_utf8(tmp_path)));

    cleanup(cwd);
}

// 额外 — remove 删掉文件后 load 应返回 nullopt;再 remove 不抛。
TEST(CwdModelOverrideTest, RemoveDeletesFile) {
    std::string cwd = make_unique_cwd();
    save_cwd_model_override(cwd, "to-be-removed");
    ASSERT_TRUE(load_cwd_model_override(cwd).has_value());

    remove_cwd_model_override(cwd);
    EXPECT_FALSE(load_cwd_model_override(cwd).has_value());

    // 二次 remove 不应抛
    EXPECT_NO_THROW(remove_cwd_model_override(cwd));

    cleanup(cwd);
}

// 回归 — 中文 cwd,正斜杠形态(Desktop 目录选择器注册 workspace 时的形态,
// 例如 `E:/SS项目数据库/SS项目数据库V2.0`)。
//
// 触发场景:cwd 的 UTF-8 字节里,`库/` 是 `93 2F`。修复前四个接口的参数类型是
// std::filesystem::path,UTF-8 string 隐式转 path 时 MSVC 按系统 ANSI 代码页
// (中文 Windows = GBK/CP936)+ MB_ERR_INVALID_CHARS 解码;0x2F 不是合法 GBK
// 尾字节,MultiByteToWideChar 报 ERROR_NO_UNICODE_TRANSLATION(1113),构造
// path 直接抛 std::system_error。线上表现:该 workspace 下新建/恢复会话一律
// HTTP 500「500 Internal Server Error」,daemon 日志里只有 workspace registered,
// 没有任何 [registry] 行(2026-09-11 用户反馈)。
// 期望行为:四个接口都不抛;override 路径与 SessionStorage::get_project_dir(utf8)
// 直接拼出来的路径逐字节相同(即 hash 按 UTF-8 口径计算);save/load 能 round-trip。
TEST(CwdModelOverrideTest, CjkCwdWithForwardSlashesDoesNotThrowAndHashesAsUtf8) {
    const std::string base = make_unique_cwd();
    std::string cwd = base + "/SS项目数据库/SS项目数据库V2.0";
    fs::create_directories(path_from_utf8(cwd));

    std::string override_path;
    ASSERT_NO_THROW(override_path = cwd_model_override_path(cwd))
        << "UTF-8 cwd 不应经过 ANSI 代码页转换";
    EXPECT_EQ(override_path, expected_override_path(cwd));

    ASSERT_NO_THROW(cleanup(cwd));
    ASSERT_NO_THROW(save_cwd_model_override(cwd, "cjk-forward-slash"));
    std::optional<std::string> got;
    ASSERT_NO_THROW(got = load_cwd_model_override(cwd));
    ASSERT_TRUE(got.has_value());
    EXPECT_EQ(*got, "cjk-forward-slash");
    ASSERT_NO_THROW(remove_cwd_model_override(cwd));
    EXPECT_FALSE(load_cwd_model_override(cwd).has_value());

    cleanup(cwd);
}

// 回归 — 同一中文 cwd 的反斜杠形态(`fs::current_path()` / `--cwd` 的形态)。
//
// 触发场景:`库\` 是 `93 5C`,0x5C 恰好是合法 GBK 尾字节,修复前不会抛,但会被
// 解成另一串字符,算出的 <cwd_hash> 与 UTF-8 口径不同 —— `/model --cwd` 存下的
// override 在下次启动时静默找不到,而且 TUI(反斜杠)与 Web(正斜杠)两边算的
// hash 还互不相同。
// 期望行为:override 路径与 UTF-8 口径逐字节一致。
TEST(CwdModelOverrideTest, CjkCwdWithBackslashesHashesAsUtf8) {
    const std::string base = make_unique_cwd();
    std::string cwd = base + "\\SS项目数据库\\SS项目数据库V2.0";

    std::string override_path;
    ASSERT_NO_THROW(override_path = cwd_model_override_path(cwd));
    EXPECT_EQ(override_path, expected_override_path(cwd));

    cleanup(cwd);
}

#ifdef _WIN32
namespace {

class LegacyCwdModelOverrideTest : public testing::Test {
protected:
    std::string cwd;
    std::string generic_cwd;
    std::string canonical_path;
    std::string legacy_path;

    void SetUp() override {
        cwd = make_unique_cwd() + "\\资料库\\中文";
        fs::create_directories(path_from_utf8(cwd));
        generic_cwd = path_to_utf8_generic(path_from_utf8(cwd));
        canonical_path = cwd_model_override_path(cwd);
        try {
            // 重现旧版签名造成的隐式转换,不使用新版兼容路径计算逻辑。
            legacy_path = expected_override_path(path_to_utf8(fs::path(cwd)));
        } catch (const std::exception&) {
            GTEST_SKIP() << "This code page cannot have saved the legacy fixture";
        }
        if (legacy_path == canonical_path) {
            GTEST_SKIP() << "UTF-8 filesystem code page does not need legacy lookup";
        }
    }

    void TearDown() override {
        std::error_code ec;
        for (const auto& path : {canonical_path, legacy_path}) {
            if (!path.empty()) fs::remove(path_from_utf8(path), ec);
        }
    }

    void write_legacy(const std::string& contents = R"({"model_name":"legacy-model"})") {
        const auto path = path_from_utf8(legacy_path);
        fs::create_directories(path.parent_path());
        std::ofstream out(path);
        out << contents;
    }
};

} // namespace

// 升级后保留旧模型选择;Desktop 正斜杠入口也能找到 TUI 保存的旧键。
TEST_F(LegacyCwdModelOverrideTest, LoadPreservesLegacyChoiceAcrossSlashForms) {
    write_legacy();
    EXPECT_EQ(load_cwd_model_override(cwd), "legacy-model");
    EXPECT_EQ(load_cwd_model_override(generic_cwd), "legacy-model");
    EXPECT_FALSE(fs::exists(path_from_utf8(canonical_path)));
    EXPECT_TRUE(fs::exists(path_from_utf8(legacy_path)));
}

// 新设置始终优先;即使新文件损坏,也不能回退到已经被覆盖的旧模型。
TEST_F(LegacyCwdModelOverrideTest, CanonicalFileAlwaysTakesPriority) {
    write_legacy();
    save_cwd_model_override(generic_cwd, "new-model");
    EXPECT_EQ(load_cwd_model_override(cwd), "new-model");
    {
        std::ofstream out(path_from_utf8(canonical_path));
        out << "{ invalid json";
    }
    EXPECT_FALSE(load_cwd_model_override(cwd).has_value());
}

// 兼容文件损坏仍为非致命错误;旧代码页转换失败的正斜杠候选也不能抛出。
TEST_F(LegacyCwdModelOverrideTest, MalformedLegacyFileDoesNotPreventStartup) {
    write_legacy("{ invalid json");
    EXPECT_NO_THROW({
        EXPECT_FALSE(load_cwd_model_override(generic_cwd).has_value());
    });
}

// 显式删除应清理两种存储键,避免下次读取时旧模型重新生效。
TEST_F(LegacyCwdModelOverrideTest, RemovalClearsLegacyAndCanonicalCopies) {
    for (bool has_canonical : {false, true}) {
        write_legacy();
        if (has_canonical) save_cwd_model_override(cwd, "new-model");
        remove_cwd_model_override(generic_cwd);
        EXPECT_FALSE(fs::exists(path_from_utf8(canonical_path)));
        EXPECT_FALSE(fs::exists(path_from_utf8(legacy_path)));
        EXPECT_FALSE(load_cwd_model_override(cwd).has_value());
    }
}
#endif
