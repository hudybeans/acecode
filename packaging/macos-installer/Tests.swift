import Foundation
import Darwin

@main struct Tests {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("acecode-installer-test-" + UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let engine = InstallerEngine(home: root, validateSignature: { _ in })
        var count = 0
        func check(_ name: String, _ body: () throws -> Void) throws {
            try body(); count += 1; print("PASS \(name)")
        }
        func rejected(_ body: () throws -> Void) throws {
            do { try body() } catch { return }
            throw InstallError(message: "Expected failure")
        }
        func fixture(_ name: String) throws -> URL {
            let app = root.appendingPathComponent(name + "/ACECode.app")
            let mac = app.appendingPathComponent("Contents/MacOS")
            try fm.createDirectory(at: mac, withIntermediateDirectories: true)
            let info: [String: String] = ["CFBundleIdentifier": "dev.acecode.desktop", "CFBundleExecutable": "ACECode"]
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: app.appendingPathComponent("Contents/Info.plist"))
            try Data("#!/bin/sh\nexit 0\n".utf8).write(to: mac.appendingPathComponent("ACECode"))
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: mac.appendingPathComponent("ACECode").path)
            return app
        }
        let source = try fixture("source")
        let folder = root.appendingPathComponent("个人 Apps")
        let target = folder.appendingPathComponent("ACECode.app")
        try check("new install / Chinese and spaces") { _ = try engine.install(source: source, folder: folder, replace: false) }
        let marker = target.appendingPathComponent("old-marker")
        try Data("old".utf8).write(to: marker)
        try check("replacement needs confirmation") { try rejected { _ = try engine.install(source: source, folder: folder, replace: false) } }
        try check("copy failure preserves original") {
            engine.fault = { if $0 == "copy" { throw InstallError(message: "injected") } }
            try rejected { _ = try engine.install(source: source, folder: folder, replace: true) }
            assert(fm.fileExists(atPath: marker.path)); engine.fault = nil
        }
        try check("commit failure rolls back") {
            engine.fault = { if $0 == "commit" { throw InstallError(message: "injected") } }
            try rejected { _ = try engine.install(source: source, folder: folder, replace: true) }
            assert(fm.fileExists(atPath: marker.path)); engine.fault = nil
        }
        try check("running app rejected") {
            engine.isRunning = { _ in true }
            try rejected { _ = try engine.install(source: source, folder: folder, replace: true) }
            engine.isRunning = { _ in false }
        }
        try check("concurrent updater lock rejected without changing the app") {
            let fd = open(folder.appendingPathComponent(".ACECode.update.lock").path, O_RDWR)
            assert(fd >= 0); assert(flock(fd, LOCK_EX | LOCK_NB) == 0)
            defer { close(fd) }
            try rejected { _ = try engine.install(source: source, folder: folder, replace: true) }
            assert(fm.fileExists(atPath: marker.path))
        }
        for kind in ["fifo", "directory", "symlink", "hardlink"] {
            try check("unsafe \(kind) lock rejected before copying") {
                let destination = root.appendingPathComponent("lock-" + kind)
                try fm.createDirectory(at: destination, withIntermediateDirectories: false)
                let lock = destination.appendingPathComponent(".ACECode.update.lock")
                let sentinel = destination.appendingPathComponent("sentinel")
                try Data("unchanged".utf8).write(to: sentinel)
                switch kind {
                case "fifo": assert(mkfifo(lock.path, mode_t(0o600)) == 0)
                case "directory": try fm.createDirectory(at: lock, withIntermediateDirectories: false)
                case "symlink": try fm.createSymbolicLink(at: lock, withDestinationURL: sentinel)
                default: try fm.linkItem(at: sentinel, to: lock)
                }
                var copied = false
                engine.fault = { if $0 == "copy" { copied = true } }
                defer { engine.fault = nil }
                try rejected { _ = try engine.install(source: source, folder: destination, replace: false) }
                assert(!copied)
                let sentinelContents = try String(contentsOf: sentinel, encoding: .utf8)
                assert(sentinelContents == "unchanged")
                assert(!fm.fileExists(atPath: destination.appendingPathComponent("ACECode.app").path))
            }
        }
        try check("successful replacement") {
            _ = try engine.install(source: source, folder: folder, replace: true)
            assert(!fm.fileExists(atPath: marker.path))
        }
        try check("unwritable directory and fallback") {
            let apps = root.appendingPathComponent("Applications")
            try fm.createDirectory(at: apps, withIntermediateDirectories: false)
            try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: apps.path)
            defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: apps.path) }
            assert(engine.suggestedFolder().lastPathComponent == "Apps")
            try rejected { _ = try engine.checkedFolder(apps, create: true) }
        }
        try check("outside home and symlink escape") {
            try rejected { _ = try engine.checkedFolder(URL(fileURLWithPath: "/Applications"), create: false) }
            let link = root.appendingPathComponent("escape")
            try fm.createSymbolicLink(at: link, withDestinationURL: URL(fileURLWithPath: "/tmp"))
            try rejected { _ = try engine.checkedFolder(link, create: false) }
        }
        try check("system directory uses actual access, not owner identity (read only)") {
            let system = URL(fileURLWithPath: "/Applications")
            if fm.isWritableFile(atPath: system.path) && fm.isExecutableFile(atPath: system.path) {
                let checked = try engine.checkedFolder(system, create: false, scope: .system)
                assert(checked == system.resolvingSymlinksInPath())
            } else {
                try rejected { _ = try engine.checkedFolder(system, create: false, scope: .system) }
            }
            try rejected { _ = try engine.checkedFolder(folder, create: false, scope: .system) }
        }
        try check("custom install outside configured home") {
            let limited = InstallerEngine(home: root.appendingPathComponent("fake-home"), validateSignature: { _ in })
            let custom = root.appendingPathComponent("shared-location")
            try rejected { _ = try limited.checkedFolder(custom, create: false) }
            _ = try limited.install(source: source, folder: custom, replace: false, scope: .custom)
            assert(fm.fileExists(atPath: custom.appendingPathComponent("ACECode.app").path))
        }
        try check("custom unwritable directory and app nesting rejected") {
            let denied = root.appendingPathComponent("denied")
            try fm.createDirectory(at: denied, withIntermediateDirectories: false)
            try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: denied.path)
            defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: denied.path) }
            try rejected { _ = try engine.checkedFolder(denied, create: true, scope: .custom) }
            try rejected { _ = try engine.checkedFolder(source.appendingPathComponent("nested"), create: false, scope: .custom) }
        }
        try check("unrelated app and missing source") {
            let other = root.appendingPathComponent("other/ACECode.app")
            try fm.createDirectory(at: other, withIntermediateDirectories: true)
            try rejected { _ = try engine.install(source: source, folder: other.deletingLastPathComponent(), replace: true) }
            try rejected { _ = try engine.install(source: root.appendingPathComponent("missing"), folder: folder, replace: true) }
        }
        try check("invalid signature") {
            let strict = InstallerEngine(home: root)
            try rejected { _ = try strict.install(source: source, folder: folder, replace: true) }
        }
        try check("rollback failure preserves backup") {
            engine.fault = { if $0 == "commit" || $0 == "rollback" { throw InstallError(message: "injected") } }
            try rejected { _ = try engine.install(source: source, folder: folder, replace: true) }
            let dirs = try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            assert(dirs.contains { fm.fileExists(atPath: $0.appendingPathComponent("previous.app").path) })
            engine.fault = nil
        }
        if CommandLine.arguments.count > 1 {
            try check("real Developer ID payload install and signature verification") {
                let strict = InstallerEngine(home: root)
                let result = try strict.install(source: URL(fileURLWithPath: CommandLine.arguments[1]), folder: root.appendingPathComponent("real"), replace: false)
                try InstallerEngine.trustedSignature(result)
            }
        }
        print("\(count) tests passed; temporary test directories removed on exit")
    }
}
