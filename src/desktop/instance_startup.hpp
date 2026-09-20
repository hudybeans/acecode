#pragma once

#include <string>

namespace acecode::desktop {

struct InstanceStartupPlan {
    bool start = false;
    bool primary = false;
    std::string run_subdirectory;
};

// The primary retains the stable singleton and daemon directory. Additional
// developer instances must never attach to, replace or stop its daemon.
inline InstanceStartupPlan plan_instance_startup(
    bool allow_multiple_instances,
    bool singleton_acquired,
    const std::string& instance_id) {
    if (singleton_acquired) return {true, true, "desktop-shared"};
    if (!allow_multiple_instances) return {};
    return {true, false, "desktop-instances/" + instance_id};
}

} // namespace acecode::desktop
