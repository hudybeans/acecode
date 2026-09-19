#include <gtest/gtest.h>

#include "utils/atomic_file.hpp"

#include <fstream>
#include <iterator>
#include <random>
#include <vector>

#ifdef _WIN32
namespace {

class PrivateAtomicFileTest : public ::testing::Test {
protected:
    std::filesystem::path directory;
    std::vector<unsigned char> token_user;

    PSID user_sid() { return reinterpret_cast<TOKEN_USER*>(token_user.data())->User.Sid; }

    DWORD set_access(const std::filesystem::path& path, DWORD mask) {
        EXPLICIT_ACCESSW entry{};
        entry.grfAccessPermissions = mask;
        entry.grfAccessMode = SET_ACCESS;
        entry.Trustee.TrusteeForm = TRUSTEE_IS_SID;
        entry.Trustee.TrusteeType = TRUSTEE_IS_USER;
        entry.Trustee.ptstrName = static_cast<LPWSTR>(user_sid());
        PACL acl = nullptr;
        const DWORD status = SetEntriesInAclW(1, &entry, nullptr, &acl);
        if (status != ERROR_SUCCESS) return status;
        auto native = path.wstring();
        const DWORD result = SetNamedSecurityInfoW(native.data(), SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            nullptr, nullptr, acl, nullptr);
        LocalFree(acl);
        return result;
    }

    void SetUp() override {
        HANDLE token = nullptr;
        ASSERT_TRUE(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token));
        DWORD size = 0;
        GetTokenInformation(token, TokenUser, nullptr, 0, &size);
        token_user.resize(size);
        const bool loaded = GetTokenInformation(token, TokenUser, token_user.data(), size, &size);
        CloseHandle(token);
        ASSERT_TRUE(loaded);
        directory = std::filesystem::temp_directory_path() /
            ("ace_atomic_" + std::to_string(std::random_device{}()));
        ASSERT_TRUE(std::filesystem::create_directory(directory));
        ASSERT_EQ(set_access(directory, FILE_ALL_ACCESS & ~FILE_DELETE_CHILD), ERROR_SUCCESS);
    }

    void TearDown() override {
        if (directory.empty()) return;
        set_access(directory, FILE_ALL_ACCESS);
        std::error_code error;
        for (const auto& entry : std::filesystem::directory_iterator(directory, error))
            set_access(entry.path(), FILE_ALL_ACCESS);
        std::filesystem::remove_all(directory, error);
    }
};

TEST_F(PrivateAtomicFileTest, ReplacesWithoutParentDeleteChildPermission) {
    const auto path = directory / "config.json";
    const auto filename = acecode::path_to_utf8(path);
    ASSERT_TRUE(acecode::atomic_write_file(filename, "first", true));
    ASSERT_TRUE(acecode::atomic_write_file(filename, "replacement", true));
    {
        std::ifstream input(path, std::ios::binary);
        EXPECT_EQ(std::string(std::istreambuf_iterator<char>(input), {}), "replacement");
    }
    EXPECT_FALSE(std::filesystem::exists(path.wstring() + L".tmp"));

    PACL acl = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    auto native = path.wstring();
    ASSERT_EQ(GetNamedSecurityInfoW(native.data(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &acl, nullptr, &descriptor), ERROR_SUCCESS);
    ASSERT_NE(descriptor, nullptr);
    SECURITY_DESCRIPTOR_CONTROL control = 0;
    DWORD revision = 0;
    EXPECT_TRUE(GetSecurityDescriptorControl(descriptor, &control, &revision));
    EXPECT_NE(control & SE_DACL_PROTECTED, 0);
    if (acl) {
        EXPECT_EQ(acl->AceCount, 1);
        for (DWORD i = 0; i < acl->AceCount; ++i) {
            void* raw = nullptr;
            if (!GetAce(acl, i, &raw)) { ADD_FAILURE(); continue; }
            const auto* entry = static_cast<ACCESS_ALLOWED_ACE*>(raw);
            EXPECT_EQ(entry->Header.AceType, ACCESS_ALLOWED_ACE_TYPE);
            EXPECT_TRUE(EqualSid(const_cast<DWORD*>(&entry->SidStart), user_sid()));
            EXPECT_NE(entry->Mask & DELETE, 0u);
        }
    } else {
        ADD_FAILURE() << "Private file must have a restrictive DACL";
    }
    LocalFree(descriptor);
}

} // namespace
#endif
