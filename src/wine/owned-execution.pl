use strict;
use warnings;
use POSIX qw(WNOHANG _exit);
use Fcntl qw(F_SETFL O_NONBLOCK F_SETFD FD_CLOEXEC);
use Errno qw(EAGAIN EINTR);
use Time::HiRes qw(clock_gettime CLOCK_MONOTONIC sleep);
use JSON::PP qw(encode_json);

# This parent is the ONLY reaper. A positive child PID remains reserved until
# waitpid consumes it. Never signal after reaping or after a waitpid error.
# No process groups, image-name lookup, wineserver shutdown, or detached work.
my ($directory, $grace_ms, @command) = @ARGV;
my ($pid, $status, $error, $spawned, $confirmed) = (0, 0, '', 0, 1);
my ($stopping, $term_at, $killed) = (0, undef, 0);
$SIG{CHLD} = 'DEFAULT';
$SIG{TERM} = $SIG{INT} = $SIG{HUP} = sub { $stopping = 1; };
$SIG{PIPE} = 'IGNORE';
my ($reader, $writer);
eval {
    pipe($reader, $writer) or die "pipe: $!";
    fcntl($writer, F_SETFD, FD_CLOEXEC) or die "cloexec: $!";
    fcntl($reader, F_SETFL, O_NONBLOCK) or die "nonblock: $!";
    # A stop deposited before the native request begins prevents child creation.
    if (!-e "$directory/stop") {
        $pid = fork();
        defined($pid) or die "fork: $!";
        if ($pid == 0) {
            close($reader);
            $SIG{TERM} = $SIG{INT} = $SIG{HUP} = 'DEFAULT';
            my $ok = open(STDIN, '<', '/dev/null') &&
                     open(STDOUT, '>', '/dev/null') &&
                     open(STDERR, '>', '/dev/null');
            if ($ok) { exec { $command[0] } @command; }
            syswrite($writer, "exec: $!");
            _exit(127);
        }
        $confirmed = 0;
    }
};
$error = "$@" if $@;
close($writer) if $writer;
my ($exec_error, $exec_checked) = ('', 0);
while ($pid && !$confirmed) {
    # No other code or signal handler calls wait/waitpid. On 0, even a child
    # exiting immediately afterwards is an unreaped zombie, not a reusable PID.
    my $waited = waitpid($pid, WNOHANG);
    if ($waited == $pid) { $status = $?; $confirmed = 1; }
    elsif ($waited < 0) {
        next if $! == EINTR;
        $error ||= "waitpid: $!";
        last; # Ownership is uncertain: do not signal this number ever again.
    }
    if (!$exec_checked) {
        my $n = sysread($reader, my $chunk, 4096);
        if (defined($n)) {
            $exec_error .= $chunk;
            if ($n == 0) {
                $exec_checked = 1;
                if ($exec_error ne '') { $error ||= $exec_error; }
                else {
                    $spawned = 1;
                    eval {
                        open(my $ready, '>', "$directory/ready") or die "ready: $!";
                        print {$ready} "ready" or die "ready write: $!";
                        close($ready) or die "ready close: $!";
                    };
                    $error ||= "$@" if $@;
                }
            }
        }
        elsif ($! != EAGAIN && $! != EINTR) { $error ||= "exec observation: $!"; }
    }
    last if $confirmed;
    $stopping = 1 if -e "$directory/stop" || $error ne '';
    if ($stopping) {
        my $now = clock_gettime(CLOCK_MONOTONIC);
        if (!defined($term_at)) {
            $term_at = $now;
            kill('TERM', $pid) == 1 or $error ||= "TERM: $!";
        }
        elsif (!$killed && ($now - $term_at) * 1000 >= $grace_ms) {
            $killed = 1;
            kill('KILL', $pid) == 1 or $error ||= "KILL: $!";
        }
    }
    sleep(0.1);
}
close($reader) if $reader;
$error ||= $exec_error if $exec_error ne '';
print encode_json({ spawned => $spawned ? 1 : 0, confirmed => $confirmed ? 1 : 0,
                    status => $status, error => $error });
