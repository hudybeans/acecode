// Private protocol fixture. Never captures the desktop or sends input.
#include <nlohmann/json.hpp>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#ifndef _WIN32
#include <unistd.h>
#endif
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#endif

int main() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    std::string line;
    std::string observation;
    while (std::getline(std::cin, line)) {
        const auto request = nlohmann::json::parse(line);
        const auto action = request.value("action", std::string{});
        if (action == "stall") std::this_thread::sleep_for(std::chrono::seconds(30));
        if (action == "exit") return 4;
        if (action == "malformed") { std::cout << "bad json\n" << std::flush; continue; }
        nlohmann::json output{{"action", action}};
        output["pointer_appearance"] = request.value("pointer_appearance", nlohmann::json::object());
#ifdef _WIN32
        output["pid"] = GetCurrentProcessId();
#else
        output["pid"] = getpid();
#endif
        if (action == "observe") {
            observation = "owned-fixture-observation";
            output["observation_id"] = observation;
        }
        if (action == "use_observation")
            output["observation_preserved"] = !observation.empty() && request.value("observation_id", std::string{}) == observation;
        if (action == "large") output["bytes"] = std::string(8 * 1024 * 1024, 'x');
        std::cout << nlohmann::json{{"protocol_version", 1}, {"success", true},
                                   {"output", output}}.dump() << '\n' << std::flush;
    }
}
