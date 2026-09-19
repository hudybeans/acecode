#include "computer_use/pointer_overlay.hpp"

#include <gtest/gtest.h>

#ifdef _WIN32
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <memory>
#include <sstream>
#include <string>

namespace acecode::computer_use {
namespace {

// This fixture never activates a window or injects input. Its small temporary
// surface makes hit testing independent of the user's currently active app.
class PointerTestSurface {
public:
    PointerTestSurface() {
        previous_dpi_ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        RECT work{};
        if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0)) return;
        position_ = {work.right - 80, work.bottom - 80};
        static std::atomic<unsigned> sequence{0};
        class_name_ = L"ACECode.PointerHitTest." + std::to_wstring(GetCurrentProcessId())
            + L"." + std::to_wstring(sequence.fetch_add(1));
        WNDCLASSW klass{};
        klass.lpfnWndProc = DefWindowProcW;
        klass.hInstance = GetModuleHandleW(nullptr);
        klass.lpszClassName = class_name_.c_str();
        klass.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
        registered_class_ = RegisterClassW(&klass);
        if (!registered_class_) return;
        window_ = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
            class_name_.c_str(), L"ACECode pointer test", WS_POPUP | WS_VISIBLE,
            position_.x - 30, position_.y - 30, 80, 80, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    }
    ~PointerTestSurface() {
        if (window_) DestroyWindow(window_);
        if (registered_class_) UnregisterClassW(class_name_.c_str(), GetModuleHandleW(nullptr));
        if (previous_dpi_) SetThreadDpiAwarenessContext(previous_dpi_);
    }
    HWND window() const { return window_; }
    POINT position() const { return position_; }
private:
    HWND window_ = nullptr;
    ATOM registered_class_ = 0;
    std::wstring class_name_;
    POINT position_{};
    DPI_AWARENESS_CONTEXT previous_dpi_ = nullptr;
};

std::string describe_hit(HWND window) {
    char class_name[256]{};
    if (window) GetClassNameA(window, class_name, static_cast<int>(sizeof(class_name)));
    std::ostringstream message;
    message << "HWND=" << static_cast<void*>(window) << " class=" << class_name;
    return message.str();
}

void expect_sprite(const PointerSprite& sprite) {
    ASSERT_TRUE(sprite.visible);
    ASSERT_GT(sprite.width, 0);
    ASSERT_GT(sprite.height, 0);
    ASSERT_GE(sprite.hotspot_x, 0);
    ASSERT_GE(sprite.hotspot_y, 0);
    ASSERT_LT(sprite.hotspot_x, sprite.width);
    ASSERT_LT(sprite.hotspot_y, sprite.height);
    ASSERT_EQ(sprite.bgra.size(), static_cast<std::size_t>(sprite.width) * sprite.height * 4);
    std::size_t opaque = 0, transparent = 0;
    for (std::size_t pixel = 0; pixel < sprite.bgra.size(); pixel += 4) {
        const auto alpha = sprite.bgra[pixel + 3];
        ASSERT_LE(sprite.bgra[pixel], alpha) << "Blue channel was not premultiplied";
        ASSERT_LE(sprite.bgra[pixel + 1], alpha) << "Green channel was not premultiplied";
        ASSERT_LE(sprite.bgra[pixel + 2], alpha) << "Red channel was not premultiplied";
        opaque += alpha == 255;
        transparent += alpha == 0;
    }
    EXPECT_GT(opaque, 0U);
    EXPECT_GT(transparent, 0U);
}

TEST(ComputerUsePointerOverlay, ShowsWithoutActivationOrInterceptingHitTests) {
    const HWND foreground = GetForegroundWindow();
    PointerTestSurface surface;
    ASSERT_NE(surface.window(), nullptr);
    PointerOverlay overlay;
    ASSERT_NE(overlay.window(), nullptr);
    const auto point = surface.position();
    // WindowFromPoint intentionally ignores standard STATIC text controls.
    // Establish a hittable ordinary-window baseline before showing the arrow.
    const POINT hit_point{point.x + 4, point.y + 10};
    const HWND baseline = WindowFromPoint(hit_point);
    ASSERT_EQ(baseline, surface.window()) << "Before overlay: hit " << describe_hit(baseline)
        << "; surface " << describe_hit(surface.window()) << "; overlay " << describe_hit(overlay.window());
    overlay.show(point);
    overlay.settle();
    EXPECT_EQ(GetForegroundWindow(), foreground);
    EXPECT_TRUE(IsWindowVisible(overlay.window()));
    EXPECT_TRUE(PointerOverlay::owns_window(overlay.window()));
    EXPECT_FALSE(PointerOverlay::owns_window(surface.window()));
    EXPECT_FALSE(PointerOverlay::owns_window(nullptr));
    const auto styles = GetWindowLongPtrW(overlay.window(), GWL_EXSTYLE);
    EXPECT_EQ(styles & (WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW),
        WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW);
    DWORD_PTR result = 0;
    ASSERT_NE(SendMessageTimeoutW(overlay.window(), WM_MOUSEACTIVATE, 0, 0, SMTO_ABORTIFHUNG | SMTO_BLOCK, 1000, &result), 0);
    EXPECT_EQ(static_cast<LRESULT>(result), MA_NOACTIVATE);
    ASSERT_NE(SendMessageTimeoutW(overlay.window(), WM_NCHITTEST, 0, 0, SMTO_ABORTIFHUNG | SMTO_BLOCK, 1000, &result), 0);
    EXPECT_EQ(static_cast<LRESULT>(result), HTTRANSPARENT);
    // This point lies within the opaque arrow, rather than its transparent pad.
    const HWND actual_hit = WindowFromPoint(hit_point);
    EXPECT_EQ(actual_hit, baseline) << "After overlay: hit " << describe_hit(actual_hit)
        << "; surface " << describe_hit(surface.window()) << "; overlay " << describe_hit(overlay.window());
    expect_sprite(overlay.snapshot());
}

TEST(ComputerUsePointerOverlay, NestedSuppressionPreservesSnapshotAndRestoresExactlyOnce) {
    PointerTestSurface surface;
    ASSERT_NE(surface.window(), nullptr);
    PointerOverlay overlay;
    ASSERT_NE(overlay.window(), nullptr);
    overlay.show(surface.position());
    overlay.settle();
    const auto original = overlay.snapshot();
    overlay.suppress(true);
    overlay.suppress(true);
    EXPECT_FALSE(IsWindowVisible(overlay.window()));
    auto suppressed = overlay.snapshot();
    expect_sprite(suppressed);
    EXPECT_EQ(suppressed.position.x, original.position.x);
    EXPECT_EQ(suppressed.position.y, original.position.y);
    EXPECT_EQ(suppressed.bgra, original.bgra);
    overlay.suppress(false);
    EXPECT_FALSE(IsWindowVisible(overlay.window()));
    overlay.suppress(false);
    EXPECT_TRUE(IsWindowVisible(overlay.window()));
    overlay.suppress(false); // An extra release cannot wrap the nesting count.
    EXPECT_TRUE(IsWindowVisible(overlay.window()));
    overlay.hide();
    EXPECT_FALSE(IsWindowVisible(overlay.window()));
    EXPECT_FALSE(overlay.snapshot().visible);
}

TEST(ComputerUsePointerOverlay, SettleReachesExactTargetWhileHiddenAndKeepsScaledPremultipliedPixels) {
    PointerTestSurface surface;
    ASSERT_NE(surface.window(), nullptr);
    PointerOverlay overlay;
    ASSERT_NE(overlay.window(), nullptr);
    const auto first = surface.position();
    overlay.show(first, 96);
    overlay.settle();
    const auto normal = overlay.snapshot();
    overlay.suppress(true);
    const POINT target{first.x - 100, first.y - 80};
    overlay.show(target, 192, true);
    overlay.settle();
    EXPECT_FALSE(IsWindowVisible(overlay.window()));
    const auto settled = overlay.snapshot();
    expect_sprite(settled);
    EXPECT_EQ(settled.position.x, target.x);
    EXPECT_EQ(settled.position.y, target.y);
    EXPECT_EQ(settled.width, normal.width * 2);
    EXPECT_EQ(settled.height, normal.height * 2);
    EXPECT_EQ(settled.hotspot_x, normal.hotspot_x * 2);
    EXPECT_EQ(settled.hotspot_y, normal.hotspot_y * 2);
    overlay.hide();
    overlay.suppress(false);
    EXPECT_FALSE(IsWindowVisible(overlay.window()));
    EXPECT_FALSE(overlay.snapshot().visible);
}

TEST(ComputerUsePointerOverlay, HideAndDestructionRemoveOnlyRegisteredOwnedWindow) {
    PointerTestSurface surface;
    ASSERT_NE(surface.window(), nullptr);
    HWND previous_overlay = nullptr;
    {
        PointerOverlay overlay;
        previous_overlay = overlay.window();
        ASSERT_NE(previous_overlay, nullptr);
        overlay.show(surface.position());
        overlay.hide();
        EXPECT_FALSE(IsWindowVisible(previous_overlay));
        EXPECT_FALSE(overlay.snapshot().visible);
        overlay.show(surface.position());
        EXPECT_TRUE(IsWindowVisible(previous_overlay));
    }
    EXPECT_FALSE(IsWindow(previous_overlay));
    EXPECT_FALSE(PointerOverlay::owns_window(previous_overlay));
    EXPECT_TRUE(IsWindow(surface.window()));
}

TEST(ComputerUsePointerOverlay, ThemeStylesKeepHotspotAndRenderAceLabelWithConfiguredFill) {
    PointerTestSurface surface;
    ASSERT_NE(surface.window(), nullptr);
    PointerOverlay overlay;
    ASSERT_NE(overlay.window(), nullptr);
    overlay.show(surface.position(), 96);
    overlay.settle();
    const auto ace = overlay.snapshot();
    expect_sprite(ace);
    const auto pixel = [](const PointerSprite& sprite, int relative_x, int relative_y) {
        const auto x = sprite.hotspot_x + relative_x, y = sprite.hotspot_y + relative_y;
        const auto offset = (static_cast<std::size_t>(y) * sprite.width + x) * 4;
        return std::vector<unsigned char>(sprite.bgra.begin() + offset, sprite.bgra.begin() + offset + 4);
    };
    EXPECT_EQ(pixel(ace, 5, 10), (std::vector<unsigned char>{0xeb, 0x63, 0x25, 0xff}));
    EXPECT_EQ(pixel(ace, 25, 27), (std::vector<unsigned char>{0xff, 0xff, 0xff, 0xff}));
    overlay.configure("plain", "#FF8800");
    const auto plain = overlay.snapshot();
    expect_sprite(plain);
    EXPECT_EQ(plain.position.x, ace.position.x);
    EXPECT_EQ(plain.position.y, ace.position.y);
    EXPECT_EQ(plain.hotspot_x, ace.hotspot_x);
    EXPECT_EQ(plain.hotspot_y, ace.hotspot_y);
    EXPECT_EQ(pixel(plain, 5, 10), (std::vector<unsigned char>{0x00, 0x88, 0xff, 0xff}));
    EXPECT_EQ(pixel(plain, 22, 30), (std::vector<unsigned char>{0, 0, 0, 0}));
    overlay.configure("plain", "#ff8800");
    EXPECT_EQ(overlay.snapshot().bgra, plain.bgra);
    overlay.configure("ace", "#ff8800");
    const auto recolored = overlay.snapshot();
    expect_sprite(recolored);
    EXPECT_EQ(recolored.hotspot_x, ace.hotspot_x);
    EXPECT_EQ(recolored.hotspot_y, ace.hotspot_y);
    EXPECT_EQ(pixel(recolored, 22, 30), (std::vector<unsigned char>{0x00, 0x88, 0xff, 0xff}));
    EXPECT_EQ(pixel(recolored, 25, 27), (std::vector<unsigned char>{0xff, 0xff, 0xff, 0xff}));
}

} // namespace
} // namespace acecode::computer_use
#endif
