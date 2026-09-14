# Executed inline by the foreground administrator request. Never execute a
# helper file from the caller's writable directory with elevated privileges.
use strict;
use warnings;
use Fcntl qw(:DEFAULT :flock :seek);
use IO::Handle;
use JSON::PP qw(encode_json);
use Time::HiRes qw(time sleep);

# BEGIN PURE HOSTS POLICY
sub launch_fix_addition {
    my ($before, $domain, $token) = @_;
    for my $line (split /\n/, $before) {
        $line =~ s/#.*\z//;
        my @parts = split /\s+/, $line;
        shift @parts if @parts && $parts[0] eq '';
        return '' if @parts > 1 && shift(@parts) eq '0.0.0.0' &&
            grep { lc($_) eq $domain } @parts;
    }
    return (length($before) && $before !~ /\n\z/ ? "\n" : '') .
        "# Temporarily Added by Yaagl $token\n0.0.0.0 $domain\n# End of Yaagl $token\n";
}
sub launch_fix_restore {
    my ($current, $expected, $before) = @_;
    die "Hosts changed concurrently; restoration retained" unless $current eq $expected;
    return $before;
}
# END PURE HOSTS POLICY

# BEGIN INJECTED RESTORATION CONTROL
# All effects are callbacks so the real control flow can be tested with only
# in-memory operations. Failed publication never abandons retained host state.
sub launch_fix_publish_until {
    my ($publish, $pause, $report) = @_;
    my $reported = 0;
    for (;;) {
        my $text;
        my $ok = eval { $text = $publish->(); 1; };
        return $text if $ok;
        my $failure = "$@";
        if (!$reported) {
            $report->("Launch Fix record publication failed; retained helper: $failure");
            $reported = 1;
        }
        $pause->();
    }
}
sub launch_fix_restore_until {
    my ($restore, $publish, $command, $pause, $report, $token, $attempt) = @_;
    for (;;) {
        return if eval { $restore->(); 1; };
        my $failure = "$@";
        # Retry only record publication automatically. Host writes require the
        # explicit next request after the failure record becomes observable.
        launch_fix_publish_until(sub { $publish->($failure); }, $pause, $report);
        my $next = $$attempt + 1;
        $pause->() until $command->() eq "$token retry $next\n";
        $$attempt = $next;
    }
}
# END INJECTED RESTORATION CONTROL

my ($directory, $domain, $token) = @ARGV;
die "Invalid Launch Fix arguments" unless @ARGV == 3 &&
    $directory =~ m{\A/tmp/yaagl-launch-fix\.[A-Za-z0-9]{10}\z} &&
    $domain =~ /\A[a-z0-9.-]+\z/ && $token =~ /\A[0-9a-f]{64}\z/;
sysopen(my $request_directory, $directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    or die "Cannot retain Launch Fix directory: $!";
my @directory_identity = stat($request_directory);
die "Unsafe Launch Fix directory permissions" unless
    @directory_identity && ($directory_identity[2] & 0777) == 0700;
chdir($request_directory) or die "Cannot enter retained Launch Fix directory: $!";
# Records can be read by the owning launcher through its private 0700 directory.
# Permissions, owner and inode stay unchanged; content writes update timestamps.
umask(0022);
my $hosts = '/etc/hosts';
my ($file, @identity, $before, $expected);
my $opened = 0;
my ($changed, $attempt, $finish, $error) = (0, 0, 0, '');
$SIG{INT} = $SIG{TERM} = $SIG{HUP} = sub { $finish = 1; };

sub write_record {
    my ($name, $text) = @_;
    my $temporary = "$name.$$";
    sysopen(my $record, $temporary, O_WRONLY | O_CREAT | O_EXCL, 0644)
        or die "Cannot create Launch Fix record: $!";
    my @owned = stat($record);
    my $ok = eval {
        my $offset = 0;
        while ($offset < length($text)) {
            my $count = syswrite($record, $text, length($text) - $offset, $offset);
            die "Cannot write Launch Fix record: $!" unless defined($count) && $count > 0;
            $offset += $count;
        }
        $record->sync or die "Cannot sync Launch Fix record: $!";
        close($record) or die "Cannot close Launch Fix record: $!";
        rename($temporary, $name) or die "Cannot publish Launch Fix record: $!";
        1;
    };
    if (!$ok) {
        my $failure = "$@";
        close($record) if defined(fileno($record));
        # Remove only our incomplete temporary inode, so a transient I/O error
        # does not permanently prevent later publication through O_EXCL.
        my @current = lstat($temporary);
        unlink($temporary) if @owned && @current && !-l $temporary &&
            $current[0] == $owned[0] && $current[1] == $owned[1];
        die $failure;
    }
}
sub status {
    my ($phase, $detail) = @_;
    my $text = encode_json({version => 1, token => $token, phase => $phase,
        changed => $changed, attempt => $attempt, error => $detail});
    write_record('status.json', $text);
    return $text;
}
sub contents {
    sysseek($file, 0, SEEK_SET) == 0 or die "Cannot seek hosts: $!";
    my $text = '';
    for (;;) {
        my $count = sysread($file, my $part, 65536);
        die "Cannot read hosts: $!" unless defined($count);
        last if !$count;
        $text .= $part;
    }
    return $text;
}
sub same_file {
    my @current = stat($hosts);
    die "Hosts file identity changed; retained original descriptor" unless
        @current && $current[0] == $identity[0] && $current[1] == $identity[1];
}
sub command {
    sysopen(my $control, 'control', O_RDONLY | O_NOFOLLOW) or return '';
    my $count = sysread($control, my $line, 256);
    close($control);
    return defined($count) ? $line : '';
}

eval {
    sysopen($file, $hosts, O_RDWR | O_NOFOLLOW) or die "Cannot open hosts: $!";
    $opened = 1;
    @identity = stat($file);
    die "Hosts is not a regular file" unless -f $file;
    flock($file, LOCK_EX | LOCK_NB) or die "Hosts is already locked: $!";
    same_file();
    $before = $expected = contents();
    write_record('hosts.before', $before);
    my $addition = launch_fix_addition($before, $domain, $token);
    if (length($addition)) {
        same_file();
        die "Hosts changed before apply" unless contents() eq $before;
        sysseek($file, 0, SEEK_END) >= 0 or die "Cannot seek hosts append: $!";
        my $offset = 0;
        while ($offset < length($addition)) {
            my $count = syswrite($file, $addition, length($addition) - $offset, $offset);
            die "Cannot append hosts: $!" unless defined($count) && $count > 0;
            # Keep the exact partial after-image if a later write fails.
            $expected .= substr($addition, $offset, $count);
            $changed = 1;
            $offset += $count;
        }
        $file->sync or die "Cannot sync applied hosts: $!";
        die "Hosts changed during apply" unless contents() eq $expected;
    }
    write_record('hosts.applied', $expected);
    status('ready', '');
    # Preserve the existing ten-second Launch Fix interval. This is independent
    # of the FPS worker and ends early only for cooperative launch cancellation.
    my $until = time() + 10;
    while (!$finish && time() < $until) {
        last if command() eq "$token finish\n";
        sleep(0.05);
    }
    1;
} or $error = "$@";

my $pause = sub { sleep(0.05); };
my $report = sub {
    my ($detail) = @_;
    $error .= ($error ? "\n" : '') . $detail;
    warn "$detail\n";
};
launch_fix_restore_until(sub {
        if ($changed) {
            same_file();
            # Never replace concurrent edits or restore from caller-writable
            # evidence. The preimage and tracked partial writes stay in memory.
            launch_fix_restore(contents(), $expected, $before);
            # Our only mutation was append, including a tracked partial append.
            # Once the whole after-image matches, truncation is its exact inverse.
            truncate($file, length($before)) or die "Cannot truncate restored hosts: $!";
            $expected = $before;
            $file->sync or die "Cannot sync restored hosts: $!";
            same_file();
            die "Hosts restoration verification failed" unless contents() eq $before;
        }
    }, sub { status('restore-error', $_[0]); }, sub { command(); },
    $pause, $report, $token, \$attempt);
my $final = launch_fix_publish_until(sub { status('restored', $error); }, $pause, $report);
close($file) or die "Cannot close hosts: $!" if $opened;
print $final;
