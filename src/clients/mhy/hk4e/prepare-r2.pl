use strict;
use warnings;
use Cwd qw(abs_path);
use Digest::SHA qw(sha256_hex);
use File::Find;
use File::Temp qw(tempdir);
use File::Path qw(make_path remove_tree);
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
    if ($input eq $m->{inputSha256}) {
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
    die "R2 artifact mismatch" unless hash_file($copy . $rel) eq $m->{outputSha256};
    system('/usr/bin/codesign', '--verify', '--strict', $copy . $rel) == 0
        or die "R2 signature invalid";
    $copied->{$rel}[3] = $m->{outputSha256};
    die "prepared runtime mismatch" unless $json->encode($copied) eq $json->encode(inventory($copy));
    my $receipt = {schema => 1, source => $source, runtime => $copy,
        inputSha256 => $input, outputSha256 => $m->{outputSha256},
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
