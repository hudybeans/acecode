using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Acecode.Workshop
{
    public sealed class WorkshopException : Exception
    {
        public readonly int Status;
        public readonly string Code;
        public WorkshopException(int status, string code, string message) : base(message)
        { Status = status; Code = code; }
    }

    public sealed class WorkshopPackage
    {
        public const int MaxPackageBytes = 16 * 1024 * 1024;
        public const int MaxThumbnailBytes = 256 * 1024;
        public static readonly string[] ColorKeys = {
            "bg", "surface", "surface-alt", "surface-hi", "shell-hi", "shell-bg",
            "border", "border-soft", "fg", "fg-2", "fg-mute", "accent", "accent-bg",
            "accent-soft", "ok", "ok-bg", "ok-border", "warn", "warn-bg", "danger",
            "danger-bg", "code-bg", "code-fg", "code-line", "selection", "on-selection",
            "send-bg", "send-fg"
        };
        public Dictionary<string, object> Definition;
        public byte[] Archive;
        public byte[] Background;
        public byte[] Thumbnail;
        public string Key;

        public static JavaScriptSerializer Serializer()
        { return new JavaScriptSerializer { MaxJsonLength = 256 * 1024, RecursionLimit = 16 }; }

        public static bool Matches(string value, string pattern)
        { return value != null && Regex.IsMatch(value, "\\A(?:" + pattern + ")\\z", RegexOptions.CultureInvariant); }

        public static string Hash(byte[] bytes)
        {
            using (SHA256 hash = SHA256.Create())
                return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }

        public static byte[] ReadBounded(Stream stream, int maximum)
        {
            using (MemoryStream output = new MemoryStream())
            {
                byte[] buffer = new byte[32768];
                int count;
                while ((count = stream.Read(buffer, 0, buffer.Length)) != 0)
                {
                    if (output.Length + count > maximum)
                        throw new WorkshopException(413, "package_too_large", "主题包或图片超过大小限制。");
                    output.Write(buffer, 0, count);
                }
                return output.ToArray();
            }
        }

        public static Dictionary<string, object> Object(object value)
        {
            Dictionary<string, object> result = value as Dictionary<string, object>;
            if (result == null) Invalid("主题配置中的对象格式无效。");
            return result;
        }

        public static object Required(Dictionary<string, object> source, string key)
        {
            object value;
            if (!source.TryGetValue(key, out value)) Invalid("主题配置缺少 " + key + "。");
            return value;
        }

        public static string Text(Dictionary<string, object> source, string key)
        {
            string value = Required(source, key) as string;
            if (value == null) Invalid("主题配置的 " + key + " 必须是文本。");
            return value;
        }

        public static long Number(object value)
        {
            if (!(value is int) && !(value is long)) Invalid("主题配置中的大小或版本格式无效。");
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }

        private static void Invalid(string message)
        { throw new WorkshopException(422, "invalid_theme", message); }

        public static WorkshopPackage Parse(byte[] archiveBytes)
        {
            if (archiveBytes == null || archiveBytes.Length == 0 || archiveBytes.Length > MaxPackageBytes)
                throw new WorkshopException(413, "package_too_large", "请选择不超过 16 MB 的主题 ZIP。");
            try
            {
                Dictionary<string, byte[]> files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
                using (MemoryStream input = new MemoryStream(archiveBytes, false))
                using (ZipArchive zip = new ZipArchive(input, ZipArchiveMode.Read))
                {
                    if (zip.Entries.Count != 3) Invalid("主题 ZIP 必须包含 theme.json、background.png 和 thumbnail.png 三个根文件。");
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        string name = entry.FullName;
                        if (name != "theme.json" && name != "background.png" && name != "thumbnail.png")
                            Invalid("主题包包含不允许的文件或路径。");
                        int unixType = (entry.ExternalAttributes >> 16) & 0xf000;
                        if ((unixType != 0 && unixType != 0x8000) || (entry.ExternalAttributes & 0x10) != 0 || files.ContainsKey(name))
                            Invalid("主题包包含链接、目录或重复文件。");
                        int limit = name == "theme.json" ? 32 * 1024 : name == "thumbnail.png" ? MaxThumbnailBytes : MaxPackageBytes;
                        if (entry.Length <= 0 || entry.Length > limit) Invalid("主题包内文件大小不符合要求。");
                        using (Stream stream = entry.Open()) files.Add(name, ReadBounded(stream, limit));
                        if (files[name].LongLength != entry.Length) Invalid("主题包内文件不完整。");
                    }
                }
                string json = new UTF8Encoding(false, true).GetString(files["theme.json"]).TrimStart('\uFEFF');
                Dictionary<string, object> definition = Object(Serializer().DeserializeObject(json));
                ValidateDefinition(definition);
                ValidateImage(files["background.png"], Object(Required(definition, "background")));
                ValidateImage(files["thumbnail.png"], Object(Required(definition, "thumbnail")));
                return new WorkshopPackage {
                    Archive = archiveBytes, Definition = definition, Background = files["background.png"],
                    Thumbnail = files["thumbnail.png"], Key = Hash(archiveBytes)
                };
            }
            catch (WorkshopException) { throw; }
            catch (Exception exception)
            {
                if (!(exception is InvalidDataException) && !(exception is ArgumentException) &&
                    !(exception is IOException) && !(exception is KeyNotFoundException) &&
                    !(exception is InvalidOperationException) && !(exception is System.Runtime.InteropServices.ExternalException)) throw;
                throw new WorkshopException(422, "invalid_theme", "无法读取主题包，请重新从 ACECode 导出完整主题 ZIP。");
            }
        }

        private static void ValidateDefinition(Dictionary<string, object> definition)
        {
            if (Number(Required(definition, "schema_version")) != 1) Invalid("暂不支持这个主题协议版本。");
            string id = Text(definition, "id");
            if (id.Length > 64 || !Matches(id, "ai-[a-z0-9]+(?:-[a-z0-9]+)*"))
                Invalid("仅支持 ACECode 自定义主题包，内置主题不能上传。");
            string version = Text(definition, "version");
            if (version.Length > 40 || !Matches(version, "[0-9][0-9a-z.-]*") || version.Contains("..")) Invalid("主题版本格式无效。");
            string name = Text(definition, "name");
            if (string.IsNullOrWhiteSpace(name) || Encoding.UTF8.GetByteCount(name) > 256 || name.Any(c => c < 32 || c == 127)) Invalid("主题名称无效或过长。");
            string mode = Text(definition, "mode");
            if (mode != "light" && mode != "dark") Invalid("主题色系必须是 light 或 dark。");
            Dictionary<string, object> colors = Object(Required(definition, "colors"));
            if (colors.Count != ColorKeys.Length || ColorKeys.Any(key => !colors.ContainsKey(key) || !Matches(colors[key] as string, "#[0-9a-fA-F]{6}")))
                Invalid("主题需要包含完整的 28 项十六进制配色。");
            object appearanceValue;
            if (definition.TryGetValue("appearance", out appearanceValue))
            {
                foreach (KeyValuePair<string, object> item in Object(appearanceValue))
                {
                    if (item.Key == "logo_color" || item.Key == "home_title_color")
                    { if (!Matches(item.Value as string, "#[0-9a-fA-F]{6}")) Invalid("图标色或首页标题色无效。"); }
                    else if (item.Key != "extend_to_titlebar" || !(item.Value is bool)) Invalid("主题包含不支持的外观参数。");
                }
            }
        }

        private static void ValidateImage(byte[] bytes, Dictionary<string, object> expected)
        {
            if (Number(Required(expected, "bytes")) != bytes.Length || Text(expected, "sha256") != Hash(bytes))
                Invalid("图片大小或 SHA-256 与主题配置不一致。");
            byte[] signature = { 137, 80, 78, 71, 13, 10, 26, 10 };
            if (bytes.Length < 33 || !bytes.Take(8).SequenceEqual(signature) || Encoding.ASCII.GetString(bytes, 12, 4) != "IHDR") Invalid("主题图片必须是有效 PNG。");
            long width = ReadBigEndian(bytes, 16), height = ReadBigEndian(bytes, 20);
            if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 32000000) Invalid("主题图片分辨率超出限制。");
            using (MemoryStream stream = new MemoryStream(bytes, false))
            using (Image image = Image.FromStream(stream, false, true))
                if (image.Width != width || image.Height != height) Invalid("主题图片损坏。");
        }

        private static long ReadBigEndian(byte[] bytes, int offset)
        { return ((long)bytes[offset] << 24) | ((long)bytes[offset + 1] << 16) | ((long)bytes[offset + 2] << 8) | bytes[offset + 3]; }

        public Dictionary<string, object> Describe(DateTime uploadedAt)
        {
            Dictionary<string, object> colors = Object(Definition["colors"]);
            return new Dictionary<string, object> {
                { "key", Key }, { "id", Definition["id"] }, { "name", Definition["name"] },
                { "version", Definition["version"] }, { "mode", Definition["mode"] },
                { "colors", colors }, { "appearance", Definition.ContainsKey("appearance") ? Definition["appearance"] : new Dictionary<string, object>() },
                { "swatches", new[] { colors["accent"], colors["bg"], colors["send-bg"] } },
                { "bytes", Archive.Length }, { "sha256", Key }, { "uploaded_at", uploadedAt.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture) }
            };
        }
    }
}
