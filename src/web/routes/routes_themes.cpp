#include "../server_impl.hpp"

namespace acecode::web {
using nlohmann::json;

void WebServer::Impl::register_themes() {
    const auto config_dir = deps.config_path.empty()
        ? path_from_utf8(get_acecode_dir()) : path_from_utf8(deps.config_path).parent_path();
    theme_store = std::make_unique<acecode::themes::ThemeStore>(config_dir / "themes", [this] {
        std::shared_lock<std::shared_mutex> config_lock(app_config_mu);
        return deps.app_config ? deps.app_config->upgrade.base_url : UpgradeConfig{}.base_url;
    });
    const auto respond = [this](const crow::request& req, const std::function<json()>& action) {
        crow::response response;
        response.add_header("Content-Type", "application/json");
        response.add_header("Cache-Control", "no-store");
        try { response.body = action().dump(); }
        catch (const themes::ThemeError& e) {
            response.code = e.status;
            response.body = json{{"error", e.code}, {"message", e.what()}, {"error_path", e.path}}.dump();
        } catch (const json::exception&) {
            response.code = 400;
            response.body = json{{"error", "BAD_REQUEST"}, {"message", "Invalid theme request"}}.dump();
        } catch (...) {
            response.code = 500;
            response.body = json{{"error", "THEME_INSTALL_FAILED"}, {"message", "Theme operation failed"}}.dump();
        }
        return with_cors(req, std::move(response));
    };

    CROW_ROUTE(app, "/api/themes").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req) { return cors_preflight(req); });
    CROW_ROUTE(app, "/api/themes/job").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req) { return cors_preflight(req); });
    CROW_ROUTE(app, "/api/themes/job/cancel").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req) { return cors_preflight(req); });
    CROW_ROUTE(app, "/api/themes/<string>").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req, const std::string&) { return cors_preflight(req); });
    CROW_ROUTE(app, "/api/themes/<string>/install").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req, const std::string&) { return cors_preflight(req); });
    CROW_ROUTE(app, "/api/themes/<string>/images/<string>").methods(crow::HTTPMethod::Options)
    ([this](const crow::request& req, const std::string&, const std::string&) { return cors_preflight(req); });

    CROW_ROUTE(app, "/api/themes").methods(crow::HTTPMethod::GET)
    ([this, respond](const crow::request& req) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        return respond(req, [&] { return theme_store->catalog(req.url_params.get("refresh") != nullptr); });
    });
    CROW_ROUTE(app, "/api/themes/job").methods(crow::HTTPMethod::GET)
    ([this, respond](const crow::request& req) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        return respond(req, [&] { return theme_store->job(); });
    });
    CROW_ROUTE(app, "/api/themes/job/cancel").methods(crow::HTTPMethod::POST)
    ([this, respond](const crow::request& req) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        return respond(req, [&] { return theme_store->cancel(); });
    });
    CROW_ROUTE(app, "/api/themes/<string>").methods(crow::HTTPMethod::GET)
    ([this, respond](const crow::request& req, const std::string& id) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        return respond(req, [&] { return theme_store->definition(id); });
    });
    CROW_ROUTE(app, "/api/themes/<string>/install").methods(crow::HTTPMethod::POST)
    ([this, respond](const crow::request& req, const std::string& id) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        if (auto rejected = reject_if_migrating(req)) return std::move(*rejected);
        return respond(req, [&] { return theme_store->start(id, json::parse(req.body)); });
    });
    CROW_ROUTE(app, "/api/themes/<string>/images/<string>").methods(crow::HTTPMethod::GET)
    ([this, respond](const crow::request& req, const std::string& id, const std::string& kind) {
        if (auto rejected = require_auth(req)) return std::move(*rejected);
        try {
            crow::response response(200);
            response.body = theme_store->image(id, kind);
            response.add_header("Content-Type", "image/png");
            // The installed version behind this URL can change after an update.
            // The frontend caches decoded resources until an explicit refresh.
            response.add_header("Cache-Control", "private, no-store");
            response.add_header("X-Content-Type-Options", "nosniff");
            return with_cors(req, std::move(response));
        } catch (const themes::ThemeError& e) {
            return respond(req, [&]() -> json { throw e; });
        } catch (...) {
            return respond(req, []() -> json { throw themes::ThemeError(502, "THEME_PREVIEW_FAILED", "Could not load theme image"); });
        }
    });
}
} // namespace acecode::web
