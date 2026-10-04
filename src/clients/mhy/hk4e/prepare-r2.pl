use strict;
use warnings;
use Cwd qw(abs_path);
use Digest::SHA qw(sha256_hex);
use File::Find;
use File::Copy qw(copy);
use File::Temp qw(tempdir);
use File::Path qw(make_path remove_tree);
use File::Basename qw(dirname basename);
use JSON::PP;
use Encode qw(encode_utf8);
use Fcntl qw(O_RDONLY O_NOFOLLOW);
use Time::HiRes qw(clock_gettime CLOCK_MONOTONIC);
use POSIX ();

# All paths are argv data. A fresh private copy is never selected before the
# complete receipt is committed. Abandoned preparations are never reused.
my ($source, $parent, $manifest_json) = @ARGV;
my $m = decode_json($manifest_json);
# Diagnostics have a separate stream; stdout remains the publication contract.
# CPU includes this process and waited children; intervals are sequential here.
my ($timing_origin, $phase_start, $timing_phase, @phase_cpu);
my $timing_done = 0;
sub timing_end {
    my ($outcome) = @_;
    return unless defined($timing_phase);
    my $now = clock_gettime(CLOCK_MONOTONIC);
    my @cpu = times;
    my $event = {request => $m->{timingRequest}, phase => $timing_phase,
        atMs => 1000 * ($phase_start - $timing_origin),
        elapsedMs => 1000 * ($now - $phase_start), outcome => $outcome,
        userMs => 1000 * ($cpu[0] + $cpu[2] - $phase_cpu[0] - $phase_cpu[2]),
        systemMs => 1000 * ($cpu[1] + $cpu[3] - $phase_cpu[1] - $phase_cpu[3])};
    eval { print STDERR 'HK4E_RUNTIME_TIMING ' . encode_json($event) . "\n"; };
    undef $timing_phase;
}
sub timing_phase {
    my ($name) = @_;
    return unless defined($m->{timingRequest});
    timing_end('ok');
    $timing_phase = $name;
    $phase_start = clock_gettime(CLOCK_MONOTONIC);
    $timing_origin //= $phase_start;
    @phase_cpu = times;
}
END { timing_end($timing_done ? 'ok' : 'error'); }
timing_phase('admission-assets');
die "absolute canonical runtime required" unless defined($source) &&
    $source =~ m{^/} && abs_path($source) eq $source && -d $source;
die "absolute preparation parent required" unless defined($parent) && $parent =~ m{^/};
make_path($parent, {mode => 0700});
die "noncanonical preparation parent" unless abs_path($parent) eq $parent;

sub hash_file {
    my ($path) = @_;
    sysopen(my $f, $path, O_RDONLY | O_NOFOLLOW) or die "open $path: $!";
    die "not regular: $path" unless -f $f;
    # The system digest is faster for large files; small files avoid fork/exec.
    # Pass the admitted descriptor, never a path that the child could reopen.
    if (-s $f >= 2 * 1024 * 1024) {
        my $pid = open(my $output, '-|');
        die "openssl fork: $!" unless defined($pid);
        if (!$pid) {
            if (!open(STDIN, '<&', $f)) {
                print STDERR "openssl stdin: $!\n";
                POSIX::_exit(126);
            }
            exec('/usr/bin/openssl', 'dgst', '-sha256', '-binary') or do {
                print STDERR "openssl exec: $!\n";
                POSIX::_exit(127);
            };
        }
        my $digest = '';
        my ($n, $error);
        while (length($digest) <= 32) {
            $n = read($output, my $chunk, 33 - length($digest));
            if (!defined($n)) { $error = "$!"; last; }
            last unless $n;
            $digest .= $chunk;
        }
        # Settle the sole child even after read failure or excess output. No
        # publication or staging cleanup may race an outstanding digest child.
        my $closed = close($output);
        my $status = $?;
        my $file_closed = close($f);
        die "openssl read: $error" if defined($error);
        die "openssl failed: $status" unless $closed && $status == 0;
        die "openssl digest length" unless length($digest) == 32;
        die "close $path: $!" unless $file_closed;
        return unpack('H*', $digest);
    }
    my $hash = Digest::SHA->new(256)->addfile($f)->hexdigest;
    close($f) or die "close $path: $!";
    return $hash;
}
sub inventory {
    my ($root) = @_;
    my %files;
    find({no_chdir => 1, wanted => sub {
        my $p = $File::Find::name;
        my @s = lstat($p); die "lstat $p" unless @s;
        my $rel = substr($p, length($root));
        if (-l _) {
            my $target = readlink($p);
            my $resolved = abs_path($p);
            my $known_dangling = !-e $p &&
                exists($m->{archiveDanglingLinks}{$rel}) &&
                $m->{archiveDanglingLinks}{$rel} eq $target;
            die "external/broken runtime link: $p" unless $target !~ m{^/} &&
                ($known_dangling || (defined($resolved) &&
                index($resolved, "$root/") == 0 && -e $p));
            $files{$rel} = ['link', $target];
        } elsif (-d _) { $files{$rel} = ['directory', $s[2] & 07777]; }
        elsif (-f _) { $files{$rel} = ['file', $s[2] & 07777, $s[7], hash_file($p)]; }
        else { die "special runtime entry: $p"; }
    }}, $root);
    return \%files;
}
my $json = JSON::PP->new->canonical;
my $rel = '/lib/wine/x86_64-unix/ntdll.so';
my $input = hash_file($source . $rel);
die "Unsupported additional wine64 loader" if -e "$source/bin/wine64" || -l "$source/bin/wine64";
die "Unsupported Wine ntdll bytes; FPS launch stopped before game changes" unless
    $input eq $m->{inputSha256} || $input eq $m->{outputSha256};
for my $p (keys %{$m->{pins}}) {
    die "Unsupported Wine executable: $p" unless hash_file("$source/$p") eq $m->{pins}{$p};
}
my $apply_r2 = !exists($m->{applyR2}) || $m->{applyR2};
my $game_mode = $m->{gameMode};
my $output = $game_mode ? $game_mode->{ntdll}{$apply_r2 ? 'r2' : 'plain'}{sha256} :
    $apply_r2 ? $m->{outputSha256} : $input;
my ($game_target, $game_prefix, $game_host, $game_assets, @game_stat);
if ($game_mode) {
    $game_assets = encode_utf8($m->{gameModeAssets});
    die "Game Mode requires fullscreen/compatible manifest" unless $m->{fullscreen} && $game_mode->{schema} == 1 &&
        $game_mode->{bundleIdentifier} eq 'com.zh0ngy1l1.yaagl.hk4e-game';
    die "Unsupported Game Mode loader input" unless
        hash_file("$source/lib/wine/x86_64-unix/wine") eq $game_mode->{inputLoaderSha256};
    for my $a (@{$game_mode->{files}}) {
        die "Game Mode asset path" if $a->{path} =~ m{(?:^/|(?:^|/)\.\.(?:/|$))};
        die "Game Mode bundled asset mismatch: $a->{path}" unless
            hash_file($game_assets . "/" . encode_utf8($a->{path})) eq $a->{sha256};
    }
    for my $path ($m->{gameModeExecutable}, $m->{gameModePrefix}) {
        die "Game Mode requires absolute paths without control characters" unless defined($path) &&
            $path =~ m{^/} && $path !~ /[\x00-\x1f\x7f]/;
    }
    $game_target = abs_path($m->{gameModeExecutable});
    $game_prefix = abs_path($m->{gameModePrefix});
    die "Invalid Game Mode target/prefix" unless defined($game_target) && defined($game_prefix) &&
        -f $game_target && -d $game_prefix &&
        basename($game_target) =~ /^(?:GenshinImpact|YuanShen)\.exe$/;
    @game_stat = stat($game_target);
    # Select sealed metadata by the admitted executable, including universal
    # packages. The bundle filename also supplies the Dock label. Keep filesystem
    # paths as UTF-8 bytes, matching File::Find inventory keys on macOS.
    $game_host = $game_mode->{hosts}{basename($game_target)};
    die "Invalid regional Game Mode host" unless defined($game_host) &&
        $game_host eq (basename($game_target) eq 'YuanShen.exe' ?
            "hosts/cn/\x{539f}\x{795e}.app" : 'hosts/global/Genshin Impact.app');
    $game_host = encode_utf8($game_host);
    system('/usr/bin/codesign', '--verify', '--strict', "$game_assets/$game_host") == 0
        or die "Game Mode host signature invalid";
}
if ($m->{fullscreen}) {
    die "fullscreen architecture/manifest" unless $m->{fullscreen}{schema} == 1 &&
        @{$m->{fullscreen}{outputs}} == 3;
    my @expected = ('lib/wine/x86_64-unix/winemac.so',
        'lib/wine/x86_64-windows/winemac.drv', 'lib/wine/i386-windows/winemac.drv');
    for my $i (0..2) {
        my $a = $m->{fullscreen}{outputs}[$i];
        die "fullscreen module path" unless $a->{path} eq $expected[$i];
        die "Unsupported fullscreen driver input: $a->{path}" unless
            hash_file("$source/$a->{path}") eq $a->{inputSha256};
        die "Fullscreen bundled asset mismatch: $a->{path}" unless
            hash_file("$m->{fullscreenAssets}/$a->{path}") eq $a->{sha256};
    }
}
timing_phase('source-inventory-before');
my $before = inventory($source);
my $directory = tempdir('r2-XXXXXXXXXX', DIR => $parent, CLEANUP => 0);
my $copy = "$directory/wine";
my $ok = eval {
    timing_phase('clone');
    system('/bin/cp', '-cR', $source, $copy) == 0 or die "APFS runtime copy failed";
    timing_phase('copied-inventory');
    my $copied = inventory($copy);
    timing_phase('source-inventory-after');
    my $after = inventory($source);
    timing_phase('compare-inodes');
    die "runtime changed during preparation" unless
        $json->encode($before) eq $json->encode($after) &&
        $json->encode($before) eq $json->encode($copied);
    for my $p (keys %$copied) {
        next unless $copied->{$p}[0] eq 'file';
        my @a = stat($source . $p); my @b = stat($copy . $p);
        die "shared inode: $p" if $a[0] == $b[0] && $a[1] == $b[1];
    }
    timing_phase('patch-assets-signatures');
    if ($apply_r2 && !$game_mode && $input eq $m->{inputSha256}) {
        open(my $f, '<', $copy . $rel) or die "read ntdll: $!";
        binmode($f); local $/; my $bytes = <$f>; close($f) or die $!;
        die "ntdll size" unless length($bytes) == $m->{size};
        for my $change (@{$m->{changes}}) {
            my ($offset, $old, $new) = @$change;
            die "delta preimage" unless ord(substr($bytes, $offset, 1)) == $old;
            substr($bytes, $offset, 1) = chr($new);
        }
        die "delta output" unless sha256_hex($bytes) eq $m->{outputSha256};
        open(my $out, '>', $copy . $rel) or die "write ntdll: $!";
        binmode($out); print {$out} $bytes or die $!; close($out) or die $!;
    }
    if ($game_mode) {
        my $asset = $game_mode->{ntdll}{$apply_r2 ? 'r2' : 'plain'};
        copy("$game_assets/$asset->{path}", $copy . $rel) or die "copy Game Mode ntdll: $!";
        $copied->{$rel}[2] = $asset->{size};
        for my $a (@{$game_mode->{files}}) {
            next if $a->{path} eq 'ntdll.so' || $a->{path} eq 'ntdll-r2.so';
            my $asset_path = encode_utf8($a->{path});
            my $path = $asset_path;
            if ($path =~ m{^hosts/}) {
                next unless index($path, "$game_host/") == 0;
                $path = basename($game_host) . '/' . substr($path, length($game_host) + 1);
            }
            my $p = "/lib/wine/x86_64-unix/$path";
            for my $dir (make_path(dirname($copy . $p))) {
                $copied->{substr($dir, length($copy))} = ['directory', (stat($dir))[2] & 07777];
            }
            copy("$game_assets/$asset_path", $copy . $p) or die "copy Game Mode asset: $!";
            chmod($a->{mode}, $copy . $p) or die "Game Mode asset permissions: $!";
            $copied->{$p} = ['file', $a->{mode}, $a->{size}, $a->{sha256}];
        }
        my $request = '/lib/wine/x86_64-unix/yaagl-game-mode.request';
        open(my $f, '>', $copy . $request) or die "create Game Mode request: $!";
        chmod(0600, $copy . $request) or die $!;
        print {$f} "YAAGL-HK4E-GAME-MODE-1\n$game_prefix\n$game_target\n$game_stat[0] $game_stat[1]\n$output\n" or die $!;
        close($f) or die $!;
        $copied->{$request} = ['file', 0600, (stat($copy . $request))[7], hash_file($copy . $request)];
        system('/usr/bin/codesign', '--verify', '--strict', "$copy/lib/wine/x86_64-unix/" . basename($game_host)) == 0
            or die "Prepared Game Mode host signature invalid";
    }
    die "R2 artifact mismatch" unless hash_file($copy . $rel) eq $output;
    system('/usr/bin/codesign', '--verify', '--strict', $copy . $rel) == 0
        or die "R2 signature invalid";
    $copied->{$rel}[3] = $output;
    if ($m->{fullscreen}) {
        for my $a (@{$m->{fullscreen}{outputs}}) {
            my $p = $a->{path};
            copy("$m->{fullscreenAssets}/$p", "$copy/$p") or die "copy driver: $!";
            die "Fullscreen output mismatch: $p" unless hash_file("$copy/$p") eq $a->{sha256};
            if ($a->{signed}) {
                system('/usr/bin/codesign', '--verify', '--strict', "$copy/$p") == 0
                    or die "Fullscreen signature invalid";
            }
            $copied->{"/$p"}[2] = $a->{size};
            $copied->{"/$p"}[3] = $a->{sha256};
        }
    }
    timing_phase('output-inventory');
    die "prepared runtime mismatch" unless $json->encode($copied) eq $json->encode(inventory($copy));
    timing_phase('receipt');
    my $receipt = {schema => 1, source => $source, runtime => $copy,
        inputSha256 => $input, outputSha256 => $output,
        fullscreen => $m->{fullscreen},
        gameMode => $game_mode,
        manifestSha256 => sha256_hex($manifest_json), files => $copied};
    open(my $out, '>', "$directory/receipt.json.tmp") or die $!;
    print {$out} $json->encode($receipt) or die $!; close($out) or die $!;
    rename("$directory/receipt.json.tmp", "$directory/receipt.json") or die $!;
    print "$copy\n";
    $timing_done = 1;
    1;
};
if (!$ok) {
    my $error = $@;
    # No Wine process can have received this unpublished unique path.
    remove_tree($directory);
    die $error;
}
