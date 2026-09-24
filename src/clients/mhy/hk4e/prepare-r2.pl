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
use Fcntl qw(O_RDONLY O_NOFOLLOW);

# All paths are argv data. A fresh private copy is never selected before the
# complete receipt is committed. Abandoned preparations are never reused.
my ($source, $parent, $manifest_json) = @ARGV;
my $m = decode_json($manifest_json);
die "absolute canonical runtime required" unless defined($source) &&
    $source =~ m{^/} && abs_path($source) eq $source && -d $source;
die "absolute preparation parent required" unless defined($parent) && $parent =~ m{^/};
make_path($parent, {mode => 0700});
die "noncanonical preparation parent" unless abs_path($parent) eq $parent;

sub hash_file {
    my ($path) = @_;
    sysopen(my $f, $path, O_RDONLY | O_NOFOLLOW) or die "open $path: $!";
    die "not regular: $path" unless -f $f;
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
my ($game_target, $game_prefix, @game_stat);
if ($game_mode) {
    die "Game Mode requires fullscreen/compatible manifest" unless $m->{fullscreen} && $game_mode->{schema} == 1 &&
        $game_mode->{bundleIdentifier} eq 'com.zh0ngy1l1.yaagl.hk4e-game';
    die "Unsupported Game Mode loader input" unless
        hash_file("$source/lib/wine/x86_64-unix/wine") eq $game_mode->{inputLoaderSha256};
    for my $a (@{$game_mode->{files}}) {
        die "Game Mode asset path" if $a->{path} =~ m{(?:^/|(?:^|/)\.\.(?:/|$))};
        die "Game Mode bundled asset mismatch: $a->{path}" unless
            hash_file("$m->{gameModeAssets}/$a->{path}") eq $a->{sha256};
    }
    system('/usr/bin/codesign', '--verify', '--strict', "$m->{gameModeAssets}/YAAGL HK4E.app") == 0
        or die "Game Mode host signature invalid";
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
my $before = inventory($source);
my $directory = tempdir('r2-XXXXXXXXXX', DIR => $parent, CLEANUP => 0);
my $copy = "$directory/wine";
my $ok = eval {
    system('/bin/cp', '-cR', $source, $copy) == 0 or die "APFS runtime copy failed";
    my $copied = inventory($copy);
    die "runtime changed during preparation" unless
        $json->encode($before) eq $json->encode(inventory($source)) &&
        $json->encode($before) eq $json->encode($copied);
    for my $p (keys %$copied) {
        next unless $copied->{$p}[0] eq 'file';
        my @a = stat($source . $p); my @b = stat($copy . $p);
        die "shared inode: $p" if $a[0] == $b[0] && $a[1] == $b[1];
    }
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
        copy("$m->{gameModeAssets}/$asset->{path}", $copy . $rel) or die "copy Game Mode ntdll: $!";
        $copied->{$rel}[2] = $asset->{size};
        for my $a (@{$game_mode->{files}}) {
            next if $a->{path} eq 'ntdll.so' || $a->{path} eq 'ntdll-r2.so';
            my $p = "/lib/wine/x86_64-unix/$a->{path}";
            for my $dir (make_path(dirname($copy . $p))) {
                $copied->{substr($dir, length($copy))} = ['directory', (stat($dir))[2] & 07777];
            }
            copy("$m->{gameModeAssets}/$a->{path}", $copy . $p) or die "copy Game Mode asset: $!";
            chmod($a->{mode}, $copy . $p) or die "Game Mode asset permissions: $!";
            $copied->{$p} = ['file', $a->{mode}, $a->{size}, $a->{sha256}];
        }
        my $request = '/lib/wine/x86_64-unix/yaagl-game-mode.request';
        open(my $f, '>', $copy . $request) or die "create Game Mode request: $!";
        chmod(0600, $copy . $request) or die $!;
        print {$f} "YAAGL-HK4E-GAME-MODE-1\n$game_prefix\n$game_target\n$game_stat[0] $game_stat[1]\n$output\n" or die $!;
        close($f) or die $!;
        $copied->{$request} = ['file', 0600, (stat($copy . $request))[7], hash_file($copy . $request)];
        system('/usr/bin/codesign', '--verify', '--strict', "$copy/lib/wine/x86_64-unix/YAAGL HK4E.app") == 0
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
    die "prepared runtime mismatch" unless $json->encode($copied) eq $json->encode(inventory($copy));
    my $receipt = {schema => 1, source => $source, runtime => $copy,
        inputSha256 => $input, outputSha256 => $output,
        fullscreen => $m->{fullscreen},
        gameMode => $game_mode,
        manifestSha256 => sha256_hex($manifest_json), files => $copied};
    open(my $out, '>', "$directory/receipt.json.tmp") or die $!;
    print {$out} $json->encode($receipt) or die $!; close($out) or die $!;
    rename("$directory/receipt.json.tmp", "$directory/receipt.json") or die $!;
    print "$copy\n";
    1;
};
if (!$ok) {
    my $error = $@;
    # No Wine process can have received this unpublished unique path.
    remove_tree($directory);
    die $error;
}
