using System;
using System.Collections.Generic;
using System.Configuration;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Web;
using Acecode.FeedbackUpload;

namespace Acecode.Workshop
{
    public sealed class WorkshopHandler : IHttpHandler
    {
        private static readonly SemaphoreSlim UploadSlots = new SemaphoreSlim(2, 2);
        public bool IsReusable { get { return true; } }
        public static string EndpointPath()
        { return FeedbackUploadPolicy.NormalizeEndpointPath(ConfigurationManager.AppSettings["AcecodeFeedback.EndpointPath"] ?? "/aupdate/") + "workshop/"; }

        public void ProcessRequest(HttpContext context)
        {
            context.Response.TrySkipIisCustomErrors = true;
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "same-origin";
            try { Handle(context); }
            catch (WorkshopException exception) { Json(context, exception.Status, new { error = exception.Code, message = exception.Message }); }
            catch (HttpException exception) { Json(context, exception.GetHttpCode() == 413 ? 413 : 400, new { error = "invalid_request", message = "无法读取上传文件，请检查文件大小后重试。" }); }
            catch (Exception exception)
            {
                Trace.TraceError("ACECode workshop request failed: {0}", exception);
                Json(context, 500, new { error = "workshop_error", message = "工坊暂时不可用，请稍后重试。" });
            }
        }

        private static void Handle(HttpContext context)
        {
            string prefix = EndpointPath();
            string path = context.Request.Path;
            bool reading = context.Request.HttpMethod == "GET" || context.Request.HttpMethod == "HEAD";
            if (path.TrimEnd('/').Equals(prefix.TrimEnd('/'), StringComparison.OrdinalIgnoreCase) && !path.EndsWith("/", StringComparison.Ordinal))
            {
                if (!reading) throw new WorkshopException(405, "method_not_allowed", "不支持此操作。");
                context.Response.Redirect(prefix, false); return;
            }
            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new WorkshopException(404, "not_found", "页面不存在。");
            string route = path.Substring(prefix.Length);
            string storage = ConfigurationManager.AppSettings["AcecodeWorkshop.StoragePath"] ?? @"J:\acecode-workshop";
            string siteRoot = context.Server.MapPath("~/");
            if (FeedbackUploadPolicy.IsPathWithinDirectory(storage, siteRoot)) throw new WorkshopException(500, "unsafe_storage", "主题存储配置无效。");
            WorkshopStore store = new WorkshopStore(storage);
            bool admin = WorkshopAdmin.IsAuthenticated(context);
            if (context.Request.HttpMethod == "POST") ValidateWrite(context);
            if (route == "api/admin/session" && reading)
            { Json(context, 200, new { authenticated = admin, configured = WorkshopAdmin.Configured }); return; }
            if (route == "api/admin/session" && context.Request.HttpMethod == "POST")
            {
                string body = Encoding.UTF8.GetString(WorkshopPackage.ReadBounded(context.Request.InputStream, 4096));
                Dictionary<string, object> form;
                try { form = WorkshopPackage.Object(WorkshopPackage.Serializer().DeserializeObject(body)); }
                catch { throw new WorkshopException(400, "invalid_request", "登录信息格式无效。"); }
                WorkshopAdmin.Login(context, WorkshopPackage.Text(form, "key"));
                Json(context, 200, new { authenticated = true }); return;
            }
            if (route == "api/admin/logout" && context.Request.HttpMethod == "POST")
            { WorkshopAdmin.Logout(context); Json(context, 200, new { authenticated = false }); return; }
            if (route.StartsWith("api/admin/", StringComparison.Ordinal)) WorkshopAdmin.Require(context);
            if (reading && (route == "api/themes" || route == "api/admin/themes"))
            {
                string query = (context.Request.QueryString["q"] ?? "").Trim();
                string mode = context.Request.QueryString["mode"] ?? "all";
                int page;
                if (!int.TryParse(context.Request.QueryString["page"], out page) || page < 1) page = 1;
                page = Math.Min(page, 100000);
                string status = context.Request.QueryString["status"] ?? "pending";
                var items = store.List(route == "api/admin/themes").Where(item => (route != "api/admin/themes" || status == "all" || (string)item["status"] == status) && (mode == "all" || (string)item["mode"] == mode) &&
                    (((string)item["name"]).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 || ((string)item["id"]).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0));
                items = context.Request.QueryString["sort"] == "name" ? items.OrderBy(item => (string)item["name"], StringComparer.OrdinalIgnoreCase) : items.OrderByDescending(item => (string)item["uploaded_at"], StringComparer.Ordinal);
                var materialized = items.ToList();
                Json(context, 200, new { themes = materialized.Skip((page - 1) * 24).Take(24).Select(item => WithUrls(item, prefix)).ToArray(), total = materialized.Count, page = page, page_size = 24, max_package_bytes = WorkshopPackage.MaxPackageBytes });
                return;
            }
            if (context.Request.HttpMethod == "POST" && route.StartsWith("api/admin/themes/", StringComparison.Ordinal))
            {
                string[] parts = route.Split('/');
                if (parts.Length != 5 || (parts[4] != "approve" && parts[4] != "reject")) throw new WorkshopException(404, "not_found", "操作不存在。");
                Json(context, 200, new { theme = WithUrls(store.Moderate(parts[3], parts[4] == "approve"), prefix) }); return;
            }
            if (context.Request.HttpMethod == "POST" && (route == "api/preview" || route == "api/themes"))
            {
                if (!UploadSlots.Wait(0)) throw new WorkshopException(429, "upload_busy", "当前上传较多，请稍后重试。");
                try
                {
                    if (context.Request.ContentLength <= 0 || context.Request.ContentLength > WorkshopPackage.MaxPackageBytes + 65536) throw new WorkshopException(413, "package_too_large", "请选择不超过 16 MB 的主题 ZIP。");
                    if (!(context.Request.ContentType ?? "").StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase) || context.Request.Files.Count != 1 || context.Request.Files["file"] == null)
                        throw new WorkshopException(400, "file_required", "请选择一份主题 ZIP。");
                    HttpPostedFile file = context.Request.Files["file"];
                    if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) throw new WorkshopException(415, "zip_required", "仅支持完整主题 ZIP。");
                    WorkshopPackage package = WorkshopPackage.Parse(WorkshopPackage.ReadBounded(file.InputStream, WorkshopPackage.MaxPackageBytes));
                    if (route == "api/preview")
                    {
                        var preview = package.Describe(DateTime.UtcNow);
                        preview["thumbnail_url"] = "data:image/png;base64," + Convert.ToBase64String(package.Thumbnail);
                        Json(context, 200, new { theme = preview });
                    }
                    else
                    {
                        bool duplicate;
                        var theme = store.Publish(package, out duplicate);
                        Json(context, duplicate ? 200 : 201, new { status = theme["status"], duplicate = duplicate, name = theme["name"] });
                    }
                }
                finally { UploadSlots.Release(); }
                return;
            }
            if (reading && route.StartsWith("api/themes/", StringComparison.Ordinal))
            {
                string[] parts = route.Split('/');
                if (parts.Length != 4) throw new WorkshopException(404, "not_found", "资源不存在。");
                string resource = store.Resource(parts[2], parts[3], admin);
                if (parts[3] == "download")
                {
                    var theme = store.Read(parts[2], admin);
                    string filename = (string)theme["id"] + "-" + (string)theme["version"] + ".zip";
                    context.Response.Headers["Content-Disposition"] = "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + Uri.EscapeDataString((string)theme["name"] + "-" + (string)theme["version"] + ".zip");
                }
                SendFile(context, resource, parts[3] == "download" ? "application/zip" : "image/png");
                return;
            }
            if (reading)
            {
                Dictionary<string, string> assets = new Dictionary<string, string>(StringComparer.Ordinal) {
                    { "", "text/html; charset=utf-8" }, { "index.html", "text/html; charset=utf-8" }, { "admin", "text/html; charset=utf-8" },
                    { "workshop.css", "text/css; charset=utf-8" }, { "workshop.js", "text/javascript; charset=utf-8" },
                    { "assets/acecode-logo.png", "image/png" }, { "assets/acecode-light.png", "image/png" }, { "assets/acecode-dark.png", "image/png" }
                };
                string contentType;
                if (assets.TryGetValue(route, out contentType))
                {
                    if (contentType.StartsWith("text/html", StringComparison.Ordinal))
                        context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
                    SendFile(context, context.Server.MapPath(prefix + (route.Length == 0 || route == "admin" ? "index.html" : route)), contentType);
                    return;
                }
            }
            throw new WorkshopException(reading ? 404 : 405, "not_found", "页面或操作不存在。");
        }

        private static void ValidateWrite(HttpContext context)
        {
            if (context.Request.Headers["X-Workshop-Request"] != "1") throw new WorkshopException(403, "invalid_request", "请从主题工坊页面操作。");
            string origin = context.Request.Headers["Origin"];
            Uri source;
            if (!string.IsNullOrEmpty(origin) && (!Uri.TryCreate(origin, UriKind.Absolute, out source) || source.GetLeftPart(UriPartial.Authority) != context.Request.Url.GetLeftPart(UriPartial.Authority)))
                throw new WorkshopException(403, "invalid_origin", "请从当前工坊页面操作。");
        }

        private static Dictionary<string, object> WithUrls(Dictionary<string, object> item, string prefix)
        {
            var result = new Dictionary<string, object>(item);
            string resource = prefix + "api/themes/" + (string)item["key"] + "/";
            result["thumbnail_url"] = resource + "thumbnail";
            result["background_url"] = resource + "background";
            result["download_url"] = resource + "download";
            return result;
        }

        private static void SendFile(HttpContext context, string path, string contentType)
        {
            if (!File.Exists(path)) throw new WorkshopException(404, "not_found", "资源不存在。");
            context.Response.ContentType = contentType;
            context.Response.Headers["Content-Length"] = new FileInfo(path).Length.ToString(CultureInfo.InvariantCulture);
            context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
            if (context.Request.HttpMethod != "HEAD") context.Response.TransmitFile(path);
        }

        private static void Json(HttpContext context, int status, object value)
        {
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentEncoding = Encoding.UTF8;
            context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
            if (context.Request.HttpMethod != "HEAD")
                context.Response.Write(new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = 1024 * 1024, RecursionLimit = 16 }.Serialize(value));
        }
    }
}
