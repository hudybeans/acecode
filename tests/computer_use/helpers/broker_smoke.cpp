#include "computer_use/runtime.hpp"
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>
#include <thread>

using namespace acecode::computer_use;
using json = nlohmann::json;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
json call(const std::string& owner, const char* action, const std::atomic<bool>* abort = nullptr) {
    return execute(owner, {{"action", action}}, abort);
}
int main() {
    try {
        set_enabled(false);
        require(!call("a", "ping")["success"].get<bool>(), "disabled must reject");
        set_pointer_appearance("ace", "#2563eb");
        set_enabled(true);
        auto first = call("a", "ping");
        require(first["success"].get<bool>(), "start worker");
        require(first["output"]["pointer_appearance"] == json{{"style", "ace"}, {"color", "#2563eb"}}, "default pointer appearance must reach helper");
        const auto observed = call("a", "observe");
        set_pointer_appearance("plain", "#AABBCC");
        const auto restyled = execute("a", {{"action", "use_observation"}, {"observation_id", observed["output"]["observation_id"]},
            {"pointer_appearance", {{"style", "model-forged"}, {"color", "unsafe-color"}}}});
        require(restyled["success"].get<bool>() && restyled["output"]["observation_preserved"].get<bool>(), "appearance changes must preserve observations");
        require(restyled["output"]["pid"] == first["output"]["pid"], "appearance changes must preserve the helper process");
        require(restyled["output"]["pointer_appearance"] == json{{"style", "plain"}, {"color", "#aabbcc"}}, "host appearance must overwrite model values and normalize colors");
        set_pointer_appearance("ace", "#123456");
        require(call("a", "ping")["output"]["pointer_appearance"] == json{{"style", "ace"}, {"color", "#123456"}}, "next call must use the latest appearance");
        require(call("a", "ping")["output"]["pid"] == first["output"]["pid"], "observation worker must persist");
        require(call("b", "ping")["output"]["error"] == "COMPUTER_USE_BUSY", "session lease must exclude peers");
        release_session("b");
        require(call("b", "ping")["output"]["error"] == "COMPUTER_USE_BUSY", "peer must not release lease");
        release_session("a");
        require(call("b", "ping")["success"].get<bool>(), "release must allow next owner");
        auto large = call("b", "large");
        require(large["success"].get<bool>() && large["output"]["bytes"].get_ref<const std::string&>().size() == 8 * 1024 * 1024,
                "large screenshot-sized responses must drain without timeout");
        release_session("b");

        std::atomic<bool> abort{false};
        auto pending = std::async(std::launch::async, [&] { return call("a", "stall", &abort); });
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        auto started = std::chrono::steady_clock::now();
        require(call("b", "ping")["output"]["error"] == "COMPUTER_USE_BUSY", "busy peer should fail while owner is blocked");
        require(std::chrono::steady_clock::now() - started < std::chrono::seconds(1), "peer must not wait for hung owner");
        abort.store(true);
        require(pending.wait_for(std::chrono::seconds(3)) == std::future_status::ready, "abort must unblock promptly");
        require(pending.get()["output"]["error"] == "COMPUTER_USE_CANCELLED", "abort result");
        require(std::chrono::steady_clock::now() - started < std::chrono::seconds(3), "abort latency");
        require(call("b", "ping")["success"].get<bool>(), "abort must release owner");
        release_session("b");

        auto disabled = std::async(std::launch::async, [&] { return call("a", "stall"); });
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        set_enabled(false);
        require(disabled.wait_for(std::chrono::seconds(3)) == std::future_status::ready, "disable must unblock promptly");
        require(!disabled.get()["success"].get<bool>(), "disable must revoke active call");
        set_enabled(true);
        require(call("b", "ping")["success"].get<bool>(), "reenable must start fresh worker");
        require(call("b", "malformed")["output"]["error"] == "COMPUTER_USE_PROTOCOL_ERROR", "malformed reply must fail closed");
        require(call("a", "ping")["success"].get<bool>(), "protocol failure must release worker");
        require(!call("a", "exit")["success"].get<bool>(), "helper exit must fail request");
        started = std::chrono::steady_clock::now();
        require(call("b", "stall")["output"]["error"] == "COMPUTER_USE_TIMEOUT", "hung helper must time out");
        require(std::chrono::steady_clock::now() - started < std::chrono::seconds(23), "hard deadline must be bounded");
        require(call("a", "ping")["success"].get<bool>(), "timeout must release lease");
        shutdown();
        std::cout << "Computer use broker: pointer appearance, lease, observation continuity, large reply, abort, revoke, crash, protocol and timeout passed.\n";
        return 0;
    } catch (const std::exception& error) {
        shutdown();
        std::cerr << error.what() << '\n';
        return 1;
    }
}
