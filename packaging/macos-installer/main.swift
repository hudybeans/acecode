import AppKit

final class InstallerUI: NSObject, NSApplicationDelegate {
    let engine = InstallerEngine()
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 820, height: 600), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
    let scopePicker = NSSegmentedControl(labels: ["仅为我安装", "这台 Mac", "其他位置"], trackingMode: .selectOne, target: nil, action: nil)
    let locationTitle = NSTextField(labelWithString: "个人应用目录")
    var scope: InstallScope { scopePicker.selectedSegment == 1 ? .system : scopePicker.selectedSegment == 2 ? .custom : .personal }
    let heading = NSTextField(labelWithString: "安装 ACECode")
    let detail = NSTextField(wrappingLabelWithString: "选择安装位置。")
    let stepLabels = ["安装位置", "正在安装", "安装完成"].map { NSTextField(labelWithString: $0) }
    let hero = NSImageView()
    let path = NSTextField(wrappingLabelWithString: "")
    let status = NSTextField(wrappingLabelWithString: "无需管理员密码，不修改系统目录或现有用户数据。")
    let change = NSButton(title: "选择其他文件夹…", target: nil, action: nil)
    let install = NSButton(title: "安装到个人目录", target: nil, action: nil)
    let launch = NSButton(title: "启动 ACECode", target: nil, action: nil)
    let reveal = NSButton(title: "在 Finder 中显示", target: nil, action: nil)
    let spinner = NSProgressIndicator()
    var destination: URL!
    var installed: URL?
    var busy = false
    var source: URL { Bundle.main.resourceURL!.appendingPathComponent("ACECode.app") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let iconURL = Bundle.main.url(forResource: "InstallerIcon", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        let menu = NSMenu()
        let root = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "退出安装器", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        root.submenu = appMenu
        menu.addItem(root)
        NSApp.mainMenu = menu
        window.title = "安装 ACECode"
        window.isReleasedWhenClosed = false
        let version = Bundle(url: source)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知"
        heading.font = .boldSystemFont(ofSize: 25)
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = .secondaryLabelColor
        path.isSelectable = true
        path.font = .systemFont(ofSize: 12)
        path.lineBreakMode = .byTruncatingMiddle
        path.maximumNumberOfLines = 2
        status.isSelectable = true
        status.font = .systemFont(ofSize: 12)
        status.textColor = .secondaryLabelColor
        change.target = self; change.action = #selector(selectFolder)
        change.title = "更改位置…"
        change.bezelStyle = .rounded
        install.target = self; install.action = #selector(startInstall)
        install.title = "安装"
        install.bezelStyle = .rounded
        install.keyEquivalent = "\r"
        launch.target = self; launch.action = #selector(openApp)
        reveal.target = self; reveal.action = #selector(showApp)
        launch.bezelStyle = .rounded; reveal.bezelStyle = .rounded
        launch.isHidden = true; reveal.isHidden = true
        spinner.style = .bar; spinner.isIndeterminate = true; spinner.isDisplayedWhenStopped = false
        let content = window.contentView!
        let sidebar = NSVisualEffectView()
        sidebar.material = .sidebar; sidebar.blendingMode = .behindWindow; sidebar.state = .active
        let footer = NSView()
        let separator = NSBox(); separator.boxType = .separator
        let divider = NSBox(); divider.boxType = .separator
        for view in [sidebar, footer, separator, divider] {
            view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view)
        }
        hero.image = NSWorkspace.shared.icon(forFile: source.path)
        hero.imageScaling = .scaleProportionallyUpOrDown
        let brand = NSTextField(labelWithString: "ACECode")
        brand.font = .boldSystemFont(ofSize: 17)
        let badge = NSTextField(labelWithString: "版本 \(version)")
        badge.font = .systemFont(ofSize: 11); badge.textColor = .secondaryLabelColor
        let sideStack = NSStackView(views: [hero, brand, badge])
        sideStack.orientation = .vertical; sideStack.alignment = .leading; sideStack.spacing = 10
        sideStack.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(sideStack)
        let steps = NSStackView(views: stepLabels)
        steps.orientation = .vertical; steps.alignment = .leading; steps.spacing = 22
        steps.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(steps)

        let card = NSBox()
        card.boxType = .custom; card.borderWidth = 1; card.cornerRadius = 10
        card.borderColor = .separatorColor; card.fillColor = .controlBackgroundColor
        card.contentViewMargins = NSSize(width: 16, height: 16)
        let folderIcon = NSImageView(image: NSImage(systemSymbolName: "folder.fill", accessibilityDescription: "个人应用目录")!)
        folderIcon.contentTintColor = .systemBlue
        locationTitle.font = .boldSystemFont(ofSize: 13)
        let locationText = NSStackView(views: [locationTitle, path])
        locationText.orientation = .vertical; locationText.alignment = .leading; locationText.spacing = 6
        let locationRow = NSStackView(views: [folderIcon, locationText])
        locationRow.spacing = 12; locationRow.alignment = .centerY
        let cardStack = NSStackView(views: [locationRow, change])
        cardStack.orientation = .vertical; cardStack.alignment = .leading; cardStack.spacing = 12
        cardStack.translatesAutoresizingMaskIntoConstraints = false; card.contentView!.addSubview(cardStack)
        scopePicker.selectedSegment = 0
        scopePicker.target = self; scopePicker.action = #selector(changeScope)
        let stack = NSStackView(views: [heading, detail, scopePicker, card, status, spinner])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(stack)
        let actions = NSStackView(views: [reveal, launch, install])
        actions.spacing = 8; actions.translatesAutoresizingMaskIntoConstraints = false; footer.addSubview(actions)
        NSLayoutConstraint.activate([
            sidebar.leadingAnchor.constraint(equalTo: content.leadingAnchor), sidebar.topAnchor.constraint(equalTo: content.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: footer.topAnchor), sidebar.widthAnchor.constraint(equalToConstant: 196),
            footer.leadingAnchor.constraint(equalTo: content.leadingAnchor), footer.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: content.bottomAnchor), footer.heightAnchor.constraint(equalToConstant: 64),
            separator.leadingAnchor.constraint(equalTo: content.leadingAnchor), separator.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            separator.topAnchor.constraint(equalTo: footer.topAnchor),
            divider.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor), divider.topAnchor.constraint(equalTo: content.topAnchor),
            divider.bottomAnchor.constraint(equalTo: footer.topAnchor), divider.widthAnchor.constraint(equalToConstant: 1),
            sideStack.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 26), sideStack.topAnchor.constraint(equalTo: sidebar.topAnchor, constant: 32),
            hero.widthAnchor.constraint(equalToConstant: 64), hero.heightAnchor.constraint(equalToConstant: 64),
            steps.leadingAnchor.constraint(equalTo: sideStack.leadingAnchor), steps.topAnchor.constraint(equalTo: sideStack.bottomAnchor, constant: 44),
            stack.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: 36), stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -36),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 38), stack.bottomAnchor.constraint(lessThanOrEqualTo: footer.topAnchor, constant: -20),
            card.widthAnchor.constraint(equalTo: stack.widthAnchor), detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
            status.widthAnchor.constraint(equalTo: stack.widthAnchor), spinner.widthAnchor.constraint(equalTo: stack.widthAnchor),
            cardStack.leadingAnchor.constraint(equalTo: card.contentView!.leadingAnchor), cardStack.trailingAnchor.constraint(equalTo: card.contentView!.trailingAnchor),
            cardStack.topAnchor.constraint(equalTo: card.contentView!.topAnchor), cardStack.bottomAnchor.constraint(equalTo: card.contentView!.bottomAnchor),
            locationRow.widthAnchor.constraint(equalTo: cardStack.widthAnchor), folderIcon.widthAnchor.constraint(equalToConstant: 30), folderIcon.heightAnchor.constraint(equalToConstant: 30),
            actions.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -24), actions.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            install.widthAnchor.constraint(greaterThanOrEqualToConstant: 90)
        ])
        destination = engine.suggestedFolder()
        if CommandLine.arguments.contains("--preview-system") {
            scopePicker.selectedSegment = 1
            destination = URL(fileURLWithPath: "/Applications")
        }
        refreshPath()
        updateStep(0)
        engine.isRunning = { target in
            NSWorkspace.shared.runningApplications.contains { $0.bundleURL?.resolvingSymlinksInPath() == target.resolvingSymlinksInPath() }
        }
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        if let index = CommandLine.arguments.firstIndex(of: "--snapshot"), CommandLine.arguments.count > index + 1 {
            let output = CommandLine.arguments[index + 1]
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                content.layoutSubtreeIfNeeded()
                if let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) {
                    content.cacheDisplay(in: content.bounds, to: bitmap)
                    if let data = bitmap.representation(using: .png, properties: [:]) {
                        try? data.write(to: URL(fileURLWithPath: output))
                    }
                }
                NSApp.terminate(nil)
            }
        }
    }

    func updateStep(_ active: Int) {
        for (index, label) in stepLabels.enumerated() {
            let name = ["安装位置", "正在安装", "安装完成"][index]
            label.stringValue = "\(index < active ? "✓" : index == active ? "●" : "○")  \(name)"
            label.textColor = index == active ? .controlAccentColor : .secondaryLabelColor
            label.font = index == active ? .boldSystemFont(ofSize: 13) : .systemFont(ofSize: 13)
        }
    }

    func refreshPath() {
        path.stringValue = destination.appendingPathComponent("ACECode.app").path
        path.toolTip = path.stringValue
        locationTitle.stringValue = scope == .system ? "系统应用程序目录" : scope == .personal ? "个人应用目录" : "自选安装目录"
        change.isHidden = scope != .custom
        detail.stringValue = scope == .system ? "安装到 /Applications，供这台 Mac 的用户使用。" : "选择安装位置，推荐仅为自己安装。"
        if installed == nil {
            do {
                _ = try engine.checkedFolder(destination, create: false, scope: scope)
                install.isEnabled = true
                status.textColor = .secondaryLabelColor
                status.stringValue = "此位置可以安装。"
            } catch {
                install.isEnabled = false
                status.textColor = .systemOrange
                status.stringValue = error.localizedDescription
            }
        }
    }
    @objc func changeScope() {
        destination = scope == .system ? URL(fileURLWithPath: "/Applications") : engine.suggestedFolder()
        refreshPath()
    }
    @objc func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false
        panel.canCreateDirectories = true; panel.allowsMultipleSelection = false
        panel.directoryURL = destination
        panel.message = "选择当前账号可写的位置。不会请求管理员授权；不要选择应用包内部。"
        if panel.runModal() == .OK, let selected = panel.url {
            do { destination = try engine.checkedFolder(selected, create: false, scope: scope); refreshPath() }
            catch { showError(error) }
        }
    }

    @objc func startInstall() {
        guard !busy else { return }
        let target = destination.appendingPathComponent("ACECode.app")
        var replace = false
        if FileManager.default.fileExists(atPath: target.path) {
            let alert = NSAlert()
            alert.messageText = "替换已有 ACECode？"
            alert.informativeText = "仅替换 \(target.path)，不删除个人配置。请先退出该位置的 ACECode。失败时尝试恢复旧版本。"
            alert.addButton(withTitle: "替换"); alert.addButton(withTitle: "取消")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
            replace = true
        }
        busy = true; install.isEnabled = false; change.isEnabled = false
        scopePicker.isEnabled = false
        installed = nil
        updateStep(1)
        heading.stringValue = "正在安装 ACECode"
        detail.stringValue = "正在复制应用，请稍候。"
        install.title = "正在安装…"
        window.standardWindowButton(.closeButton)?.isEnabled = false
        launch.isHidden = true; reveal.isHidden = true
        spinner.startAnimation(nil)
        let folder = destination!, payload = source, confirmed = replace, selectedScope = scope
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try self.engine.install(source: payload, folder: folder, replace: confirmed, scope: selectedScope) { text in
                DispatchQueue.main.async { self.status.stringValue = text }
            } }
            DispatchQueue.main.async {
                self.busy = false; self.install.isEnabled = true; self.change.isEnabled = true
                self.window.standardWindowButton(.closeButton)?.isEnabled = true
                self.spinner.stopAnimation(nil)
                switch result {
                case .success(let url):
                    self.installed = url
                    self.updateStep(2)
                    self.heading.stringValue = "ACECode 已准备就绪"
                    self.detail.stringValue = "安装完成，可以开始使用了。"
                    self.status.stringValue = self.engine.cleanupWarning ?? ""
                    self.install.isHidden = true; self.change.isHidden = true
                    self.launch.keyEquivalent = "\r"
                    self.launch.isHidden = false; self.reveal.isHidden = false
                case .failure(let error):
                    self.scopePicker.isEnabled = true
                    self.updateStep(0)
                    self.heading.stringValue = "安装未完成"
                    self.detail.stringValue = "请检查或更换安装位置后重试。"
                    self.install.title = "重试安装"
                    self.status.stringValue = "安装未完成。"
                    self.showError(error)
                }
            }
        }
    }

    func showError(_ error: Error) {
        let alert = NSAlert(error: error)
        alert.runModal()
    }
    @objc func showApp() { if let url = installed { NSWorkspace.shared.activateFileViewerSelecting([url]) } }
    @objc func openApp() {
        guard let url = installed else { return }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, error in
            if let error = error { DispatchQueue.main.async { self.showError(error) } }
        }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { busy ? .terminateCancel : .terminateNow }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let delegate = InstallerUI()
NSApplication.shared.delegate = delegate
NSApplication.shared.run()
