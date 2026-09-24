/* YAAGL Wine 11.0 loader additions. SPDX-License-Identifier: LGPL-2.1-or-later
 * This is launch admission, not an isolation boundary against the current user.
 * Preparation has already verified the sealed assets in this private runtime.
 */
#include <errno.h>
#include <inttypes.h>
#ifdef YAAGL_GAME_HOST
# include <CommonCrypto/CommonDigest.h>
# include "compatible-ntdll.h"
#endif

#define YAAGL_HOST_SUFFIX "/YAAGL HK4E.app/Contents/MacOS"
#define YAAGL_REQUEST "yaagl-game-mode.request"
#ifdef YAAGL_GAME_HOST
static char yaagl_expected_ntdll[65];
#endif

static void yaagl_fail( const char *reason )
{
    fprintf( stderr, "yaagl-game-mode: %s\n", reason );
    exit(1);
}

static void yaagl_line( FILE *file, char *line, size_t size )
{
    size_t len;
    if (!fgets( line, size, file ) || !(len = strlen( line )) || line[len - 1] != '\n')
        yaagl_fail( "invalid request record" );
    line[len - 1] = 0;
}

/* Re-exec before any Wine initialization. The patched spawn_process supplies
 * the actual opened image path; command-line text cannot choose a host. */
static char *yaagl_route( char **argv )
{
    const char *self = get_self_exe(), *request = getenv( "YAAGL_GAME_MODE_REQUEST" );
    const char *image = getenv( "YAAGL_GAME_MODE_IMAGE" ), *prefix = getenv( "WINEPREFIX" );
    char *dir, *native_dir, *record, *actual, *canonical_prefix, *host;
    char magic[64], saved_prefix[PATH_MAX], target[PATH_MAX], numbers[128], digest[66];
    struct stat st, target_stat;
    uintmax_t device, inode;
    FILE *file;
    int fd, routed, socketfd;
    char *end;
    const char *socket = getenv( "WINESERVERSOCKET" );
    const char *noexec = getenv( "WINELOADERNOEXEC" );

    if (!self || !(dir = realpath_dirname( self ))) yaagl_fail( "cannot locate loader" );
    free( (void *)self );
    native_dir = remove_tail( dir, YAAGL_HOST_SUFFIX );
    routed = native_dir != NULL;
    if (!native_dir) native_dir = strdup( dir );
    free( dir );
#ifdef YAAGL_GAME_HOST
    if (!routed) yaagl_fail( "host must run inside its fixed app bundle" );
#else
    if (routed) yaagl_fail( "ordinary loader cannot be a game host" );
#endif
    if (!request || !*request || !image || !*image)
    {
        if (routed) yaagl_fail( "host requires an owned Wine child request" );
        unsetenv( "YAAGL_GAME_MODE_IMAGE" );
        return native_dir;
    }
    record = build_path( native_dir, YAAGL_REQUEST );
    if (strcmp( request, record )) yaagl_fail( "request belongs to another runtime" );
    free( record );
    fd = open( request, O_RDONLY | O_NOFOLLOW | O_CLOEXEC );
    if (fd < 0 || fstat( fd, &st ) || !S_ISREG( st.st_mode ) ||
        st.st_uid != geteuid() || (st.st_mode & 0777) != 0600 || st.st_nlink != 1)
        yaagl_fail( "missing or invalid private request" );
    if (!(file = fdopen( fd, "r" ))) yaagl_fail( "cannot read request" );
    yaagl_line( file, magic, sizeof(magic) );
    yaagl_line( file, saved_prefix, sizeof(saved_prefix) );
    yaagl_line( file, target, sizeof(target) );
    yaagl_line( file, numbers, sizeof(numbers) );
    yaagl_line( file, digest, sizeof(digest) );
    if (strcmp( magic, "YAAGL-HK4E-GAME-MODE-1" ) ||
        sscanf( numbers, "%ju %ju", &device, &inode ) != 2 || fgetc( file ) != EOF)
        yaagl_fail( "invalid request binding" );
    fclose( file );
    if (!prefix || !(canonical_prefix = realpath( prefix, NULL ))) yaagl_fail( "missing Wine prefix" );
    if (strcmp( canonical_prefix, saved_prefix )) yaagl_fail( "request belongs to another prefix" );
    free( canonical_prefix );
    actual = realpath( image, NULL );
    if (!actual || strcmp( actual, target ))
    {
        free( actual );
        if (routed) yaagl_fail( "host target mismatch" );
        unsetenv( "YAAGL_GAME_MODE_IMAGE" );
        return native_dir; /* boot/registry/Steam/bridge/worker/unrelated child */
    }
    free( actual );
    if (stat( target, &target_stat ) || !S_ISREG( target_stat.st_mode ) ||
        (uintmax_t)target_stat.st_dev != device || (uintmax_t)target_stat.st_ino != inode)
        yaagl_fail( "selected executable changed since preparation" );
    if (!socket || !*socket || !noexec || strcmp( noexec, "1" ))
        yaagl_fail( "target is not a Wine-created child" );
    errno = 0;
    long number = strtol( socket, &end, 10 );
    if (errno || *end || number < 0 || number > INT_MAX) yaagl_fail( "invalid server socket" );
    socketfd = (int)number;
    if (fstat( socketfd, &st ) || !S_ISSOCK( st.st_mode )) yaagl_fail( "missing inherited server socket" );
#ifdef YAAGL_GAME_HOST
    if (strcmp( digest, YAAGL_NTDLL_PLAIN ) && strcmp( digest, YAAGL_NTDLL_R2 ))
        yaagl_fail( "unsupported request ntdll identity" );
    strcpy( yaagl_expected_ntdll, digest );
    /* Consumed here; every subsequent Windows child gets a fresh resolved image. */
    unsetenv( "YAAGL_GAME_MODE_IMAGE" );
    return native_dir;
#else
    host = build_path( native_dir, "YAAGL HK4E.app/Contents/MacOS/wine" );
    /* Keep argv[0], PID, cwd, environment, inherited handles and server socket. */
    execv( host, argv );
    yaagl_fail( "cannot exec required game host" );
    return NULL;
#endif
}

#ifdef YAAGL_GAME_HOST
static void *yaagl_load_ntdll( const char *native_dir )
{
    char *path = build_path( native_dir, "ntdll.so" );
    unsigned char block[16384], digest[CC_SHA256_DIGEST_LENGTH];
    char hex[CC_SHA256_DIGEST_LENGTH * 2 + 1];
    CC_SHA256_CTX ctx;
    struct stat st;
    ssize_t size;
    int fd = open( path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC );
    if (fd < 0 || fstat( fd, &st ) || !S_ISREG( st.st_mode )) yaagl_fail( "cannot open associated ntdll" );
    CC_SHA256_Init( &ctx );
    while ((size = read( fd, block, sizeof(block) )) > 0) CC_SHA256_Update( &ctx, block, (CC_LONG)size );
    close( fd );
    if (size < 0) yaagl_fail( "cannot read associated ntdll" );
    CC_SHA256_Final( digest, &ctx );
    for (unsigned int i = 0; i < sizeof(digest); i++) sprintf( hex + i * 2, "%02x", digest[i] );
    if (strcmp( hex, yaagl_expected_ntdll ))
        yaagl_fail( "associated ntdll hash mismatch" );
    fprintf( stderr, "yaagl-game-mode: host pid=%d; ntdll=%s; sha256=%s; eligibility requested, OS activation unobserved\n",
             getpid(), path, hex );
    return dlopen( path, RTLD_NOW ); /* No argv/PATH/environment library fallback. */
}
#endif
