using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using Acecode.FeedbackUpload;

namespace Acecode.Workshop
{
    public sealed class WorkshopStore
    {
        private readonly string root;
        public WorkshopStore(string path)
        {
            root = Path.GetFullPath(path);
            RejectLink(root);
        }

        private void RejectLink(string path)
        {
            // The configured root is trusted; parent junctions (Windows user
            // profiles, for example) are outside the upload-controlled tree.
            for (DirectoryInfo current = new DirectoryInfo(path); current != null && FeedbackUploadPolicy.IsPathWithinDirectory(current.FullName, root); current = current.Parent)
                if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                    throw new WorkshopException(500, "unsafe_storage", "主题存储目录不可用。");
        }

        public List<Dictionary<string, object>> List(bool includeUnpublished = false)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            if (!Directory.Exists(root)) return result;
            foreach (string directory in Directory.EnumerateDirectories(root))
            {
                string key = Path.GetFileName(directory);
                if (!WorkshopPackage.Matches(key, "[a-f0-9]{64}")) continue;
                try
                {
                    var record = Read(key, true);
                    if (includeUnpublished || (string)record["status"] == "approved") result.Add(record);
                }
                catch (Exception exception) { Trace.TraceWarning("Workshop skipped incomplete record: {0}", exception.Message); }
            }
            return result;
        }

        public Dictionary<string, object> Read(string key, bool includeUnpublished = false)
        {
            string directory = PackageDirectory(key);
            string record = Path.Combine(directory, "record.json");
            if (!File.Exists(record) || new FileInfo(record).Length > 128 * 1024 || !File.Exists(Path.Combine(directory, "theme.zip")))
                throw new WorkshopException(404, "theme_not_found", "主题已不存在，请刷新列表。");
            var result = WorkshopPackage.Object(WorkshopPackage.Serializer().DeserializeObject(File.ReadAllText(record, Encoding.UTF8)));
            if (!result.ContainsKey("status")) result["status"] = "pending";
            if (!includeUnpublished && (string)result["status"] != "approved")
                throw new WorkshopException(404, "theme_not_found", "未找到公开主题。");
            return result;
        }

        private string PackageDirectory(string key)
        {
            if (!WorkshopPackage.Matches(key, "[a-f0-9]{64}")) throw new WorkshopException(404, "theme_not_found", "未找到主题。");
            string directory = Path.Combine(root, key);
            RejectLink(directory);
            return directory;
        }

        public string Resource(string key, string kind, bool includeUnpublished = false)
        {
            Read(key, includeUnpublished);
            string filename = kind == "download" ? "theme.zip" : kind == "background" ? "background.png" : kind == "thumbnail" ? "thumbnail.png" : null;
            if (filename == null) throw new WorkshopException(404, "resource_not_found", "未找到主题资源。");
            string path = Path.Combine(PackageDirectory(key), filename);
            if (!File.Exists(path) || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new WorkshopException(404, "resource_not_found", "主题资源不可用。");
            return path;
        }

        public Dictionary<string, object> Publish(WorkshopPackage package, out bool duplicate)
        {
            duplicate = false;
            Directory.CreateDirectory(root);
            if (!FeedbackUploadPolicy.HasRequiredFreeSpace(root, package.Archive.LongLength + package.Background.LongLength + package.Thumbnail.LongLength, FeedbackUploadPolicy.DefaultMinimumFreeBytes))
                throw new WorkshopException(507, "storage_full", "服务器空间不足，请稍后再试。");
            FileStream publicationLock;
            try { publicationLock = new FileStream(Path.Combine(root, ".publish.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) { throw new WorkshopException(409, "upload_busy", "另一份主题正在发布，请稍后重试。"); }
            using (publicationLock)
            {
                if (Directory.Exists(Path.Combine(root, package.Key))) { duplicate = true; return Read(package.Key, true); }
                if (List(true).Any(item => (string)item["id"] == (string)package.Definition["id"] && (string)item["version"] == (string)package.Definition["version"]))
                    throw new WorkshopException(409, "version_conflict", "此主题版本已存在且内容不同，请修改主题版本后重新导出。");
                string staging = Path.Combine(root, ".upload-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(staging);
                try
                {
                    Dictionary<string, object> record = package.Describe(DateTime.UtcNow);
                    record["status"] = "pending";
                    File.WriteAllBytes(Path.Combine(staging, "theme.zip"), package.Archive);
                    File.WriteAllBytes(Path.Combine(staging, "background.png"), package.Background);
                    File.WriteAllBytes(Path.Combine(staging, "thumbnail.png"), package.Thumbnail);
                    File.WriteAllText(Path.Combine(staging, "record.json"), WorkshopPackage.Serializer().Serialize(record), new UTF8Encoding(false));
                    Directory.Move(staging, Path.Combine(root, package.Key));
                    return record;
                }
                finally { if (Directory.Exists(staging)) Directory.Delete(staging, true); }
            }
        }

        public Dictionary<string, object> Moderate(string key, bool approved)
        {
            FileStream publicationLock;
            try { publicationLock = new FileStream(Path.Combine(root, ".publish.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) { throw new WorkshopException(409, "review_busy", "另一项操作正在保存，请稍后重试。"); }
            using (publicationLock)
            {
                var record = Read(key, true);
                record["status"] = approved ? "approved" : "rejected";
                record["reviewed_at"] = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture);
                string target = Path.Combine(PackageDirectory(key), "record.json");
                string temporary = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
                try
                {
                    File.WriteAllText(temporary, WorkshopPackage.Serializer().Serialize(record), new UTF8Encoding(false));
                    File.Replace(temporary, target, null);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return record;
            }
        }
    }
}
