#include "utils/logger.hpp"
#include "ftxui/component/acecode_input_trace.hpp"

#include <ctime>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

int run(const std::vector<std::string>& args) {
    if (args.size() < 3) return 2;
    const auto directory = std::filesystem::u8path(args[2]);
    if (args[1] == "trace-path") {
        std::tm local{};
        local.tm_year = 126;
        local.tm_mon = 8;
        local.tm_mday = 20;
        local.tm_hour = 23;
        local.tm_min = 59;
        local.tm_sec = 59;
        local.tm_isdst = -1;
        const auto first = std::chrono::system_clock::from_time_t(std::mktime(&local));
        for (const auto now : {first, first + std::chrono::seconds(1)}) {
            const auto path = ftxui::detail::AcecodeInputTracePath(args[2].c_str(), now);
            if (!path) return 3;
            std::cout << path->filename().u8string() << '\n';
        }
        return 0;
    }
    if (args[1] == "trace-reject") {
        return ftxui::detail::WriteAcecodeInputTrace(args[2].c_str(), "rejected") ? 4 : 0;
    }
    if (args.size() != 5) return 2;
    const int count = std::stoi(args[4]);
    acecode::AppendFile raw;
    if (args[1] == "raw") {
        if (!raw.open(directory)) return 5;
    } else if (args[1] == "logger") {
        acecode::Logger::instance().init_with_rotation(args[2], "tui", false);
    } else if (args[1] != "trace") {
        return 2;
    }
    for (int i = 0; i < count; ++i) {
        const std::string record = "record=" + args[3] + ":" + std::to_string(i) +
                                   " " + std::string(300, 'x');
        if (args[1] == "raw") {
            if (!raw.append(record + "\n")) return 6;
        } else if (args[1] == "trace") {
            if (!ftxui::detail::WriteAcecodeInputTrace(args[2].c_str(), record)) return 7;
        } else {
            LOG_INFO(record);
        }
    }
    return 0;
}

#ifdef _WIN32
int wmain(int argc, wchar_t** argv) {
    std::vector<std::string> args;
    for (int i = 0; i < argc; ++i) args.push_back(std::filesystem::path(argv[i]).u8string());
    return run(args);
}
#else
int main(int argc, char** argv) {
    return run(std::vector<std::string>(argv, argv + argc));
}
#endif
