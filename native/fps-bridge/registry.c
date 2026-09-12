/* Narrow snapshots for the values changed by direct HK4E preparation.
 * Separate from the long-lived bridge so restoration can follow Wine waiting.
 * Files stay in the request-private directory until all cleanup is confirmed.
 */
typedef struct {
    DWORD magic, key_existed, existed, type, length;
    unsigned char bytes[65536];
} registry_snapshot;
static const wchar_t *registry_names[] = {
    L"RetinaMode", L"LeftCommandIsCtrl", L"WINDOWS_HDR_ON_h3132281285",
    L"Screenmanager Is Fullscreen mode_h3981298716",
    L"Screenmanager Resolution Width_h182942802", L"Screenmanager Resolution Height_h2627697771"
};
static int registry_main(int argc, wchar_t **argv) {
    if (argc != 7 || (wcscmp(argv[2], L"save") && wcscmp(argv[2], L"restore")) ||
        (wcscmp(argv[4], L"hk4e_cn") && wcscmp(argv[4], L"hk4e_global")) ||
        wcslen(argv[3]) > 32000 || (wcscmp(argv[5], L"0") && wcscmp(argv[5], L"1")) ||
        (wcscmp(argv[6], L"0") && wcscmp(argv[6], L"1"))) return 2;
    int save = !wcscmp(argv[2], L"save"), failed = 0;
    for (unsigned i = 0; i < 6; i++) {
        if (i == 2 && !wcscmp(argv[5], L"0")) continue;
        if (i >= 3 && !wcscmp(argv[6], L"0")) continue;
        const wchar_t *key_name = i < 2 ? L"Software\\Wine\\Mac Driver" :
            !wcscmp(argv[4], L"hk4e_cn") ? L"Software\\miHoYo\\\x539f\x795e" : L"Software\\miHoYo\\Genshin Impact";
        wchar_t file_name[32768];
        swprintf(file_name, 32768, L"%ls\\registry-%u", argv[3], i);
        registry_snapshot snapshot = {0};
        HKEY key = NULL;
        LONG error = RegOpenKeyExW(HKEY_CURRENT_USER, key_name, 0, KEY_QUERY_VALUE | KEY_SET_VALUE, &key);
        if (error != ERROR_SUCCESS && error != ERROR_FILE_NOT_FOUND) { failed = 1; continue; }
        if (save) {
            snapshot.magic = 0x59414731;
            snapshot.key_existed = error == ERROR_SUCCESS;
            snapshot.length = sizeof(snapshot.bytes);
            if (key) error = RegQueryValueExW(key, registry_names[i], NULL, &snapshot.type, snapshot.bytes, &snapshot.length);
            if (error == ERROR_FILE_NOT_FOUND) { snapshot.length = 0; snapshot.type = 0; }
            else if (error == ERROR_SUCCESS) snapshot.existed = 1;
            else { if (key) RegCloseKey(key); failed = 1; continue; }
            HANDLE file = CreateFileW(file_name, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
            DWORD written = 0, length = 5 * sizeof(DWORD) + snapshot.length;
            if (file == INVALID_HANDLE_VALUE || !WriteFile(file, &snapshot, length, &written, NULL) ||
                written != length || !FlushFileBuffers(file)) failed = 1;
            if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
        } else {
            HANDLE file = CreateFileW(file_name, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
            DWORD length = 0;
            int valid = file != INVALID_HANDLE_VALUE && ReadFile(file, &snapshot, sizeof(snapshot), &length, NULL) &&
                snapshot.magic == 0x59414731 && snapshot.length <= sizeof(snapshot.bytes) &&
                length == 5 * sizeof(DWORD) + snapshot.length && snapshot.key_existed <= 1 && snapshot.existed <= 1;
            if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
            if (!valid) { if (key) RegCloseKey(key); failed = 1; continue; }
            if (snapshot.existed) {
                if (!key) error = RegCreateKeyExW(HKEY_CURRENT_USER, key_name, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL);
                if (error == ERROR_SUCCESS) error = RegSetValueExW(key, registry_names[i], 0, snapshot.type, snapshot.bytes, snapshot.length);
            } else if (key) {
                error = RegDeleteValueW(key, registry_names[i]);
                if (error == ERROR_FILE_NOT_FOUND) error = ERROR_SUCCESS;
            } else error = ERROR_SUCCESS;
            if (error != ERROR_SUCCESS) failed = 1;
            if (key && !snapshot.key_existed) {
                DWORD children = 1, values = 1;
                if (RegQueryInfoKeyW(key, NULL, NULL, NULL, &children, NULL, NULL, &values, NULL, NULL, NULL, NULL) == ERROR_SUCCESS &&
                    !children && !values && RegDeleteKeyW(HKEY_CURRENT_USER, key_name) != ERROR_SUCCESS) failed = 1;
            }
        }
        if (key) RegCloseKey(key);
    }
    return failed ? 5 : 0;
}
