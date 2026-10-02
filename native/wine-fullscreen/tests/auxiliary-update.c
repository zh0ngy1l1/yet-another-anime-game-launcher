/* Optional, isolated auxiliary-window mutation reproducer.
 * Build: x86_64-w64-mingw32-gcc -O2 -Wall auxiliary-update.c -o auxiliary-update.exe
 * The observer creates YAAGL_AUX_COMMAND only after observing real fullscreen.
 * YAAGL_AUX_RESIZABLE_PARENT=1 enables the same scenario on unmodified Wine.
 * This executable always exits within 15 seconds after creating its windows.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wp, LPARAM lp)
{
    if (message == WM_CLOSE) { DestroyWindow(window); return 0; }
    return DefWindowProcA(window, message, wp, lp);
}

static void print_rect(const char *phase, HWND window)
{
    RECT rect;
    GetWindowRect(window, &rect);
    printf("AUX_RECT %s x=%ld y=%ld width=%ld height=%ld\n", phase,
           rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    fflush(stdout);
}

int main(void)
{
    const char *command = getenv("YAAGL_AUX_COMMAND");
    char command_path[4096];
    DWORD parent_style = WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
    HWND parent, child;
    WNDCLASSA cls = {0};
    MSG message;
    UINT_PTR timer;
    ULONGLONG started;
    int updated = 0;

    if (!command || command[0] != '/' || strlen(command) + 3 > sizeof(command_path)) return 2;
    snprintf(command_path, sizeof(command_path), "Z:%s", command);
    for (char *p = command_path; *p; p++) if (*p == '/') *p = '\\';
    if (getenv("YAAGL_AUX_RESIZABLE_PARENT") && atoi(getenv("YAAGL_AUX_RESIZABLE_PARENT")))
        parent_style = WS_OVERLAPPEDWINDOW;

    SetProcessDPIAware();
    cls.lpfnWndProc = window_proc;
    cls.hInstance = GetModuleHandleA(NULL);
    cls.lpszClassName = "YAAGLAuxiliaryUpdateTest";
    cls.hCursor = LoadCursorA(NULL, IDC_ARROW);
    cls.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    if (!RegisterClassA(&cls)) return 2;
    parent = CreateWindowExA(0, cls.lpszClassName, "YAAGL AUX parent", parent_style,
                            100, 100, 640, 440, NULL, NULL, cls.hInstance, NULL);
    child = CreateWindowExA(0, cls.lpszClassName, "YAAGL AUX child", WS_OVERLAPPEDWINDOW,
                           220, 200, 240, 180, parent, NULL, cls.hInstance, NULL);
    if (!parent || !child) return 2;
    ShowWindow(parent, SW_SHOW);
    ShowWindow(child, SW_SHOWNOACTIVATE);
    SetForegroundWindow(parent);
    printf("AUX_MODE resizable_parent=%d\n", !!(parent_style & WS_THICKFRAME));
    print_rect("initial", child);
    started = GetTickCount64();
    timer = SetTimer(NULL, 0, 100, NULL);
    if (!timer) return 2;

    while (GetMessageA(&message, NULL, 0, 0) > 0) {
        if (message.message == WM_TIMER && message.wParam == timer) {
            if (GetTickCount64() - started >= 15000) break;
            if (!updated && GetFileAttributesA(command_path) != INVALID_FILE_ATTRIBUTES) {
                RECT rect;
                BOOL changed;
                GetWindowRect(child, &rect);
                print_rect("before-update", child);
                printf("AUX_REQUEST x=%ld y=%ld width=%ld height=%ld\n",
                       rect.left + 31, rect.top + 37,
                       rect.right - rect.left + 84, rect.bottom - rect.top + 62);
                changed = SetWindowPos(child, NULL, rect.left + 31, rect.top + 37,
                                       rect.right - rect.left + 84, rect.bottom - rect.top + 62,
                                       SWP_NOACTIVATE | SWP_NOZORDER);
                printf("AUX_UPDATE success=%d error=%lu\n", changed, changed ? 0 : GetLastError());
                print_rect("desired", child);
                if (!changed) break;
                /* Acknowledgement follows the Win32 API update, not a Cocoa-only resize. */
                SetWindowTextA(child, "YAAGL AUX updated");
                updated = 1;
            }
        }
        TranslateMessage(&message);
        DispatchMessageA(&message);
    }
    print_rect("final", child);
    printf("AUX_DONE updated=%d\n", updated);
    fflush(stdout);
    KillTimer(NULL, timer);
    if (IsWindow(child)) DestroyWindow(child);
    if (IsWindow(parent)) DestroyWindow(parent);
    return updated ? 0 : 2;
}
