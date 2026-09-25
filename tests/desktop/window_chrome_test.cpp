// 覆盖 src/desktop/window_chrome.cpp。无标题栏窗口依赖这些纯逻辑把
// Win32 命中测试映射到 resize / caption / client,避免去掉原生标题栏后
// 用户无法拖动或调整大小。
//
// 后半部分覆盖 Win10 顶边 1px 边框线的自绘逻辑。背景:Win10 的窗口边框由系统画在
// 四周缩放边上,无标题栏窗口顶边没有缩放边,系统就不画顶上那根线(用户反馈截图:
// 左/右/下都有细线,唯独顶边没有)。宿主窗口在 Win10 上把 WebView 下移、自己补画,
// 这里的纯函数决定「哪些系统要补 / 补多粗 / 什么颜色」:
//   1. 只有 Win10 build 区间需要补,Win11 与未知版本不补;
//   2. 粗细按系统 DPI 向下取整;
//   3. 最大化 / 最小化 / 无缩放边框时不让位;
//   4. 颜色与系统画的左/右/下边框一致(激活灰 / 失焦灰 / 主题色 / 1809 前白色)。

#include <gtest/gtest.h>

#include "desktop/window_chrome.hpp"

using acecode::desktop::FramelessHitTestArea;
using acecode::desktop::FramelessHitTestInput;
using acecode::desktop::RgbColor;
using acecode::desktop::SelfDrawnTopBorderColorInput;
using acecode::desktop::SelfDrawnTopBorderLayoutInput;
using acecode::desktop::classify_frameless_hit_test;
using acecode::desktop::frameless_resize_border;
using acecode::desktop::parse_resize_direction;
using acecode::desktop::self_drawn_top_border_color;
using acecode::desktop::self_drawn_top_border_inset;
using acecode::desktop::self_drawn_top_border_thickness;
using acecode::desktop::windows_needs_self_drawn_top_border;

namespace {

FramelessHitTestInput base_input() {
    FramelessHitTestInput in;
    in.width = 1280;
    in.height = 820;
    in.frame_x = 8;
    in.frame_y = 8;
    in.padding = 4;
    in.drag_height = 44;
    return in;
}

// Win10 22H2(build 19045)上一个普通的、非最大化的有缩放边框窗口,100% 缩放。
SelfDrawnTopBorderLayoutInput restored_win10_layout() {
    SelfDrawnTopBorderLayoutInput in;
    in.supported = true;
    in.has_resize_frame = true;
    in.system_dpi = 96;
    return in;
}

// 前端浅色主题的 --ace-bg,也是 Desktop 启动时的默认打底色。
constexpr RgbColor kLightAppBackground{0xF5, 0xF5, 0xF2};
constexpr RgbColor kWhite{0xFF, 0xFF, 0xFF};

SelfDrawnTopBorderColorInput win10_color_input(bool active, RgbColor background) {
    SelfDrawnTopBorderColorInput in;
    in.active = active;
    in.windows_build = 19045;
    in.background = background;
    return in;
}

} // namespace

// 场景: resize 边框宽度至少为 1,避免 DPI/测试输入异常时完全失去 resize 区。
TEST(DesktopWindowChrome, ResizeBorderHasMinimum) {
    EXPECT_EQ(frameless_resize_border(0, 0), 1);
    EXPECT_EQ(frameless_resize_border(8, 4), 12);
}

// 场景: 非最大化窗口四角必须优先命中 resize,不能被顶栏拖拽区吞掉。
TEST(DesktopWindowChrome, CornersPreferResizeOverCaption) {
    auto in = base_input();
    in.x = 2;
    in.y = 2;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::TopLeft);

    in.x = 1278;
    in.y = 2;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::TopRight);

    in.x = 2;
    in.y = 818;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::BottomLeft);

    in.x = 1278;
    in.y = 818;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::BottomRight);
}

// 场景: 顶部 resize 带下面的空白顶栏区域用于拖动窗口。
TEST(DesktopWindowChrome, TopBarAreaActsAsCaption) {
    auto in = base_input();
    in.x = 240;
    in.y = 24;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::Caption);
}

// 场景: 顶栏以下的区域仍然是普通 client,让 WebView 正常接收点击。
TEST(DesktopWindowChrome, ContentAreaIsClient) {
    auto in = base_input();
    in.x = 240;
    in.y = 80;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::Client);
}

// 场景: 最大化时不返回 resize 区,避免屏幕边缘出现错误拖拽/缩放行为。
TEST(DesktopWindowChrome, MaximizedWindowSuppressesResizeEdges) {
    auto in = base_input();
    in.maximized = true;
    in.x = 2;
    in.y = 2;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::Caption);

    in.y = 818;
    EXPECT_EQ(classify_frameless_hit_test(in), FramelessHitTestArea::Client);
}

// 场景: 前端 strip 在 mousedown 时通过 aceDesktop_startWindowResize 把方向
// 字符串送进 native;parse_resize_direction 是这条桥的"必经哨兵",所有合法
// 边/角必须能正确翻译,无效值必须返回 nullopt 而不是 fallback。
TEST(DesktopWindowChrome, ParseResizeDirectionAcceptsAllEightEdgesAndCorners) {
    EXPECT_EQ(parse_resize_direction("top"),          FramelessHitTestArea::Top);
    EXPECT_EQ(parse_resize_direction("bottom"),       FramelessHitTestArea::Bottom);
    EXPECT_EQ(parse_resize_direction("left"),         FramelessHitTestArea::Left);
    EXPECT_EQ(parse_resize_direction("right"),        FramelessHitTestArea::Right);
    EXPECT_EQ(parse_resize_direction("top-left"),     FramelessHitTestArea::TopLeft);
    EXPECT_EQ(parse_resize_direction("top-right"),    FramelessHitTestArea::TopRight);
    EXPECT_EQ(parse_resize_direction("bottom-left"),  FramelessHitTestArea::BottomLeft);
    EXPECT_EQ(parse_resize_direction("bottom-right"), FramelessHitTestArea::BottomRight);
}

// 场景: caller 打错字 / 大小写不一致 / 空串 / 注入"client"或"caption"试图
// 让 native 当成拖动 — 都必须返回 nullopt,WebHost::start_window_resize 才能
// 安全地拒绝调用。回归点:不要为了"宽松"加大小写归一化或下划线/空格容忍,
// 否则前端拼错字会被 native 静默接受、产生难以排查的怪异 resize。
TEST(DesktopWindowChrome, ParseResizeDirectionRejectsInvalidStrings) {
    EXPECT_FALSE(parse_resize_direction(""));
    EXPECT_FALSE(parse_resize_direction("Top"));
    EXPECT_FALSE(parse_resize_direction("TOP"));
    EXPECT_FALSE(parse_resize_direction("top_left"));
    EXPECT_FALSE(parse_resize_direction("topleft"));
    EXPECT_FALSE(parse_resize_direction("top "));
    EXPECT_FALSE(parse_resize_direction("client"));
    EXPECT_FALSE(parse_resize_direction("caption"));
    EXPECT_FALSE(parse_resize_direction("ne"));
    EXPECT_FALSE(parse_resize_direction("northwest"));
}

// 场景 1: 按 RtlGetVersion 的真实 build 号决定要不要自绘顶边线。
// 期望: Win10 全部版本(10240 首发 ~ 19045 22H2)要补;22000 起是 Win11,系统
// 自己画整圈边框,不能再叠一根;9600(Win8.1)与 0(读版本失败)都不补 ——
// 版本未知时宁可保持旧行为,也不要在 Win11 上把 WebView 无故下移 1px。
TEST(DesktopWindowChromeTopBorder, OnlyWindows10BuildsNeedSelfDrawnTopBorder) {
    EXPECT_TRUE(windows_needs_self_drawn_top_border(10240));
    EXPECT_TRUE(windows_needs_self_drawn_top_border(17763));
    EXPECT_TRUE(windows_needs_self_drawn_top_border(19045));
    EXPECT_TRUE(windows_needs_self_drawn_top_border(21999));

    EXPECT_FALSE(windows_needs_self_drawn_top_border(22000));
    EXPECT_FALSE(windows_needs_self_drawn_top_border(22631));
    EXPECT_FALSE(windows_needs_self_drawn_top_border(26100));
    EXPECT_FALSE(windows_needs_self_drawn_top_border(9600));
    EXPECT_FALSE(windows_needs_self_drawn_top_border(0));
}

// 场景 2: 线的粗细 = floor(系统 DPI / 96),至少 1。
// 期望: 100%/125%/150%/175%(96/120/144/168)都是 1 像素,200% 起是 2,300% 是 3。
// 这是 Win10 自己画边框的口径(Chromium 注释 "floor(system dsf) pixels when
// restored");若按四舍五入,150% 会变成 2 像素,比系统画的左/右/下边框粗一倍。
// DPI 读失败给 0 或负数时退回 1,线不能消失。
TEST(DesktopWindowChromeTopBorder, ThicknessFloorsSystemScale) {
    EXPECT_EQ(self_drawn_top_border_thickness(96), 1);
    EXPECT_EQ(self_drawn_top_border_thickness(120), 1);
    EXPECT_EQ(self_drawn_top_border_thickness(144), 1);
    EXPECT_EQ(self_drawn_top_border_thickness(168), 1);
    EXPECT_EQ(self_drawn_top_border_thickness(192), 2);
    EXPECT_EQ(self_drawn_top_border_thickness(240), 2);
    EXPECT_EQ(self_drawn_top_border_thickness(288), 3);
    EXPECT_EQ(self_drawn_top_border_thickness(0), 1);
    EXPECT_EQ(self_drawn_top_border_thickness(-96), 1);
}

// 场景 3: Win10 上普通的还原态窗口。
// 期望: WebView 顶上让出线的粗细(100% 为 1,200% 为 2),露出的这一行由宿主画线。
TEST(DesktopWindowChromeTopBorder, RestoredWindows10WindowReservesTopRow) {
    auto in = restored_win10_layout();
    EXPECT_EQ(self_drawn_top_border_inset(in), 1);

    in.system_dpi = 192;
    EXPECT_EQ(self_drawn_top_border_inset(in), 2);
}

// 场景 4: 这些情况下系统本来就没有(或不需要)顶边线,WebView 必须铺满客户区。
// 期望: 让位高度为 0。
// - 最大化:系统不画任何边框,多出一行会在屏幕顶端留下一条色带;
// - 最小化:客户区是 0x0,不能算出负高度;
// - 没有缩放边框(无 WS_THICKFRAME):左/右/下也没有系统边框,单画顶边不协调;
// - Win11 / 版本未知(supported=false):保持原来的全铺满布局。
TEST(DesktopWindowChromeTopBorder, NoInsetWhenSystemDrawsNoBorder) {
    auto maximized = restored_win10_layout();
    maximized.maximized = true;
    EXPECT_EQ(self_drawn_top_border_inset(maximized), 0);

    auto minimized = restored_win10_layout();
    minimized.minimized = true;
    EXPECT_EQ(self_drawn_top_border_inset(minimized), 0);

    auto no_frame = restored_win10_layout();
    no_frame.has_resize_frame = false;
    EXPECT_EQ(self_drawn_top_border_inset(no_frame), 0);

    auto unsupported = restored_win10_layout();
    unsupported.supported = false;
    EXPECT_EQ(self_drawn_top_border_inset(unsupported), 0);
}

// 场景 5: 窗口激活、没开「在标题栏和窗口边框上显示主题色」(Win10 默认)。
// 期望: alpha 0xA8 的 #262626 叠在底色上。叠在纯白上正好是 #707070 ——
// Win10 原生窗口激活时的边框色(Microsoft Q&A 与 Chromium 都给的这个值),
// 用它校准混色公式;叠在前端浅色底 #F5F5F2 上是 #6D6D6C。
TEST(DesktopWindowChromeTopBorder, ActiveDefaultMatchesNativeGrayBorder) {
    EXPECT_EQ(self_drawn_top_border_color(win10_color_input(true, kWhite)),
              (RgbColor{0x70, 0x70, 0x70}));
    EXPECT_EQ(self_drawn_top_border_color(win10_color_input(true, kLightAppBackground)),
              (RgbColor{0x6D, 0x6D, 0x6C}));
}

// 场景 6: 窗口失焦。
// 期望: alpha 0x80 的 #555555 叠在底色上,纯白上正好是 Win10 原生失焦边框 #AAAAAA,
// 浅色底上是 #A5A5A3。回归点:失焦时如果不换色,顶边线会比左/右/下三边深一截。
TEST(DesktopWindowChromeTopBorder, InactiveMatchesNativeLightGrayBorder) {
    EXPECT_EQ(self_drawn_top_border_color(win10_color_input(false, kWhite)),
              (RgbColor{0xAA, 0xAA, 0xAA}));
    EXPECT_EQ(self_drawn_top_border_color(win10_color_input(false, kLightAppBackground)),
              (RgbColor{0xA5, 0xA5, 0xA3}));
}

// 场景 7: 用户开了「在标题栏和窗口边框上显示主题色」,窗口激活。
// 输入: Win10 默认蓝色主题 ColorizationColor=0xC40078D7(最高字节不是 alpha,
// 要忽略),ColorizationColorBalance=89。
// 期望: 主题色 89% + #D9D9D9 11% 混合 = #1883D7,且与标题栏底色无关(系统画的
// 主题色边框是不透明的)。
TEST(DesktopWindowChromeTopBorder, ActiveAccentBorderBlendsColorizationWithNeutral) {
    auto in = win10_color_input(true, kLightAppBackground);
    in.accent_on_borders = true;
    in.colorization_color = 0xC40078D7u;
    in.colorization_balance = 89;
    EXPECT_EQ(self_drawn_top_border_color(in), (RgbColor{0x18, 0x83, 0xD7}));

    in.background = RgbColor{0x20, 0x20, 0x20};
    EXPECT_EQ(self_drawn_top_border_color(in), (RgbColor{0x18, 0x83, 0xD7}));
}

// 场景 8: 桌面背景设为纯色或幻灯片时,Win10 1611 起 ColorizationColorBalance 可能是
// 0xFFFFFFF3 这类大于 100 的怪值(Chromium 注释记录的现象)。
// 期望: 按 80% 处理,得到 #2B8BD7;不能直接拿大值去算,那会溢出成怪色。
TEST(DesktopWindowChromeTopBorder, OutOfRangeColorizationBalanceFallsBackTo80) {
    auto in = win10_color_input(true, kLightAppBackground);
    in.accent_on_borders = true;
    in.colorization_color = 0xC40078D7u;
    in.colorization_balance = 0xFFFFFFF3u;
    EXPECT_EQ(self_drawn_top_border_color(in), (RgbColor{0x2B, 0x8B, 0xD7}));
}

// 场景 9: 开了主题色边框,但窗口失焦;或主题色的两个注册表值读不到。
// 期望: 失焦时系统边框不再用主题色,退回失焦灰;注册表读失败时退回默认激活灰,
// 不能拿 0 当主题色画出一根黑线。
TEST(DesktopWindowChromeTopBorder, AccentOnlyAppliesWhenActiveAndReadable) {
    auto inactive = win10_color_input(false, kWhite);
    inactive.accent_on_borders = true;
    inactive.colorization_color = 0xC40078D7u;
    inactive.colorization_balance = 89;
    EXPECT_EQ(self_drawn_top_border_color(inactive), (RgbColor{0xAA, 0xAA, 0xAA}));

    auto unreadable = win10_color_input(true, kWhite);
    unreadable.accent_on_borders = true;
    unreadable.colorization_balance = 89;  // ColorizationColor 缺失
    EXPECT_EQ(self_drawn_top_border_color(unreadable), (RgbColor{0x70, 0x70, 0x70}));
}

// 场景 10: 1809(build 17763)之前的 Win10,激活窗口的系统边框是白色。
// 期望: 17134(1803)上激活态画白线;17763 起换成半透明深灰;失焦态不受版本影响。
TEST(DesktopWindowChromeTopBorder, PreVersion1809ActiveBorderIsWhite) {
    auto rs4 = win10_color_input(true, kLightAppBackground);
    rs4.windows_build = 17134;
    EXPECT_EQ(self_drawn_top_border_color(rs4), kWhite);

    auto rs5 = win10_color_input(true, kWhite);
    rs5.windows_build = 17763;
    EXPECT_EQ(self_drawn_top_border_color(rs5), (RgbColor{0x70, 0x70, 0x70}));

    auto rs4_inactive = win10_color_input(false, kWhite);
    rs4_inactive.windows_build = 17134;
    EXPECT_EQ(self_drawn_top_border_color(rs4_inactive), (RgbColor{0xAA, 0xAA, 0xAA}));
}