#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>

int main(int argc, char** argv) {
    if (argc != 2 || std::string(argv[1]) != "--version") return 64;
    std::string mode;
    std::ifstream(".version-probe-mode") >> mode;
    if (mode == "timeout") std::this_thread::sleep_for(std::chrono::seconds(10));
    if (mode == "flood") {
        std::cout << std::string(8192, 'x');
        return 0;
    }
    if (mode == "invalid") {
        std::cout << "not an ACECode version\n";
        return 0;
    }
    const bool old = mode == "old" ||
        (mode == "wrong-installed" && std::filesystem::current_path().filename() == "install");
    std::cout << (old ? "acecode v0.1.0\n" : "acecode v9.9.9\n");
    return mode == "exit" ? 5 : 0;
}
