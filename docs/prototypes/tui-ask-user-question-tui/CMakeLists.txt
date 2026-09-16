cmake_minimum_required(VERSION 3.20)

project(tui_ask_user_question_prototype LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

find_package(ftxui CONFIG REQUIRED)

add_executable(tui_ask_user_question_prototype main.cpp)
target_link_libraries(tui_ask_user_question_prototype PRIVATE
    ftxui::screen
    ftxui::dom
    ftxui::component
)

target_compile_definitions(tui_ask_user_question_prototype PRIVATE
    FTXUI_ASK_USER_QUESTION_PROTOTYPE=1
)

if(MSVC)
    target_compile_options(tui_ask_user_question_prototype PRIVATE /utf-8)
endif()
