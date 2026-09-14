using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Text;
using Acecode.Workshop;

internal static class WorkshopTests
{
    private static int failures;
    private static void Check(bool condition, string description)
    { Console.WriteLine((condition ? "PASS: " : "FAIL: ") + description); if (!condition) ++failures; }
    private static void Reject(Action action, int status, string description)
    {
        try { action(); Check(false, description); }
        catch (WorkshopException exception) { Check(exception.Status == status, description); }
    }
    private static byte[] Png()
    {
        using (Bitmap bitmap = new Bitmap(16, 12))
        using (Graphics graphics = Graphics.FromImage(bitmap))
        using (MemoryStream output = new MemoryStream())
        { graphics.Clear(Color.MediumPurple); bitmap.Save(output, ImageFormat.Png); return output.ToArray(); }
    }
    private static Dictionary<string, object> Definition(byte[] image)
    {
        var colors = new Dictionary<string, object>();
        foreach (string color in WorkshopPackage.ColorKeys) colors[color] = "#7641D3";
        colors["bg"] = "#171521"; colors["fg"] = "#F3EDFA";
        return new Dictionary<string, object> {
            { "schema_version", 1 }, { "id", "ai-workshop-test" }, { "name", "工坊验证主题" }, { "version", "1.0.0" }, { "mode", "dark" },
            { "colors", colors }, { "appearance", new Dictionary<string, object> { { "logo_color", "#9870E2" }, { "home_title_color", "#F3EDFA" }, { "extend_to_titlebar", true } } },
            { "background", new Dictionary<string, object> { { "bytes", image.Length }, { "sha256", WorkshopPackage.Hash(image) } } },
            { "thumbnail", new Dictionary<string, object> { { "bytes", image.Length }, { "sha256", WorkshopPackage.Hash(image) } } }
        };
    }
    private static byte[] Zip(Dictionary<string, object> definition, byte[] image, string backgroundName = "background.png", bool extra = false,
                              Dictionary<string, byte[]> backgrounds = null)
    {
        using (MemoryStream output = new MemoryStream())
        {
            using (ZipArchive archive = new ZipArchive(output, ZipArchiveMode.Create, true))
            {
                Add(archive, "theme.json", Encoding.UTF8.GetBytes(WorkshopPackage.Serializer().Serialize(definition)));
                Add(archive, backgroundName, image); Add(archive, "thumbnail.png", image);
                if (extra) Add(archive, "run.aspx", Encoding.UTF8.GetBytes("not allowed"));
                if (backgrounds != null) foreach (var entry in backgrounds) Add(archive, entry.Key, entry.Value);
            }
            return output.ToArray();
        }
    }
    private static void Add(ZipArchive archive, string name, byte[] bytes)
    { using (Stream stream = archive.CreateEntry(name).Open()) stream.Write(bytes, 0, bytes.Length); }

    public static int Main(string[] args)
    {
        string temporary = Path.Combine(Path.GetTempPath(), "acecode-workshop-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            byte[] image = Png(); var definition = Definition(image); byte[] zip = Zip(definition, image);
            WorkshopPackage package = WorkshopPackage.Parse(zip);
            Check((string)package.Definition["mode"] == "dark" && package.Key == WorkshopPackage.Hash(zip), "valid dark ZIP preserves metadata and digest");
            Check((bool)WorkshopPackage.Object(package.Definition["appearance"])["extend_to_titlebar"], "appearance parameters survive package parsing");
            var expanded = Definition(image);
            expanded["session_background"] = expanded["background"];
            expanded["user_message_background"] = expanded["background"];
            var expandedAppearance = WorkshopPackage.Object(expanded["appearance"]);
            expandedAppearance["home_composer_opacity"] = 0.7;
            expandedAppearance["session_background_opacity"] = 0;
            expandedAppearance["user_message_background_opacity"] = 1;
            expandedAppearance["home_background_color"] = "#102030";
            var backgrounds = new Dictionary<string, byte[]> { { "session-background.png", image }, { "user-message-background.png", image } };
            var expandedPackage = WorkshopPackage.Parse(Zip(expanded, image, backgrounds: backgrounds));
            var preserved = WorkshopPackage.Object(expandedPackage.Definition["appearance"]);
            Check((string)preserved["logo_color"] == "#9870E2" && (string)preserved["home_title_color"] == "#F3EDFA" && (bool)preserved["extend_to_titlebar"],
                "multi-background theme preserves original logo, title and titlebar settings");
            Reject(() => WorkshopPackage.Parse(Zip(expanded, image)), 422, "declared background cannot be missing");
            Reject(() => WorkshopPackage.Parse(Zip(definition, image, backgrounds: backgrounds)), 422, "undeclared backgrounds are rejected");
            foreach (object invalid in new object[] { -0.1, 1.1, "0.7", true, null }) {
                expandedAppearance["home_composer_opacity"] = invalid;
                Reject(() => WorkshopPackage.Parse(Zip(expanded, image, backgrounds: backgrounds)), 422, "invalid opacity is rejected");
            }
            Reject(() => WorkshopPackage.Parse(Encoding.UTF8.GetBytes("not a zip")), 422, "non-ZIP is rejected");
            Reject(() => WorkshopPackage.Parse(Zip(definition, image, "../background.png")), 422, "traversal entry is rejected");
            Reject(() => WorkshopPackage.Parse(Zip(definition, image, "theme.json")), 422, "duplicate entry is rejected");
            Reject(() => WorkshopPackage.Parse(Zip(definition, image, "background.png", true)), 422, "extra executable resource is rejected");
            definition["id"] = "eva-01";
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "built-in theme cannot be uploaded");
            definition = Definition(image); definition["mode"] = "auto";
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "invalid mode is rejected");
            definition = Definition(image); WorkshopPackage.Object(definition["colors"])["bg"] = "url(javascript:bad)";
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "CSS injection is rejected");
            definition = Definition(image); WorkshopPackage.Object(definition["colors"]).Remove("accent");
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "incomplete palette is rejected");
            definition = Definition(image); WorkshopPackage.Object(definition["appearance"])["extend_to_titlebar"] = "true";
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "appearance boolean cannot be a string");
            definition = Definition(image); WorkshopPackage.Object(definition["background"])["sha256"] = new string('a', 64);
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "asset hash mismatch is rejected");
            definition = Definition(image); WorkshopPackage.Object(definition["thumbnail"])["bytes"] = image.Length + 1;
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "asset length mismatch is rejected");
            definition = Definition(image); definition["name"] = "bad\nname";
            Reject(() => WorkshopPackage.Parse(Zip(definition, image)), 422, "control characters in names are rejected");
            byte[] invalidImage = Encoding.UTF8.GetBytes("not a png");
            Reject(() => WorkshopPackage.Parse(Zip(Definition(invalidImage), invalidImage)), 422, "non-PNG with matching hash is rejected");
            var store = new WorkshopStore(temporary); bool duplicate;
            var pending = store.Publish(package, out duplicate);
            Check(!duplicate && (string)pending["status"] == "pending", "new upload starts pending review");
            Check(store.List().Count == 0 && store.List(true).Count == 1, "pending theme is absent from public catalogue");
            Reject(() => store.Read(package.Key), 404, "pending theme metadata is private");
            Reject(() => store.Resource(package.Key, "download"), 404, "pending ZIP is private");
            Reject(() => store.Resource(package.Key, "thumbnail"), 404, "pending thumbnail is private");
            Check(File.Exists(store.Resource(package.Key, "download", true)), "administrator can inspect pending resources");
            store.Publish(package, out duplicate); Check(duplicate && store.List(true).Count == 1, "duplicate upload is idempotent");
            definition = Definition(image); definition["name"] = "conflict";
            Reject(() => store.Publish(WorkshopPackage.Parse(Zip(definition, image)), out duplicate), 409, "conflicting version preserves prior theme");
            store.Moderate(package.Key, true);
            Check(store.List().Count == 1 && (string)store.Read(package.Key)["status"] == "approved", "approval publishes the theme");
            Check(WorkshopPackage.Hash(File.ReadAllBytes(store.Resource(package.Key, "download"))) == package.Key, "download preserves exact uploaded ZIP");
            store.Moderate(package.Key, false);
            Check(store.List().Count == 0, "rejection removes public listing");
            Reject(() => store.Resource(package.Key, "background"), 404, "rejection removes access to public images");
            Reject(() => store.Read("../theme"), 404, "invalid resource key cannot escape storage");
            Check(Directory.GetDirectories(temporary).Length == 1, "no staging directory remains after publish");
            if (args.Length == 2 && args[0] == "--fixture")
            {
                Directory.CreateDirectory(args[1]); File.WriteAllBytes(Path.Combine(args[1], "theme.zip"), zip);
                File.WriteAllBytes(Path.Combine(args[1], "invalid.zip"), Encoding.UTF8.GetBytes("not a zip"));
            }
        }
        catch (Exception exception) { ++failures; Console.Error.WriteLine(exception); }
        finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, true); }
        Console.WriteLine("WORKSHOP RESULT: " + (failures == 0 ? "PASS" : "FAIL"));
        return failures == 0 ? 0 : 1;
    }
}
