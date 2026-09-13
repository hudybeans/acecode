using System;
using System.Configuration;
using System.Globalization;
using System.Text;
using System.Web;
using System.Web.Security;

namespace Acecode.Workshop
{
    public static class WorkshopAdmin
    {
        private const string CookieName = "acecode_workshop_admin";
        private static readonly object AttemptLock = new object();
        private static DateTime attemptWindow = DateTime.UtcNow;
        private static int attempts;
        public static bool Configured
        { get { return WorkshopPackage.Matches(ConfigurationManager.AppSettings["AcecodeWorkshop.AdminKeyHash"], "[a-f0-9]{64}"); } }

        public static bool IsAuthenticated(HttpContext context)
        {
            if (!Configured) return false;
            HttpCookie cookie = context.Request.Cookies[CookieName];
            if (cookie == null) return false;
            try
            {
                byte[] payload = MachineKey.Unprotect(Convert.FromBase64String(cookie.Value), "Acecode.Workshop.Admin", ConfigurationManager.AppSettings["AcecodeWorkshop.AdminKeyHash"]);
                long expiry;
                return payload != null && long.TryParse(Encoding.UTF8.GetString(payload), out expiry) && expiry > DateTime.UtcNow.Ticks && expiry <= DateTime.UtcNow.AddHours(8).Ticks;
            }
            catch { return false; }
        }

        public static void Require(HttpContext context)
        { if (!IsAuthenticated(context)) throw new WorkshopException(401, "admin_required", "请先登录管理员账户。"); }

        public static void Login(HttpContext context, string key)
        {
            if (!Configured) throw new WorkshopException(503, "admin_not_configured", "管理员入口尚未配置，请联系站点管理员。");
            lock (AttemptLock)
            {
                if (DateTime.UtcNow - attemptWindow > TimeSpan.FromMinutes(1)) { attempts = 0; attemptWindow = DateTime.UtcNow; }
                if (++attempts > 20) throw new WorkshopException(429, "login_busy", "登录尝试过多，请一分钟后再试。");
            }
            string expected = ConfigurationManager.AppSettings["AcecodeWorkshop.AdminKeyHash"];
            string actual = WorkshopPackage.Hash(Encoding.UTF8.GetBytes(key ?? ""));
            int different = 0;
            for (int i = 0; i < expected.Length; ++i) different |= expected[i] ^ actual[i];
            if (different != 0) throw new WorkshopException(401, "invalid_credentials", "管理密钥不正确，请重新输入。");
            DateTime expiry = DateTime.UtcNow.AddHours(8);
            string value = Convert.ToBase64String(MachineKey.Protect(Encoding.UTF8.GetBytes(expiry.Ticks.ToString(CultureInfo.InvariantCulture)), "Acecode.Workshop.Admin", expected));
            SetCookie(context, value, expiry);
        }

        public static void Logout(HttpContext context) { SetCookie(context, "", DateTime.UtcNow.AddDays(-1)); }
        private static void SetCookie(HttpContext context, string value, DateTime expiry)
        {
            context.Response.Cookies.Add(new HttpCookie(CookieName, value) {
                HttpOnly = true, Secure = context.Request.IsSecureConnection, SameSite = SameSiteMode.Strict,
                Path = WorkshopHandler.EndpointPath(), Expires = expiry
            });
        }
    }
}
