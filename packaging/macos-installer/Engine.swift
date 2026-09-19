import Foundation
import Darwin

struct InstallError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

func runTool(_ path: String, _ arguments: [String]) throws -> String {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: path)
    task.arguments = arguments
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = pipe
    try task.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    let output = String(data: data, encoding: .utf8) ?? ""
    guard task.terminationStatus == 0 else {
        throw InstallError(message: "\(URL(fileURLWithPath: path).lastPathComponent) 失败：\n\(output)")
    }
    return output
}

enum InstallScope { case personal, system, custom }

final class InstallerEngine {
    let fm = FileManager.default
    let home: URL
    let validateSignature: (URL) throws -> Void
    // Injected faults are used only by the standalone test executable.
    var fault: ((String) throws -> Void)?
    var isRunning: (URL) -> Bool = { _ in false }
    private(set) var cleanupWarning: String?

    init(home: URL = FileManager.default.homeDirectoryForCurrentUser,
         validateSignature: @escaping (URL) throws -> Void = InstallerEngine.trustedSignature) {
        self.home = home.resolvingSymlinksInPath().standardizedFileURL
        self.validateSignature = validateSignature
    }

    static func trustedSignature(_ app: URL) throws {
        _ = try runTool("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path])
        let details = try runTool("/usr/bin/codesign", ["-dv", "--verbose=4", app.path])
        guard details.contains("TeamIdentifier=T52GZCH73Y"),
              details.contains("Authority=Developer ID Application:") else {
            throw InstallError(message: "应用不是预期发行团队的 Developer ID 签名版本。")
        }
        _ = try runTool("/usr/sbin/spctl", ["--assess", "--type", "execute", app.path])
    }

    func bundleCheck(_ app: URL) throws {
        let info = app.appendingPathComponent("Contents/Info.plist")
        guard let data = try? Data(contentsOf: info),
              let dict = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              dict["CFBundleIdentifier"] as? String == "dev.acecode.desktop",
              let executable = dict["CFBundleExecutable"] as? String,
              !executable.isEmpty, !executable.contains("/"), executable != "..",
              fm.isExecutableFile(atPath: app.appendingPathComponent("Contents/MacOS/" + executable).path) else {
            throw InstallError(message: "不是完整的 ACECode 应用：\(app.path)")
        }
    }

    func checkedFolder(_ input: URL, create: Bool, scope: InstallScope = .personal) throws -> URL {
        let folder = input.resolvingSymlinksInPath().standardizedFileURL
        if scope == .personal && !folder.path.hasPrefix(home.path + "/") {
            throw InstallError(message: "个人安装请选择主目录内的文件夹；系统目录请使用“这台 Mac”选项。")
        }
        if scope == .system && folder != URL(fileURLWithPath: "/Applications").resolvingSymlinksInPath() {
            throw InstallError(message: "系统安装仅支持 /Applications。")
        }
        guard !folder.pathComponents.contains(where: { $0.lowercased().hasSuffix(".app") }) else {
            throw InstallError(message: "不能安装到另一个应用包内部。")
        }
        var ancestor = folder
        while !fm.fileExists(atPath: ancestor.path) { ancestor.deleteLastPathComponent() }
        let attrs = try fm.attributesOfItem(atPath: ancestor.path)
        guard attrs[.type] as? FileAttributeType == .typeDirectory,
              fm.isWritableFile(atPath: ancestor.path),
              fm.isExecutableFile(atPath: ancestor.path) else {
            throw InstallError(message: "当前用户没有此目录的写入或访问权限：\(ancestor.path)\n本安装器不会请求提权。请选择“仅为我安装”，或更换可写位置。")
        }
        if create { try fm.createDirectory(at: folder, withIntermediateDirectories: true) }
        return folder
    }

    func suggestedFolder() -> URL {
        let first = home.appendingPathComponent("Applications")
        return (try? checkedFolder(first, create: false)) != nil ? first : home.appendingPathComponent("Apps")
    }

    func install(source: URL, folder: URL, replace: Bool, scope: InstallScope = .personal,
                 progress: (String) -> Void = { _ in }) throws -> URL {
        cleanupWarning = nil
        progress("正在验证应用签名与系统信任…")
        try bundleCheck(source)
        try validateSignature(source)
        let directory = try checkedFolder(folder, create: true, scope: scope)
        let target = directory.appendingPathComponent("ACECode.app")
        guard source.resolvingSymlinksInPath().path != target.resolvingSymlinksInPath().path,
              !directory.path.hasPrefix(source.resolvingSymlinksInPath().path + "/") else {
            throw InstallError(message: "源应用与目标不能相同，也不能安装到源应用内部。")
        }
        // Share the lock and its safety contract with src/upgrade/macos_app_installer.mm.
        let lock = directory.appendingPathComponent(".ACECode.update.lock")
        let fd = open(lock.path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, mode_t(0o600))
        guard fd >= 0 else { throw InstallError(message: "无法创建安装锁，请检查目录权限。") }
        defer { close(fd) }
        var lockInfo = stat()
        guard fstat(fd, &lockInfo) == 0,
              (lockInfo.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
              lockInfo.st_uid == geteuid(), lockInfo.st_nlink == 1 else {
            throw InstallError(message: "安装锁必须是当前用户拥有的普通文件，且不能包含多个硬链接。")
        }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw InstallError(message: "另一个安装或更新程序正在使用此目录。") }
        defer { flock(fd, LOCK_UN) }
        // Keep the lock inode: unlinking it allows two processes to lock different inodes.
        let original = try targetState(target)
        if original != nil && !replace { throw InstallError(message: "目标已有 ACECode，请确认替换后再安装。") }
        if original != nil { try bundleCheck(target) }
        if original != nil && !fm.isDeletableFile(atPath: target.path) {
            throw InstallError(message: "当前用户不能替换已有应用：\(target.path)\n请改用个人目录安装。")
        }
        guard !isRunning(target) else { throw InstallError(message: "目标 ACECode 正在运行，请退出后重试。") }
        let work = directory.appendingPathComponent(".acecode-stage-" + UUID().uuidString)
        try fm.createDirectory(at: work, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let staged = work.appendingPathComponent("ACECode.app")
        let backup = work.appendingPathComponent("previous.app")
        var preserve = false
        defer { if !preserve { try? fm.removeItem(at: work) } }
        progress("正在复制应用到临时目录…")
        try fault?("copy")
        _ = try runTool("/usr/bin/ditto", [source.path, staged.path])
        try bundleCheck(staged)
        try validateSignature(staged)
        guard try targetState(target) == original, !isRunning(target) else {
            throw InstallError(message: "目标应用在安装期间发生变化或已启动，请重试。")
        }
        progress("正在提交安装…")
        if original != nil { try fm.moveItem(at: target, to: backup) }
        do {
            try fault?("commit")
            try fm.moveItem(at: staged, to: target)
        } catch {
            let commitError = error
            if original != nil {
                do {
                    try fault?("rollback")
                    try fm.moveItem(at: backup, to: target)
                } catch {
                    preserve = true
                    throw InstallError(message: "安装失败且自动恢复失败。旧版本安全保留在：\(backup.path)\n安装错误：\(commitError.localizedDescription)\n恢复错误：\(error.localizedDescription)")
                }
            }
            throw InstallError(message: "安装未完成，原有版本未改变或已恢复。\n\(commitError.localizedDescription)")
        }
        // A shared installation may contain old files this user cannot delete.
        // Never silently remove a backup when cleanup fails.
        do { try fm.removeItem(at: work) }
        catch {
            preserve = true
            cleanupWarning = "安装成功；旧文件未能清理，保留于：\(work.path)"
        }
        return target
    }

    func targetState(_ target: URL) throws -> String? {
        do {
            let attrs = try fm.attributesOfItem(atPath: target.path)
            guard attrs[.type] as? FileAttributeType == .typeDirectory else {
                throw InstallError(message: "目标不是普通应用目录，拒绝覆盖链接或其他文件。")
            }
            return "\(attrs[.systemFileNumber]!)|\(attrs[.modificationDate]!)"
        } catch let error as NSError where error.domain == NSCocoaErrorDomain &&
            (error.code == NSFileNoSuchFileError || error.code == NSFileReadNoSuchFileError) {
            return nil
        }
    }
}
