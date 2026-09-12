use strict;
use warnings;
use Test::More;
use JSON::PP qw(decode_json);
use Errno qw(ECHILD EPERM);
use Time::HiRes ();

# Execute the actual supervisor with fake syscalls. No child, signal, filesystem
# write or timing sleep is performed. The interpreter is just the test runner.
our ($active, $reaped, $time, $polls, $signal_failure, $stop_at, $fork_failure);
our (@waits, @signals, @exec_reads);
BEGIN {
    *CORE::GLOBAL::fork = sub {
        die 'unexpected fork' unless $main::active;
        return undef if $main::fork_failure;
        return 812;
    };
    *CORE::GLOBAL::waitpid = sub ($$) {
        die 'unexpected wait identity' unless $_[0] == 812 && !$main::reaped;
        $main::polls++;
        $SIG{TERM}->() if defined($main::stop_at) && $main::polls >= $main::stop_at;
        my $result = shift @main::waits;
        die 'test wait sequence exhausted' unless defined($result);
        $main::reaped = 1 if $result == 812;
        $! = ECHILD if $result < 0;
        $? = 256 if $result == 812;
        return $result;
    };
    *CORE::GLOBAL::kill = sub {
        die 'signal after reaping or wrong identity' if $main::reaped || $_[1] != 812 || @_ != 2;
        push @main::signals, [@_];
        $! = EPERM if $main::signal_failure;
        return $main::signal_failure ? 0 : 1;
    };
    *CORE::GLOBAL::sysread = sub (*$$;$) {
        my $chunk = shift(@main::exec_reads) // '';
        $_[1] = $chunk;
        return length($chunk);
    };
    *CORE::GLOBAL::open = sub (*;$@) {
        die 'unexpected file write' unless $main::active && $_[1] eq '>' && $_[2] =~ m{/ready$};
        my $memory = '';
        return CORE::open($_[0], '>', \$memory);
    };
}
{
    no warnings 'redefine';
    *Time::HiRes::sleep = sub (;@) { $time += $_[0]; };
    *Time::HiRes::clock_gettime = sub (;$) { return $time; };
}

sub simulate {
    my (%options) = @_;
    ($active, $reaped, $time, $polls) = (1, 0, 0, 0);
    $stop_at = $options{stop_at};
    $signal_failure = $options{signal_failure};
    $fork_failure = $options{fork_failure};
    @waits = @{$options{waits} // [812]};
    @exec_reads = @{$options{exec_reads} // []};
    @signals = ();
    my $output = '';
    {
        local @ARGV = ('/nonexistent-yaagl-unit-mailbox', 2000, '/not-executed/wine', '/not-executed/unlockfps.exe', '61');
        local *STDOUT;
        CORE::open(STDOUT, '>', \$output) or die $!;
        my $result = do './src/wine/owned-execution.pl';
        die $@ if $@;
        die $! unless defined($result);
    }
    $active = 0;
    return decode_json($output);
}

subtest 'normal child exit confirms its own wait and never signals' => sub {
    my $result = simulate(waits => [0, 812]);
    is($result->{confirmed}, 1);
    is($result->{spawned}, 1);
    is($result->{status}, 256);
    is_deeply(\@signals, []);
};
subtest 'stop and exit together reap before considering a signal' => sub {
    my $result = simulate(waits => [812], stop_at => 1);
    is($result->{confirmed}, 1);
    is_deeply(\@signals, []);
};
subtest 'TERM targets only the unreaped direct child' => sub {
    my $result = simulate(waits => [0, 812], stop_at => 1);
    is($result->{confirmed}, 1);
    is_deeply(\@signals, [['TERM', 812]]);
};
subtest 'KILL follows grace once and all waits remain on the same child' => sub {
    my $result = simulate(waits => [(0) x 25, 812], stop_at => 1);
    is($result->{confirmed}, 1);
    is_deeply(\@signals, [['TERM', 812], ['KILL', 812]]);
    cmp_ok($time, '>=', 2);
};
subtest 'wait failure loses permission to signal and cannot confirm cleanup' => sub {
    my $result = simulate(waits => [-1], stop_at => 1);
    is($result->{confirmed}, 0);
    like($result->{error}, qr/waitpid/);
    is_deeply(\@signals, []);
};
subtest 'exec failure is not an ordinary successfully spawned child exit' => sub {
    my $result = simulate(waits => [0, 0, 812], exec_reads => ['exec: denied', '']);
    is($result->{confirmed}, 1);
    is($result->{spawned}, 0);
    like($result->{error}, qr/exec: denied/);
};
subtest 'signal failure is preserved even when child eventually exits' => sub {
    my $result = simulate(waits => [0, 812], stop_at => 1, signal_failure => 1);
    is($result->{confirmed}, 1);
    like($result->{error}, qr/TERM/);
};
subtest 'fork failure cannot signal or wait on an invented PID' => sub {
    my $result = simulate(fork_failure => 1);
    is($result->{confirmed}, 1);
    is($result->{spawned}, 0);
    like($result->{error}, qr/fork/);
    is($polls, 0);
    is_deeply(\@signals, []);
};
done_testing();
