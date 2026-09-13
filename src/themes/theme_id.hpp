#pragma once

#include <algorithm>
#include <string>

namespace acecode::themes {

// Local themes are data packages, never arbitrary filesystem paths.
inline bool is_local_theme(const std::string& id) {
    return id.size() > 3 && id.size() <= 64 && id.compare(0, 3, "ai-") == 0 &&
        id[3] != '-' && id.back() != '-' && id.find("--") == std::string::npos &&
        std::all_of(id.begin() + 3, id.end(), [](unsigned char c) {
            return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
        });
}

} // namespace acecode::themes
