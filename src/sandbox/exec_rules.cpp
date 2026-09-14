#include "exec_rules.hpp"

#include "utils/logger.hpp"
#include "utils/utf8_path.hpp"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <set>

namespace acecode::sandbox {

namespace {

std::string lower(std::string s) {
    for (char& c : s) {
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    }
    return s;
}

int severity(RuleDecision d) {
    switch (d) {
        case RuleDecision::Forbidden:      return 4;
        case RuleDecision::Prompt:         return 3;
        case RuleDecision::AllowSandboxed: return 2;
        case RuleDecision::Allow:          return 1;
        case RuleDecision::NoMatch:        return 0;
    }
    return 0;
}

// ---------------------------------------------------------------------------
// 极简 Starlark 子集解析器
// ---------------------------------------------------------------------------

struct Value {
    enum class Kind { String, List } kind = Kind::String;
    std::string str;
    std::vector<Value> list;
};

class Parser {
public:
    explicit Parser(const std::string& text) : s_(text) {}

    // 返回 false = 语法错误,error_ 里有原因。
    bool parse(std::vector<PrefixRule>& out, RuleScope scope, const std::string& source) {
        while (true) {
            skip_ws();
            if (eof()) return true;
            std::string ident;
            if (!read_ident(ident)) return fail("expected a call such as prefix_rule(...)");
            skip_ws();
            if (!consume('(')) return fail("expected '(' after " + ident);
            std::vector<std::pair<std::string, Value>> kwargs;
            if (!read_kwargs(kwargs)) return false;
            if (ident == "prefix_rule") {
                PrefixRule rule;
                rule.scope = scope;
                rule.source_file = source;
                if (!build_rule(kwargs, rule)) return false;
                out.push_back(std::move(rule));
            } else if (ident == "host_executable") {
                // 忽略。
            } else {
                return fail("unsupported call: " + ident);
            }
        }
    }

    const std::string& error() const { return error_; }

private:
    bool eof() const { return pos_ >= s_.size(); }
    char peek() const { return eof() ? '\0' : s_[pos_]; }

    bool fail(const std::string& why) {
        error_ = why + " (line " + std::to_string(line_) + ")";
        return false;
    }

    void skip_ws() {
        while (!eof()) {
            const char c = s_[pos_];
            if (c == '\n') { ++line_; ++pos_; continue; }
            if (c == ' ' || c == '\t' || c == '\r') { ++pos_; continue; }
            if (c == '#') {
                while (!eof() && s_[pos_] != '\n') ++pos_;
                continue;
            }
            break;
        }
    }

    bool consume(char c) {
        if (peek() != c) return false;
        ++pos_;
        return true;
    }

    bool read_ident(std::string& out) {
        out.clear();
        while (!eof()) {
            const char c = s_[pos_];
            if (std::isalnum(static_cast<unsigned char>(c)) || c == '_') {
                out += c;
                ++pos_;
            } else {
                break;
            }
        }
        return !out.empty();
    }

    bool read_string(std::string& out) {
        const char quote = peek();
        if (quote != '"' && quote != '\'') return fail("expected a string");
        ++pos_;
        out.clear();
        while (!eof() && s_[pos_] != quote) {
            char c = s_[pos_];
            if (c == '\n') return fail("unterminated string");
            if (c == '\\' && pos_ + 1 < s_.size()) {
                const char n = s_[pos_ + 1];
                if (n == 'n') out += '\n';
                else if (n == 't') out += '\t';
                else if (n == '\\') out += '\\';
                else if (n == '"') out += '"';
                else if (n == '\'') out += '\'';
                else return fail("unsupported escape in string");
                pos_ += 2;
                continue;
            }
            out += c;
            ++pos_;
        }
        if (eof()) return fail("unterminated string");
        ++pos_;
        return true;
    }

    bool read_value(Value& v, int depth = 0) {
        if (depth > 8) return fail("list nesting too deep");
        skip_ws();
        if (peek() == '[') {
            ++pos_;
            v.kind = Value::Kind::List;
            while (true) {
                skip_ws();
                if (consume(']')) return true;
                Value item;
                if (!read_value(item, depth + 1)) return false;
                v.list.push_back(std::move(item));
                skip_ws();
                if (consume(',')) continue;
                skip_ws();
                if (consume(']')) return true;
                return fail("expected ',' or ']' in list");
            }
        }
        v.kind = Value::Kind::String;
        return read_string(v.str);
    }

    bool read_kwargs(std::vector<std::pair<std::string, Value>>& out) {
        while (true) {
            skip_ws();
            if (consume(')')) return true;
            std::string key;
            if (!read_ident(key)) return fail("expected a keyword argument");
            skip_ws();
            if (!consume('=')) return fail("expected '=' after " + key);
            Value v;
            if (!read_value(v)) return false;
            out.emplace_back(std::move(key), std::move(v));
            skip_ws();
            if (consume(',')) continue;
            skip_ws();
            if (consume(')')) return true;
            return fail("expected ',' or ')' in call");
        }
    }

    bool build_rule(const std::vector<std::pair<std::string, Value>>& kwargs, PrefixRule& rule) {
        bool has_pattern = false;
        std::vector<std::string> match_examples;
        std::vector<std::string> not_match_examples;
        std::set<std::string> seen;
        for (const auto& [key, v] : kwargs) {
            if (!seen.insert(key).second) return fail("duplicate keyword: " + key);
            if (key == "pattern") {
                if (v.kind != Value::Kind::List || v.list.empty()) return fail("pattern must be a non-empty list");
                for (const auto& item : v.list) {
                    std::vector<std::string> alts;
                    if (item.kind == Value::Kind::String) {
                        if (item.str.empty()) return fail("pattern tokens must be non-empty");
                        alts.push_back(item.str);
                    } else {
                        if (item.list.empty()) return fail("pattern alternatives must be non-empty");
                        for (const auto& alt : item.list) {
                            if (alt.kind != Value::Kind::String || alt.str.empty()) {
                                return fail("pattern alternatives must be strings");
                            }
                            alts.push_back(alt.str);
                        }
                    }
                    rule.pattern.push_back(std::move(alts));
                }
                has_pattern = true;
            } else if (key == "decision") {
                if (v.kind != Value::Kind::String) return fail("decision must be a string");
                const std::string d = lower(v.str);
                if (d == "allow") rule.decision = RuleDecision::Allow;
                else if (d == "prompt") rule.decision = RuleDecision::Prompt;
                else if (d == "forbidden") rule.decision = RuleDecision::Forbidden;
                else return fail("invalid decision: " + v.str);
            } else if (key == "justification") {
                if (v.kind != Value::Kind::String) return fail("justification must be a string");
                rule.justification = v.str;
            } else if (key == "match" || key == "not_match") {
                if (v.kind != Value::Kind::List) return fail(key + " must be a list");
                for (const auto& item : v.list) {
                    if (item.kind != Value::Kind::String) return fail(key + " entries must be strings");
                    (key == "match" ? match_examples : not_match_examples).push_back(item.str);
                }
            } else {
                return fail("unsupported prefix_rule argument: " + key);
            }
        }
        if (!has_pattern) return fail("prefix_rule requires pattern");
        for (const auto& example : match_examples) {
            CommandClassification c = classify_command(example);
            bool any = false;
            for (const auto& seg : c.segments) {
                if (prefix_rule_matches(rule, seg)) { any = true; break; }
            }
            if (!any) return fail("match example does not match its rule: " + example);
        }
        for (const auto& example : not_match_examples) {
            CommandClassification c = classify_command(example);
            for (const auto& seg : c.segments) {
                if (prefix_rule_matches(rule, seg)) {
                    return fail("not_match example unexpectedly matches: " + example);
                }
            }
        }
        return true;
    }

    const std::string& s_;
    std::size_t pos_ = 0;
    int line_ = 1;
    std::string error_;
};

std::string read_text_file(const std::filesystem::path& path) {
    std::ifstream ifs(path, std::ios::binary);
    if (!ifs) return "!unreadable rules file";
    std::string text(1024 * 1024 + 1, '\0');
    ifs.read(text.data(), static_cast<std::streamsize>(text.size()));
    text.resize(static_cast<std::size_t>(ifs.gcount()));
    return text;
}

void load_dir(const std::string& dir, RuleScope scope, std::vector<PrefixRule>& out,
              std::vector<std::string>& skipped) {
    if (dir.empty()) return;
    std::error_code ec;
    const std::filesystem::path root = path_from_utf8(dir);
    if (!std::filesystem::is_directory(root, ec) || ec) return;
    std::vector<std::filesystem::path> files;
    for (const auto& entry : std::filesystem::directory_iterator(root, ec)) {
        if (ec) break;
        if (!entry.is_regular_file(ec) || ec) { ec.clear(); continue; }
        if (entry.path().extension() == ".rules") files.push_back(entry.path());
    }
    std::sort(files.begin(), files.end());
    for (const auto& file : files) {
        const std::string name = path_to_utf8(file);
        ParsedRulesFile parsed = parse_rules_text(read_text_file(file), scope, name);
        if (!parsed.error.empty()) {
            LOG_WARN("[sandbox] skipping exec rules file " + name + ": " + parsed.error);
            skipped.push_back(name + ": " + parsed.error);
            continue;
        }
        for (auto& rule : parsed.rules) out.push_back(std::move(rule));
    }
}

RuleDecision degrade_for_scope(RuleDecision d, RuleScope scope) {
    if (d == RuleDecision::Allow && scope == RuleScope::Project) return RuleDecision::AllowSandboxed;
    return d;
}

} // namespace

const char* rule_decision_name(RuleDecision d) {
    switch (d) {
        case RuleDecision::NoMatch:        return "no_match";
        case RuleDecision::Allow:          return "allow";
        case RuleDecision::AllowSandboxed: return "allow_sandboxed";
        case RuleDecision::Prompt:         return "prompt";
        case RuleDecision::Forbidden:      return "forbidden";
    }
    return "no_match";
}

ParsedRulesFile parse_rules_text(const std::string& text, RuleScope scope,
                                 const std::string& source_file) {
    ParsedRulesFile out;
    if (text.size() > 1024 * 1024) { out.error = "rules file exceeds 1 MiB"; return out; }
    Parser parser(text);
    if (!parser.parse(out.rules, scope, source_file)) {
        out.rules.clear();
        out.error = parser.error();
    }
    return out;
}

bool prefix_rule_matches(const PrefixRule& rule, const CommandSegment& segment) {
    if (rule.pattern.empty() || segment.tokens.size() < rule.pattern.size()) return false;
    for (std::size_t i = 0; i < rule.pattern.size(); ++i) {
        const std::string& tok = segment.tokens[i];
        bool any = false;
        for (const auto& alt : rule.pattern[i]) {
            if (tok == alt) { any = true; break; }
            if (i == 0 && command_basename(tok) == command_basename(alt)) { any = true; break; }
        }
        if (!any) return false;
    }
    return true;
}

ExecRules ExecRules::load(const std::string& global_rules_dir,
                          const std::string& project_rules_dir) {
    ExecRules rules;
    load_dir(global_rules_dir, RuleScope::Global, rules.rules_, rules.skipped_files_);
    load_dir(project_rules_dir, RuleScope::Project, rules.rules_, rules.skipped_files_);
    return rules;
}

RuleEvaluation ExecRules::evaluate_segment(const CommandSegment& segment) const {
    RuleEvaluation out;
    for (const auto& rule : rules_) {
        if (!prefix_rule_matches(rule, segment)) continue;
        RuleMatch m;
        m.rule = &rule;
        m.decision = degrade_for_scope(rule.decision, rule.scope);
        if (severity(m.decision) > severity(out.decision)) {
            out.decision = m.decision;
            out.justification = rule.justification;
        }
        out.matches.push_back(m);
    }
    return out;
}

RuleEvaluation ExecRules::evaluate(const std::vector<CommandSegment>& segments) const {
    RuleEvaluation out;
    if (segments.empty()) return out;
    bool all_allow = true;
    bool any_sandboxed = false;
    for (const auto& seg : segments) {
        RuleEvaluation e = evaluate_segment(seg);
        for (const auto& m : e.matches) out.matches.push_back(m);
        if (e.decision == RuleDecision::Prompt || e.decision == RuleDecision::Forbidden) {
            if (severity(e.decision) > severity(out.decision)) {
                out.decision = e.decision;
                out.justification = e.justification;
            }
            all_allow = false;
        } else if (e.decision == RuleDecision::Allow) {
            if (out.justification.empty()) out.justification = e.justification;
        } else if (e.decision == RuleDecision::AllowSandboxed) {
            any_sandboxed = true;
            if (out.justification.empty()) out.justification = e.justification;
        } else {
            all_allow = false;
        }
    }
    if (out.decision == RuleDecision::Prompt || out.decision == RuleDecision::Forbidden) return out;
    if (all_allow) out.decision = any_sandboxed ? RuleDecision::AllowSandboxed : RuleDecision::Allow;
    return out;
}

RuleEvaluation ExecRules::evaluate(const CommandClassification& command) const {
    auto result = evaluate(command.segments);
    if (!command.split_safely &&
        (result.decision == RuleDecision::Allow || result.decision == RuleDecision::AllowSandboxed)) {
        result.decision = RuleDecision::NoMatch;
        result.justification.clear();
    }
    // 包装器不会让内层的 forbidden/prompt 规则失效,内层 allow 则不能自动授权包装器。
    for (const auto& segment : command.nested_segments) {
        auto nested = evaluate_segment(segment);
        if ((nested.decision == RuleDecision::Forbidden || nested.decision == RuleDecision::Prompt) &&
            severity(nested.decision) > severity(result.decision)) {
            result.decision = nested.decision;
            result.justification = nested.justification;
        }
    }
    return result;
}

} // namespace acecode::sandbox
