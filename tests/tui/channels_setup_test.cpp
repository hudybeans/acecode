#include "tui/channels_setup.hpp"
#include "tui/theme_palette.hpp"
#include <ftxui/component/event.hpp>
#include <ftxui/component/loop.hpp>
#include <ftxui/dom/elements.hpp>
#include <ftxui/screen/screen.hpp>
#include <gtest/gtest.h>
#include <chrono>
#include <iostream>
#include <sstream>
#include <thread>

namespace acecode::tui {
namespace {
class TerminalOutputCapture {
public:
    TerminalOutputCapture() : previous_(std::cout.rdbuf(output_.rdbuf())) {}
    ~TerminalOutputCapture() { std::cout.rdbuf(previous_); }
    std::string text() const { return output_.str(); }
private:
    std::ostringstream output_;
    std::streambuf* previous_;
};

class ChannelSetupViewTest : public testing::Test {
protected:
    std::atomic<bool> connected{false}, fail_install{false}, block_install{false};
    std::atomic<int> begins{0}, finishes{0}, cancels{0};
    int closed = 0;
    std::string qr;
    ftxui::Dimensions terminal{80, 40};
    std::unique_ptr<ChannelsSetup> wizard;
    void SetUp() override {
        init_theme_palette("dark");
        for (int i = 0; i < 20; ++i) {
            for (int j = 0; j < 62; ++j) qr += (j % 2 ? u8"\u2584" : u8"\u2588");
            qr += '\n';
        }
    }
    void create(bool english = true, bool standalone = false) {
        ChannelsSetupDependencies deps;
        deps.english = english;
        if (standalone) deps.terminal_dimensions = [&] { return terminal; };
        deps.request_close = [&] { ++closed; };
        deps.setup.begin = [&] { ++begins; };
        deps.setup.connect = [] {};
        deps.setup.save = [&](const std::string&, const std::vector<std::string>&) { ++finishes; };
        deps.setup.close = [&] { ++cancels; };
        deps.setup.status = [&]() -> channels::Json {
            return {{"state", connected ? "connected" : "pairing"},
                    {"account", "12025550123@s.whatsapp.net"}, {"qr_text", qr}};
        };
        deps.setup.prepare = [&](const std::atomic<bool>& cancel, const channels::SetupProgress& progress) {
            progress({channels::SetupPhase::Installing});
            while (block_install && !cancel) std::this_thread::sleep_for(std::chrono::milliseconds(5));
            if (fail_install) throw std::runtime_error("Node.js 22+ was not found. Install Node.js, then retry.");
        };
        deps.setup.wait = [] { std::this_thread::sleep_for(std::chrono::milliseconds(5)); };
        wizard = std::make_unique<ChannelsSetup>(std::move(deps));
        wizard->open();
        wizard->component()->TakeFocus();
    }
    ftxui::Screen screen(int width = 80, int height = 40) {
        ftxui::Screen output(width, height);
        // The first layout updates the available QR viewport, the next paints it.
        ftxui::Render(output, wizard->component()->Render());
        ftxui::Render(output, wizard->component()->Render());
        return output;
    }
    std::string render(int width = 80, int height = 40) { return screen(width, height).ToString(); }
    void key(ftxui::Event event) { wizard->component()->OnEvent(event); }
    void next() { key(ftxui::Event::Tab); key(ftxui::Event::Return); }
    bool await_text(const std::string& text) {
        for (int i = 0; i < 200; ++i) {
            key(ftxui::Event::Custom);
            if (render().find(text) != std::string::npos) return true;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        return false;
    }
    void start() {
        next();
        EXPECT_NE(render().find("3. Review configuration"), std::string::npos) << render();
        key(ftxui::Event::Return);
    }
};
TEST_F(ChannelSetupViewTest, DefaultsToPersonalSelfChatAndSupportsBackWithoutSideEffects) {
    create();
    for (const auto& dimensions : {std::pair<int, int>{80, 24}, {128, 45}}) {
        const auto output = render(dimensions.first, dimensions.second);
        EXPECT_NE(output.find("WhatsApp Setup"), std::string::npos);
        EXPECT_NE(output.find("Just myself (recommended)"), std::string::npos);
        EXPECT_NE(output.find("Continue"), std::string::npos);
        EXPECT_NE(output.find("Cancel"), std::string::npos);
    }
    next();
    EXPECT_NE(render().find("Access: yourself"), std::string::npos);
    next(); // Back is the next button after Save configuration.
    EXPECT_NE(render().find("1. Choose how to use WhatsApp"), std::string::npos) << render();
    key(ftxui::Event::Escape);
    EXPECT_EQ(closed, 1);
    EXPECT_EQ(begins, 0);
}
TEST_F(ChannelSetupViewTest, ValidatesContactNumbersOnTheContactStep) {
    create();
    key(ftxui::Event::ArrowDown);
    next();
    EXPECT_NE(render().find("2. Which contacts are allowed?"), std::string::npos) << render();
    key(ftxui::Event::Character("not-a-number"));
    next();
    EXPECT_NE(render().find("Invalid phone numbers"), std::string::npos) << render();
    EXPECT_EQ(begins, 0);
}
TEST_F(ChannelSetupViewTest, ShowsQrWithoutWrappingAndKeepsScanContrastInLightTheme) {
    create(); start();
    ASSERT_TRUE(await_text("4. Scan to link")) << render();
    for (const auto* palette : {"dark", "light"}) {
        swap_theme_palette(palette);
        auto output = screen();
        EXPECT_NE(output.ToString().find("Linked devices"), std::string::npos);
        int qr_cells = 0;
        for (int y = 0; y < output.dimy(); ++y) for (int x = 0; x < output.dimx(); ++x) {
            const auto& pixel = output.PixelAt(x, y);
            if (pixel.character == u8"\u2588" && pixel.foreground_color == ftxui::Color::White &&
                pixel.background_color == ftxui::Color::Black) ++qr_cells;
        }
        EXPECT_GT(qr_cells, 600);
        EXPECT_NE(render(80, 24).find("Enlarge the terminal"), std::string::npos);
        EXPECT_EQ(render(80, 24).find(u8"\u2584"), std::string::npos);
    }
    connected = true;
    ASSERT_TRUE(await_text("5. Setup complete")) << render();
    EXPECT_EQ(finishes, 1);
    EXPECT_NE(render().find("Account and access saved."), std::string::npos);
    EXPECT_EQ(render().find("daemon"), std::string::npos);
    EXPECT_EQ(render().find("Desktop"), std::string::npos);
    EXPECT_EQ(render().find("Temporary connection"), std::string::npos);
    EXPECT_EQ(render().find("Connected, access saved, and enabled"), std::string::npos);
    EXPECT_EQ(render().find(u8"\u2584"), std::string::npos);
    key(ftxui::Event::Return);
    EXPECT_EQ(closed, 1);
}
TEST_F(ChannelSetupViewTest, DependencyFailureOffersRetryAndCompletesWithoutManualCommands) {
    fail_install = true;
    create(); start();
    ASSERT_TRUE(await_text("Setup not completed")) << render();
    EXPECT_NE(render().find("Download Node.js"), std::string::npos);
    EXPECT_NE(render().find("Retry"), std::string::npos);
    EXPECT_EQ(cancels, 1);
    EXPECT_EQ(finishes, 0);
    fail_install = false; connected = true;
    key(ftxui::Event::Return);
    ASSERT_TRUE(await_text("5. Setup complete")) << render();
    EXPECT_EQ(begins, 2);
    EXPECT_EQ(finishes, 1);
}
TEST_F(ChannelSetupViewTest, CanCancelWhileDependenciesInstallWithoutBlockingUi) {
    block_install = true;
    create(); start();
    ASSERT_TRUE(await_text("Installing bridge dependencies"));
    const auto before = std::chrono::steady_clock::now();
    key(ftxui::Event::Escape);
    EXPECT_LT(std::chrono::steady_clock::now() - before, std::chrono::milliseconds(100));
    for (int i = 0; i < 200 && !closed; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
        key(ftxui::Event::Custom);
    }
    EXPECT_EQ(closed, 1);
    EXPECT_EQ(cancels, 1);
    EXPECT_EQ(finishes, 0);
}
TEST_F(ChannelSetupViewTest, UsesChineseLabelsAndFitsStandardTerminal) {
    create(false);
    const auto first = render(80, 24);
    EXPECT_NE(first.find(u8"WhatsApp 配置"), std::string::npos);
    EXPECT_NE(first.find(u8"仅自己使用（推荐）"), std::string::npos);
    next();
    EXPECT_NE(render(80, 24).find(u8"保存配置"), std::string::npos);
    EXPECT_NE(render(80, 24).find(u8"取消"), std::string::npos);
}
TEST_F(ChannelSetupViewTest, StandaloneStepsUseTheirContentHeightInsteadOfFillingTheTerminal) {
    create(true, true);
    auto document = wizard->component()->Render();
    document->ComputeRequirement();
    const int initial_height = document->requirement().min_y;
    EXPECT_GT(initial_height, 6);
    EXPECT_LT(initial_height, 20);
    next();
    document = wizard->component()->Render();
    document->ComputeRequirement();
    const int review_height = document->requirement().min_y;
    EXPECT_GT(review_height, initial_height);
    EXPECT_LT(review_height, terminal.dimy);
    ftxui::Screen output(terminal.dimx, review_height);
    ftxui::Render(output, document);
    EXPECT_NE(output.ToString().find("account restrictions"), std::string::npos);
    EXPECT_NE(output.ToString().find("Save configuration"), std::string::npos);
}
TEST_F(ChannelSetupViewTest, StandaloneQrCanGrowBeyondThePreviousStep) {
    create(true, true); start();
    ASSERT_TRUE(await_text("4. Scan to link"));
    auto document = wizard->component()->Render();
    document->ComputeRequirement();
    EXPECT_GT(document->requirement().min_y, 25);
    EXPECT_NE(render().find(u8"\u2584"), std::string::npos);
    terminal.dimy = 24;
    EXPECT_NE(render().find("Enlarge the terminal"), std::string::npos);
    terminal.dimy = 40;
    EXPECT_NE(render().find(u8"\u2584"), std::string::npos);
}
TEST_F(ChannelSetupViewTest, StandaloneTerminalDoesNotEnterAlternateScreenOrEraseEarlierOutput) {
    create(true, true);
    std::string captured;
    int initial_height = 0;
    {
        TerminalOutputCapture capture;
        std::cout << "earlier shell output\nPS> acecode channels\n";
        auto app = make_channels_setup_terminal();
        app.TrackMouse(false);
        {
            ftxui::Loop loop(&app, wizard->component());
            loop.RunOnce();
            initial_height = app.dimy();
            key(ftxui::Event::Return);
            app.PostEvent(ftxui::Event::Custom);
            loop.RunOnce();
        }
        std::cout << "PS> next command\n";
        captured = capture.text();
    }
    EXPECT_GT(initial_height, 0);
    EXPECT_LT(initial_height, 20);
    EXPECT_NE(captured.find("earlier shell output"), std::string::npos);
    EXPECT_NE(captured.find("WhatsApp Setup"), std::string::npos);
    EXPECT_NE(captured.find("PS> next command"), std::string::npos);
    for (const auto* sequence : {"\x1b[?1049h", "\x1b[2J", "\x1b[3J", "\x1b[H", "\x1b[1;1H"})
        EXPECT_EQ(captured.find(sequence), std::string::npos);
}
} // namespace
} // namespace acecode::tui
