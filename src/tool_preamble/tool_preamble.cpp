#include "tool_preamble.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <string_view>

namespace acecode::tool_preamble {

namespace {

bool is_space_byte(unsigned char c) {
    return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v';
}

std::string trim(std::string_view s) {
    std::size_t b = 0;
    std::size_t e = s.size();
    while (b < e && is_space_byte(static_cast<unsigned char>(s[b]))) ++b;
    while (e > b && is_space_byte(static_cast<unsigned char>(s[e - 1]))) --e;
    return std::string(s.substr(b, e - b));
}

std::size_t utf8_sequence_length(unsigned char lead) {
    if (lead < 0x80) return 1;
    if ((lead & 0xE0) == 0xC0) return 2;
    if ((lead & 0xF0) == 0xE0) return 3;
    if ((lead & 0xF8) == 0xF0) return 4;
    return 1;  // 非法前导字节按单字节走,不会越界也不会死循环
}

std::size_t count_code_points(std::string_view s) {
    std::size_t count = 0;
    for (std::size_t i = 0; i < s.size();) {
        i += utf8_sequence_length(static_cast<unsigned char>(s[i]));
        ++count;
    }
    return count;
}

// 前缀 max 个 code point 的字节长度(不切断多字节序列)。
std::size_t byte_length_of_prefix(std::string_view s, std::size_t max_code_points) {
    std::size_t i = 0;
    std::size_t count = 0;
    while (i < s.size() && count < max_code_points) {
        const std::size_t len = utf8_sequence_length(static_cast<unsigned char>(s[i]));
        if (i + len > s.size()) break;
        i += len;
        ++count;
    }
    return i;
}

bool starts_with(std::string_view s, std::string_view prefix) {
    return s.size() >= prefix.size() && s.substr(0, prefix.size()) == prefix;
}

bool ends_with(std::string_view s, std::string_view suffix) {
    return s.size() >= suffix.size() &&
           s.substr(s.size() - suffix.size()) == suffix;
}

bool starts_with_ci(std::string_view s, std::string_view prefix) {
    if (s.size() < prefix.size()) return false;
    for (std::size_t i = 0; i < prefix.size(); ++i) {
        if (std::tolower(static_cast<unsigned char>(s[i])) !=
            std::tolower(static_cast<unsigned char>(prefix[i]))) {
            return false;
        }
    }
    return true;
}

std::string collapse_whitespace(std::string_view s) {
    std::string out;
    out.reserve(s.size());
    bool pending_space = false;
    for (unsigned char c : s) {
        if (is_space_byte(c)) {
            pending_space = !out.empty();
            continue;
        }
        if (pending_space) {
            out.push_back(' ');
            pending_space = false;
        }
        out.push_back(static_cast<char>(c));
    }
    return out;
}

// 去掉一层包裹记号(引号 / 反引号 / 加粗 / 斜体),可能嵌套所以循环到不变。
std::string strip_wrappers(std::string s) {
    static constexpr std::array<std::pair<std::string_view, std::string_view>, 10> kPairs{{
        {"**", "**"}, {"__", "__"}, {"`", "`"}, {"\"", "\""}, {"'", "'"},
        {"\xE2\x80\x9C", "\xE2\x80\x9D"},   // “ ”
        {"\xE2\x80\x98", "\xE2\x80\x99"},   // ‘ ’
        {"\xE3\x80\x8C", "\xE3\x80\x8D"},   // 「 」
        {"*", "*"}, {"_", "_"},
    }};
    for (;;) {
        std::string before = s;
        s = trim(s);
        for (const auto& [open, close] : kPairs) {
            if (s.size() > open.size() + close.size() &&
                starts_with(s, open) && ends_with(s, close)) {
                s = trim(s.substr(open.size(), s.size() - open.size() - close.size()));
                break;
            }
        }
        if (s == before) return s;
    }
}

std::string strip_leading_markers(std::string s) {
    for (;;) {
        std::string before = s;
        s = trim(s);
        // 标题井号
        std::size_t hashes = 0;
        while (hashes < s.size() && s[hashes] == '#') ++hashes;
        if (hashes > 0 && hashes < s.size() && s[hashes] == ' ') {
            s = trim(s.substr(hashes));
        }
        // 列表记号 "- " / "* " / "• " / "1. " / "1) "
        if (starts_with(s, "- ") || starts_with(s, "* ") || starts_with(s, "+ ")) {
            s = trim(s.substr(2));
        } else if (starts_with(s, "\xE2\x80\xA2 ")) {
            s = trim(s.substr(4));
        } else {
            std::size_t digits = 0;
            while (digits < s.size() && std::isdigit(static_cast<unsigned char>(s[digits]))) ++digits;
            if (digits > 0 && digits < 3 && digits + 1 < s.size() &&
                (s[digits] == '.' || s[digits] == ')') && s[digits + 1] == ' ') {
                s = trim(s.substr(digits + 2));
            }
        }
        if (s == before) return s;
    }
}

std::string strip_trailing_punctuation(std::string s) {
    static constexpr std::array<std::string_view, 8> kSuffixes{
        "...", "\xE2\x80\xA6" /* … */, ":", "\xEF\xBC\x9A" /* ： */, ".",
        "\xE3\x80\x82" /* 。 */, ",", "\xEF\xBC\x8C" /* ， */,
    };
    for (;;) {
        std::string before = s;
        s = trim(s);
        for (const auto& suffix : kSuffixes) {
            if (s.size() > suffix.size() && ends_with(s, suffix)) {
                s = trim(s.substr(0, s.size() - suffix.size()));
                break;
            }
        }
        if (s == before) return s;
    }
}

std::string first_non_empty_line(std::string_view text) {
    std::size_t pos = 0;
    while (pos <= text.size()) {
        const std::size_t nl = text.find('\n', pos);
        const std::string_view line = text.substr(pos, nl == std::string_view::npos ? std::string_view::npos : nl - pos);
        const std::string trimmed = trim(line);
        if (!trimmed.empty()) return trimmed;
        if (nl == std::string_view::npos) break;
        pos = nl + 1;
    }
    return {};
}

std::size_t non_empty_line_count(std::string_view text) {
    std::size_t count = 0;
    std::size_t pos = 0;
    while (pos <= text.size()) {
        const std::size_t nl = text.find('\n', pos);
        const std::string_view line = text.substr(pos, nl == std::string_view::npos ? std::string_view::npos : nl - pos);
        if (!trim(line).empty()) ++count;
        if (nl == std::string_view::npos) break;
        pos = nl + 1;
    }
    return count;
}

// 推理首句常见的口头填充,去掉后剩下的才是「在干什么」。
std::string strip_reasoning_fillers(std::string s) {
    static constexpr std::array<std::string_view, 18> kFillers{
        "okay, ", "okay ", "ok, ", "ok ", "alright, ", "alright ", "hmm, ", "hmm ",
        "well, ", "so, ", "so ", "let me ", "let's ", "i need to ", "i should ", "i'll ",
        "first, ", "now, ",
    };
    static constexpr std::array<std::string_view, 10> kCjkFillers{
        "\xE5\xA5\xBD\xE7\x9A\x84\xEF\xBC\x8C",   // 好的，
        "\xE5\xA5\xBD\xE7\x9A\x84,",              // 好的,
        "\xE5\xA5\xBD\xEF\xBC\x8C",               // 好，
        "\xE5\x97\xAF\xEF\xBC\x8C",               // 嗯，
        "\xE5\x97\xAF,",                          // 嗯,
        "\xE9\xA6\x96\xE5\x85\x88\xEF\xBC\x8C",   // 首先，
        "\xE9\xA6\x96\xE5\x85\x88,",              // 首先,
        "\xE9\x82\xA3\xE4\xB9\x88\xEF\xBC\x8C",   // 那么，
        "\xE7\x8E\xB0\xE5\x9C\xA8\xEF\xBC\x8C",   // 现在，
        "\xE6\x88\x91\xE9\x9C\x80\xE8\xA6\x81",   // 我需要
    };
    for (;;) {
        std::string before = s;
        s = trim(s);
        for (const auto& filler : kFillers) {
            if (starts_with_ci(s, filler) && s.size() > filler.size()) {
                s = trim(s.substr(filler.size()));
                break;
            }
        }
        for (const auto& filler : kCjkFillers) {
            if (starts_with(s, filler) && s.size() > filler.size()) {
                s = trim(s.substr(filler.size()));
                break;
            }
        }
        if (s == before) return s;
    }
}

// 首句:到第一个句末标点为止。英文句号只在后面跟空格 / 行尾时算句末,
// 避免把 "e.g." / "v1.2" 切坏(启发式,允许少量误切)。
std::string first_sentence(std::string_view s) {
    static constexpr std::array<std::string_view, 6> kCjkEnders{
        "\xE3\x80\x82" /* 。 */, "\xEF\xBC\x81" /* ！ */, "\xEF\xBC\x9F" /* ？ */,
        "\xEF\xBC\x9B" /* ； */, "\xE2\x80\xA6" /* … */, "\xEF\xBC\x8C" /* ， */,
    };
    std::size_t cut = s.size();
    for (std::size_t i = 0; i < s.size(); ++i) {
        const char c = s[i];
        if (c == '!' || c == '?' || c == ';') { cut = i; break; }
        if (c == '.' || c == ',') {
            const bool at_end = i + 1 >= s.size();
            if (at_end || s[i + 1] == ' ') { cut = i; break; }
            continue;
        }
        for (const auto& ender : kCjkEnders) {
            if (starts_with(s.substr(i), ender)) { cut = i; break; }
        }
        if (cut != s.size()) break;
    }
    return std::string(s.substr(0, cut));
}

}  // namespace

bool is_valid_mode(const std::string& mode) {
    return mode == kModePrompt || mode == kModeReasoning || mode == kModeSidecar;
}

std::string extract_first_bold_span(const std::string& text) {
    std::size_t i = 0;
    while (i + 1 < text.size()) {
        if (text[i] == '*' && text[i + 1] == '*') {
            const std::size_t start = i + 2;
            std::size_t j = start;
            bool closed = false;
            while (j + 1 < text.size()) {
                if (text[j] == '*' && text[j + 1] == '*') {
                    closed = true;
                    break;
                }
                ++j;
            }
            if (!closed) return {};
            const std::string inner = trim(std::string_view(text).substr(start, j - start));
            if (!inner.empty()) return inner;
            i = j + 2;
            continue;
        }
        ++i;
    }
    return {};
}

std::string truncate_code_points(const std::string& text, std::size_t max_code_points) {
    if (count_code_points(text) <= max_code_points) return text;
    return text.substr(0, byte_length_of_prefix(text, max_code_points)) + "\xE2\x80\xA6";
}

std::string normalize_title_line(const std::string& text, std::size_t max_code_points) {
    std::string s = collapse_whitespace(text);
    s = strip_leading_markers(s);
    s = strip_wrappers(s);
    s = strip_trailing_punctuation(s);
    s = strip_wrappers(s);
    s = trim(s);
    if (s.empty()) return {};
    return truncate_code_points(s, max_code_points);
}

std::string title_from_reasoning(const std::string& reasoning) {
    const std::string bold = extract_first_bold_span(reasoning);
    if (!bold.empty()) {
        const std::string title = normalize_title_line(bold, kReasoningTitleMaxCodePoints);
        if (!title.empty()) return title;
    }
    std::string line = first_non_empty_line(reasoning);
    if (line.empty()) return {};
    line = strip_leading_markers(line);
    line = strip_wrappers(line);
    line = strip_reasoning_fillers(line);
    line = first_sentence(line);
    const std::string title = normalize_title_line(line, kReasoningTitleMaxCodePoints);
    if (count_code_points(title) < 2) return {};
    return title;
}

std::string title_from_assistant_text(const std::string& text) {
    if (text.find("```") != std::string::npos) return {};
    if (non_empty_line_count(text) != 1) return {};
    const std::string line = first_non_empty_line(text);
    if (count_code_points(line) > kPromptTextMaxCodePoints) return {};
    const std::string title = normalize_title_line(line, kPromptTitleMaxCodePoints);
    if (count_code_points(title) < 2) return {};
    return title;
}

std::string sanitize_sidecar_title(const std::string& raw) {
    std::string line = first_non_empty_line(raw);
    if (line.empty()) return {};
    if (starts_with(line, "[Error]") || starts_with(line, "[Aborted]") ||
        starts_with(line, "[error]")) {
        return {};
    }
    static constexpr std::array<std::string_view, 6> kLabels{
        "title:", "label:", "status:",
        "\xE6\xA0\x87\xE9\xA2\x98\xEF\xBC\x9A",   // 标题：
        "\xE6\xA0\x87\xE9\xA2\x98:",              // 标题:
        "\xE6\xA0\x87\xE7\xAD\xBE\xEF\xBC\x9A",   // 标签：
    };
    for (const auto& label : kLabels) {
        if (starts_with_ci(line, label) && line.size() > label.size()) {
            line = trim(line.substr(label.size()));
            break;
        }
    }
    const std::string title = normalize_title_line(line, kSidecarTitleMaxCodePoints);
    if (count_code_points(title) < 2) return {};
    return title;
}

namespace {

constexpr const char* kToolParameterDescription =
    "Required on every call, including each call of a parallel batch: one short "
    "status line the UI shows while this call runs, 8-12 words or up to 16 Chinese "
    "characters, present-participle phrasing like \"Reading registry sections\" or "
    "\"正在读取注册表段落\", always in the language of the user's latest message (Chinese "
    "user -> Chinese line). Put this key first in the arguments. It is stripped before "
    "the tool runs and never affects the call.";

}  // namespace

bool definition_declares_preamble(const ToolDef& definition) {
    if (!definition.parameters.is_object()) return false;
    const auto props = definition.parameters.find("properties");
    return props != definition.parameters.end() && props->is_object() &&
           props->contains(kToolParameterName);
}

std::size_t inject_preamble_parameter(std::vector<ToolDef>& definitions) {
    std::size_t injected = 0;
    for (auto& def : definitions) {
        if (definition_declares_preamble(def)) continue;
        if (!def.parameters.is_object()) {
            def.parameters = nlohmann::json{
                {"type", "object"},
                {"properties", nlohmann::json::object()},
            };
        }
        auto& params = def.parameters;
        if (!params.contains("properties") || !params["properties"].is_object()) {
            params["properties"] = nlohmann::json::object();
        }
        auto& props = params["properties"];
        if (props.contains(kToolParameterName)) continue;
        props[kToolParameterName] = nlohmann::json{
            {"type", "string"},
            {"description", kToolParameterDescription},
        };
        // 进 required:只当可选参数时,grok 这类模型在并行读批次里几乎从不填(实测会话
        // 20260923-164654-8908 六步只填了一步,GPT 系则每步都填);function-calling 模型
        // 对 required 的参数基本必填。执行前会剥掉,工具本身不受影响;没填也不报错。
        auto& required = params["required"];
        if (!required.is_array()) required = nlohmann::json::array();
        bool listed = false;
        for (const auto& item : required) {
            if (item.is_string() && item.get<std::string>() == kToolParameterName) {
                listed = true;
                break;
            }
        }
        if (!listed) required.push_back(kToolParameterName);
        ++injected;
    }
    return injected;
}

std::string extract_preamble_from_partial_arguments(const std::string& partial_json) {
    const std::string key = std::string("\"") + kToolParameterName + "\"";
    std::size_t pos = partial_json.find(key);
    while (pos != std::string::npos) {
        // 只认对象顶层的键:前一个非空白字符必须是 { 或 ,(值里恰好含这串的不算)。
        bool top_level = false;
        for (std::size_t p = pos; p > 0;) {
            --p;
            const unsigned char c = static_cast<unsigned char>(partial_json[p]);
            if (is_space_byte(c)) continue;
            top_level = (c == '{' || c == ',');
            break;
        }
        if (!top_level) {
            pos = partial_json.find(key, pos + key.size());
            continue;
        }
        std::size_t i = pos + key.size();
        while (i < partial_json.size() && is_space_byte(static_cast<unsigned char>(partial_json[i]))) ++i;
        if (i >= partial_json.size() || partial_json[i] != ':') return {};
        ++i;
        while (i < partial_json.size() && is_space_byte(static_cast<unsigned char>(partial_json[i]))) ++i;
        if (i >= partial_json.size() || partial_json[i] != '"') return {};
        const std::size_t start = i;
        bool escaped = false;
        for (++i; i < partial_json.size(); ++i) {
            const char c = partial_json[i];
            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c != '"') continue;
            try {
                const auto value = nlohmann::json::parse(partial_json.substr(start, i - start + 1));
                if (value.is_string()) {
                    return normalize_title_line(value.get<std::string>(), kPromptTitleMaxCodePoints);
                }
            } catch (...) {
            }
            return {};
        }
        return {};  // 字符串值还没流完
    }
    return {};
}

std::string strip_preamble_parameter(std::string& arguments) {
    nlohmann::json parsed;
    try {
        parsed = nlohmann::json::parse(arguments);
    } catch (...) {
        return {};
    }
    if (!parsed.is_object() || !parsed.contains(kToolParameterName)) return {};
    std::string title;
    if (parsed[kToolParameterName].is_string()) {
        title = normalize_title_line(parsed[kToolParameterName].get<std::string>(),
                                     kPromptTitleMaxCodePoints);
    }
    parsed.erase(kToolParameterName);
    arguments = parsed.dump();
    return title;
}

std::vector<ChatMessage> build_sidecar_messages(const SidecarSummaryInput& input) {
    constexpr std::size_t kTextBudget = 400;
    constexpr std::size_t kArgsBudget = 200;
    constexpr std::size_t kMaxCalls = 8;

    ChatMessage system;
    system.role = "system";
    system.content =
        "You write the one-line status label an IDE shows while a coding agent works. "
        "Given the agent's current step, output ONE short label describing what the agent "
        "is doing right now.\n"
        "Rules:\n"
        "- 3 to 8 words, or up to 16 Chinese characters.\n"
        "- Present-participle phrasing, like \"Reading registry sections\" or "
        "\"Checking the expert loader\".\n"
        "- Same language as the user's request.\n"
        "- No quotes, no trailing punctuation, no explanation, no markdown.\n"
        "- Output the label only.";

    std::string body;
    body += "User request:\n";
    body += input.user_request.empty()
        ? std::string("(not available)")
        : truncate_code_points(collapse_whitespace(input.user_request), kTextBudget);
    body += "\n\nAgent's message for this step:\n";
    body += input.assistant_text.empty()
        ? std::string("(none)")
        : truncate_code_points(collapse_whitespace(input.assistant_text), kTextBudget);
    body += "\n\nTool calls about to run:\n";
    if (input.calls.empty()) {
        body += "(unknown)\n";
    } else {
        std::size_t emitted = 0;
        for (const auto& call : input.calls) {
            if (emitted >= kMaxCalls) {
                body += "- ... and " + std::to_string(input.calls.size() - emitted) + " more\n";
                break;
            }
            body += "- " + (call.name.empty() ? std::string("tool") : call.name);
            const std::string preview = collapse_whitespace(call.args_preview);
            if (!preview.empty()) {
                body += ": " + truncate_code_points(preview, kArgsBudget);
            }
            body += "\n";
            ++emitted;
        }
    }
    body += "\nLabel:";

    ChatMessage user;
    user.role = "user";
    user.content = body;
    return {system, user};
}

} // namespace acecode::tool_preamble
