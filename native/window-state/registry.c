/* MIT. Launch-scoped HK4E window controls. No game process, worker or UI. */
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct { DWORD existed, type, length; BYTE data[65536]; } value;
typedef struct { DWORD magic, mask, absent_keys; value values[4]; } snapshot;
static const wchar_t *names[] = { L"AllowFixedSizeFullscreen",
    L"Screenmanager Is Fullscreen mode_h3981298716",
    L"Screenmanager Resolution Width_h182942802", L"Screenmanager Resolution Height_h2627697771" };
static const wchar_t *keys[7];
static wchar_t app[256], driver[256], game[256];
static wchar_t file[32768], temp[32768];
static snapshot saved;
static int write_file(const wchar_t *path, const void *data, DWORD size, DWORD disposition) {
    HANDLE f = CreateFileW(path, GENERIC_WRITE, 0, NULL, disposition, FILE_ATTRIBUTE_NORMAL, NULL);
    DWORD n = 0;
    int ok = f != INVALID_HANDLE_VALUE && WriteFile(f, data, size, &n, NULL) && n == size && FlushFileBuffers(f);
    if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
    return ok;
}
static int load(void) {
    HANDLE f = CreateFileW(file, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    DWORD n = 0;
    int ok = f != INVALID_HANDLE_VALUE && GetFileSize(f, NULL) == sizeof(saved) &&
        ReadFile(f, &saved, sizeof(saved), &n, NULL) && n == sizeof(saved) && saved.magic == 0x59415731 &&
        !(saved.mask & ~15u) && !(saved.absent_keys & ~127u);
    if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
    for (unsigned i = 0; i < 4; i++)
        if (saved.values[i].length > sizeof(saved.values[i].data) || saved.values[i].existed > 1) ok = 0;
    return ok;
}
static int save(DWORD mask) {
    saved.magic = 0x59415731; saved.mask = mask;
    for (unsigned i = 0; i < 7; i++) {
        HKEY key; LONG e = RegOpenKeyExW(HKEY_CURRENT_USER, keys[i], 0, KEY_READ, &key);
        if (e == ERROR_FILE_NOT_FOUND) saved.absent_keys |= 1u << i;
        else if (e != ERROR_SUCCESS) return 0;
        else RegCloseKey(key);
    }
    for (unsigned i = 0; i < 4; i++) {
        if (!(mask & (1u << i))) continue;
        HKEY key = NULL; value *v = &saved.values[i];
        LONG e = RegOpenKeyExW(HKEY_CURRENT_USER, i ? game : driver, 0, KEY_QUERY_VALUE, &key);
        if (e == ERROR_SUCCESS) {
            v->length = sizeof(v->data);
            e = RegQueryValueExW(key, names[i], NULL, &v->type, v->data, &v->length);
            RegCloseKey(key);
        }
        if (e == ERROR_FILE_NOT_FOUND) { v->length = 0; v->type = 0; }
        else if (e != ERROR_SUCCESS) return 0;
        else v->existed = 1;
    }
    /* All snapshots become durable before the first registry mutation. Never
     * replace an earlier preimage, including after partial apply/retry. */
    return write_file(temp, &saved, sizeof(saved), CREATE_NEW) && MoveFileW(temp, file);
}
static int set(unsigned i, DWORD type, const BYTE *data, DWORD length) {
    HKEY key;
    LONG e = RegCreateKeyExW(HKEY_CURRENT_USER, i ? game : driver, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL);
    if (e != ERROR_SUCCESS) return 0;
    e = RegSetValueExW(key, names[i], 0, type, data, length); RegCloseKey(key);
    return e == ERROR_SUCCESS;
}
static int restore(int allow_missing) {
    /* A failed save never mutated the registry and has no committed snapshot. */
    if (GetFileAttributesW(file) == INVALID_FILE_ATTRIBUTES && GetLastError() == ERROR_FILE_NOT_FOUND) return allow_missing;
    if (!load()) return 0;
    int ok = 1;
    for (unsigned i = 0; i < 4; i++) {
        if (!(saved.mask & (1u << i))) continue;
        value *v = &saved.values[i];
        if (v->existed) { if (!set(i, v->type, v->data, v->length)) ok = 0; }
        else {
            HKEY key; LONG e = RegOpenKeyExW(HKEY_CURRENT_USER, i ? game : driver, 0, KEY_SET_VALUE, &key);
            if (e == ERROR_SUCCESS) { e = RegDeleteValueW(key, names[i]); RegCloseKey(key); }
            if (e != ERROR_SUCCESS && e != ERROR_FILE_NOT_FOUND) ok = 0;
        }
    }
    for (int i = 6; i >= 0; i--) if (saved.absent_keys & (1u << i)) {
        HKEY key; LONG e = RegOpenKeyExW(HKEY_CURRENT_USER, keys[i], 0, KEY_READ, &key);
        if (e == ERROR_FILE_NOT_FOUND) continue;
        if (e != ERROR_SUCCESS) { ok = 0; continue; }
        DWORD children = 1, values = 1;
        e = RegQueryInfoKeyW(key, NULL, NULL, NULL, &children, NULL, NULL, &values, NULL, NULL, NULL, NULL);
        RegCloseKey(key);
        if (e != ERROR_SUCCESS) ok = 0;
        else if (!children && !values && RegDeleteKeyW(HKEY_CURRENT_USER, keys[i]) != ERROR_SUCCESS) ok = 0;
    }
    return ok;
}
static int observe(const wchar_t *directory) {
    HKEY key; DWORD numbers[3], type, size;
    LONG e = RegOpenKeyExW(HKEY_CURRENT_USER, game, 0, KEY_QUERY_VALUE, &key);
    if (e != ERROR_SUCCESS) return e == ERROR_FILE_NOT_FOUND;
    int valid = 1;
    for (unsigned i = 0; i < 3; i++) {
        size = sizeof(DWORD);
        if (RegQueryValueExW(key, names[i + 1], NULL, &type, (BYTE *)&numbers[i], &size) != ERROR_SUCCESS ||
            type != REG_DWORD || size != sizeof(DWORD)) valid = 0;
    }
    RegCloseKey(key);
    if (!valid) return 1; /* Missing/malformed state is not a new size. */
    char json[256];
    int length = snprintf(json, sizeof(json), "{\"schema\":1,\"mode\":%lu,\"width\":%lu,\"height\":%lu}\n",
        numbers[0], numbers[1], numbers[2]);
    swprintf(temp, 32768, L"%ls\\current.json", directory);
    return write_file(temp, json, (DWORD)length, CREATE_ALWAYS);
}
int wmain(int argc, wchar_t **argv) {
    if (argc != 8 || wcslen(argv[2]) > 32000 ||
        (wcscmp(argv[3], L"hk4e_global") && wcscmp(argv[3], L"hk4e_cn"))) return 2;
    int cn = !wcscmp(argv[3], L"hk4e_cn");
    swprintf(app, 256, L"Software\\Wine\\AppDefaults\\%ls", cn ? L"YuanShen.exe" : L"GenshinImpact.exe");
    swprintf(driver, 256, L"%ls\\Mac Driver", app);
    swprintf(game, 256, L"Software\\miHoYo\\%ls", cn ? L"\x539f\x795e" : L"Genshin Impact");
    keys[0] = L"Software"; keys[1] = L"Software\\Wine"; keys[2] = L"Software\\Wine\\AppDefaults";
    keys[3] = app; keys[4] = driver; keys[5] = L"Software\\miHoYo"; keys[6] = game;
    swprintf(file, 32768, L"%ls\\window-registry.bin", argv[2]);
    swprintf(temp, 32768, L"%ls\\window-registry.tmp", argv[2]);
    if (!wcscmp(argv[1], L"restore")) return restore(0) ? 0 : 5;
    if (!wcscmp(argv[1], L"discard")) return restore(1) ? 0 : 5;
    if (!wcscmp(argv[1], L"observe")) return observe(argv[2]) ? 0 : 5;
    if ((wcscmp(argv[4], L"0") && wcscmp(argv[4], L"1")) ||
        (wcscmp(argv[7], L"0") && wcscmp(argv[7], L"1"))) return 2;
    wchar_t *end; unsigned long width = wcstoul(argv[5], &end, 10); if (*end) return 2;
    unsigned long height = wcstoul(argv[6], &end, 10); if (*end) return 2;
    if ((width || height) && (width < 320 || height < 200 || width > 16384 || height > 16384)) return 2;
    DWORD mask = !wcscmp(argv[4], L"1") ? 3 : 0;
    if (width && height) mask |= 14;
    if (!wcscmp(argv[1], L"save")) return save(mask) ? 0 : 5;
    if (wcscmp(argv[1], L"apply") || !load() || saved.mask != mask) return 2;
    if (!wcscmp(argv[7], L"1") && width && height) {
        RECT work; if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0)) return 5;
        LONG max_width = work.right - work.left - 2 * GetSystemMetrics(SM_CXFIXEDFRAME);
        LONG max_height = work.bottom - work.top - GetSystemMetrics(SM_CYCAPTION) - 2 * GetSystemMetrics(SM_CYFIXEDFRAME);
        if (max_width < 320 || max_height < 200) return 5;
        if (width > (DWORD)max_width) width = max_width;
        if (height > (DWORD)max_height) height = max_height;
    }
    DWORD zero = 0, w = width, h = height;
    if ((mask & 1) && !set(0, REG_SZ, (const BYTE *)L"Y", 4)) return 5;
    if ((mask & 2) && !set(1, REG_DWORD, (const BYTE *)&zero, 4)) return 5;
    if ((mask & 4) && !set(2, REG_DWORD, (const BYTE *)&w, 4)) return 5;
    if ((mask & 8) && !set(3, REG_DWORD, (const BYTE *)&h, 4)) return 5;
    return 0;
}
