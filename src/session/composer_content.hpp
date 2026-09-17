#pragma once

#include <nlohmann/json.hpp>
#include <string>
#include <unordered_map>

namespace acecode {

struct ComposerContentResult {
    bool ok = false;
    nlohmann::json content;
    std::string text;
    std::string error;
};

// This is a display/restore contract, independent of provider content parts.
// Keep resource resolution at the API boundary: client paths are not authority
// for an attachment, and draft placeholders are never accepted as sent files.
inline ComposerContentResult normalize_composer_content(const nlohmann::json& value) {
    using nlohmann::json;
    ComposerContentResult result;
    result.error = "invalid composer_content";
    if (!value.is_object() || !value.contains("version") ||
        !value["version"].is_number_integer() || value["version"] != 1 ||
        !value.contains("parts") || !value["parts"].is_array()) return result;
    if (value["parts"].size() > 4096) {
        result.error = "composer_content exceeds 4096 parts";
        return result;
    }
    std::size_t bytes = 0;
    json parts = json::array();
    for (const auto& part : value["parts"]) {
        if (!part.is_object() || !part.contains("type") || !part["type"].is_string()) return result;
        const auto type = part["type"].get<std::string>();
        json clean{{"type", type}};
        auto field = [&](const char* key, bool required, std::size_t max_bytes,
                         bool empty_allowed = false) {
            if (!part.contains(key)) return !required;
            if (!part[key].is_string()) return false;
            const auto& text = part[key].get_ref<const std::string&>();
            if ((!empty_allowed && text.empty()) || text.size() > max_bytes ||
                text.find('\0') != std::string::npos) return false;
            bytes += text.size();
            if (bytes > 2 * 1024 * 1024) return false;
            clean[key] = text;
            return true;
        };
        if (type == "text") {
            if (!field("text", true, 2 * 1024 * 1024, true)) return result;
            result.text += clean["text"].get<std::string>();
        } else if (type == "path") {
            if (!field("path", true, 65536) || !field("token", true, 65536)) return result;
            if (part.contains("directory")) {
                if (!part["directory"].is_boolean()) return result;
                clean["directory"] = part["directory"];
            }
            result.text += clean["token"].get<std::string>();
        } else if (type == "skill") {
            if (!field("name", true, 16384) || !field("token", true, 65536) ||
                !field("path", false, 65536, true)) return result;
            result.text += clean["token"].get<std::string>();
        } else if (type == "attachment") {
            if (!field("key", true, 256) || !field("id", false, 256, true) ||
                !field("name", true, 16384) || !field("kind", true, 64) ||
                !field("mime_type", false, 1024, true) ||
                !field("path", false, 65536, true)) return result;
        } else {
            result.error = "unsupported composer_content part type";
            return result;
        }
        parts.push_back(std::move(clean));
    }
    result.content = json{{"version", 1}, {"parts", std::move(parts)}};
    result.ok = true;
    result.error.clear();
    return result;
}

// Records come from load_attachment for this session, never from raw request
// metadata. Hydrate display fields from those records and keep occurrence keys.
inline bool resolve_composer_content_attachments(
    nlohmann::json& content, const nlohmann::json& verified_records,
    std::string& error) {
    using nlohmann::json;
    std::unordered_map<std::string, const json*> records;
    for (const auto& record : verified_records) {
        records.emplace(record.value("id", std::string{}), &record);
    }
    for (auto& part : content["parts"]) {
        if (part.value("type", std::string{}) != "attachment") continue;
        const auto id = part.value("id", std::string{});
        const auto found = records.find(id);
        if (id.empty() || found == records.end()) {
            error = "composer_content attachment must reference a submitted attachment id";
            return false;
        }
        const auto& record = *found->second;
        part["name"] = record.value("name", std::string{});
        part["kind"] = record.value("kind", std::string{"file"});
        part["mime_type"] = record.value("mime_type", std::string{});
        part.erase("path");
        if (record.contains("path") && record["path"].is_string()) part["path"] = record["path"];
        if (record.contains("metadata") && record["metadata"].is_object() &&
            record["metadata"].contains("source_path") &&
            record["metadata"]["source_path"].is_string()) {
            part["path"] = record["metadata"]["source_path"];
        }
    }
    return true;
}

} // namespace acecode
