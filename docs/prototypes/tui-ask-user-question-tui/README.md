# TUI AskUserQuestion 高保真静态原型

这是一个独立的、可丢弃的 FTXUI 原型，用来观察真实终端中的 AskUserQuestion 提问模式，不接入 ACECode 生产问答流程。

## 构建

在仓库根目录执行（Windows + Ninja 示例）：

```bat
cmake -S docs/prototypes/tui-ask-user-question-tui -B build/tui-ask-user-question-prototype -G Ninja ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_TOOLCHAIN_FILE=C:/dev/tools/vcpkg/scripts/buildsystems/vcpkg.cmake ^
  -DVCPKG_TARGET_TRIPLET=x64-windows-static
cmake --build build/tui-ask-user-question-prototype --config Release
```

如果使用其它 vcpkg 路径，只需替换 `CMAKE_TOOLCHAIN_FILE`。

## 启动

```bat
build\\tui-ask-user-question-prototype\\tui_ask_user_question_prototype.exe
```

建议在 Windows Terminal 中启动，以获得较好的 UTF-8 和鼠标支持。

## 交互

- `1`–`4`：选择并提交预设项
- `Up` / `Down`：移动选项焦点
- `Space`：切换当前选择
- `Enter`：提交当前题
- `Tab` / `Shift+Tab`：下一题 / 上一题
- `Left` / `Right`：多题模式切题；汇总页分别回最后一题 / 第一题
- `Esc`：清除当前选择；汇总页取消
- `Shift+X`：取消整个问答
- `y`：显示复制 Toast
- `m`：切换单选 / 多选
- `e`：进入自定义回答编辑状态
- `s`：切换到汇总页
- `l`：切换长内容滚动场景
- `t`：显示超时自动选择状态
- `v`：切换三种布局：终端流 / 聚焦卡片 / 进度栏
- 鼠标单击：选择选项或进入自定义回答
- 鼠标滚轮：滚动长内容或汇总内容
- `q`：退出原型

原型会在底部显示当前模式、题目状态、焦点和滚动偏移，方便对照交互后的完整状态。
