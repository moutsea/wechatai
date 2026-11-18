"""Release control-flow tests with simulated systemd and service processes."""
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve() / 'opt'
        self.data = Path(self.temporary.name).resolve() / 'accounts'
        self.data.mkdir()
        self.incoming = Path('/tmp/wechatai-release.' + secrets.token_hex(5))
        self.incoming.mkdir(mode=0o700)
        self.addCleanup(lambda: release.shutil.rmtree(self.incoming, ignore_errors=True))
        self.commit = 'a' * 40
        binary = b'fake binary; no executable is launched in these tests'
        manifest = dict(format=1, commit=self.commit, version=self.commit, dirty=False,
                        os='linux', arch='amd64', binary='wechatai', protocol=release.PROTOCOL,
                        sha256=hashlib.sha256(binary).hexdigest())
        (self.incoming / 'wechatai').write_bytes(binary)
        (self.incoming / 'manifest.json').write_text(json.dumps(manifest))
        self.commands = []
        handle = patch.object(release, 'ROOT', self.root)
        handle.start()
        self.addCleanup(handle.stop)
        env = patch.dict(os.environ, {'SUDO_UID': str(os.getuid())})
        env.start()
        self.addCleanup(env.stop)
        root = patch.object(release.os, 'geteuid', return_value=0)
        root.start()
        self.addCleanup(root.stop)
        arch = patch.object(release.platform, 'machine', return_value='x86_64')
        arch.start()
        self.addCleanup(arch.stop)

    def service(self, binary, command, *args):
        self.commands.append((str(binary), command, *args))
        stdout = json.dumps(dict(version=self.commit, protocol=release.PROTOCOL)) if command == 'version' else '{}'
        return release.subprocess.CompletedProcess([], 0, stdout=stdout)

    def system(self, args, **kwargs):
        self.commands.append(tuple(args))
        if args[0] == 'systemd-run':
            self.assertIn('EnvironmentFile=/etc/wechatai/backend.env', args)
            self.assertIn('User=wechatai', args)
            self.assertEqual(args[-1], 'deployment-settings')
            return release.subprocess.CompletedProcess(args, 0, stdout=json.dumps(
                {'dataDir': str(self.data), 'healthOrigin': 'http://[::1]:9123'}))
        return release.subprocess.CompletedProcess(args, 0)

    def test_incomplete_backend_is_rejected_before_service_stop(self):
        def service(binary, command, *args):
            if command == 'check-ready':
                raise release.subprocess.CalledProcessError(1, [str(binary), command])
            return self.service(binary, command, *args)
        with patch.object(release, 'as_service', side_effect=service), patch.object(release, 'run', side_effect=self.system):
            with self.assertRaises(release.subprocess.CalledProcessError):
                release.install(self.incoming)
        self.assertFalse((self.root / 'current').exists())
        self.assertFalse(any(item[0] == 'systemctl' for item in self.commands))

    def test_standby_uses_its_own_preflight_and_health(self):
        settings = {'standby': True, 'dataDir': str(self.data), 'healthOrigin': 'http://127.0.0.1:8088'}
        with patch.object(release, 'deployment_settings', return_value=settings), patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health') as health:
            release.install(self.incoming)
        commands = [cmd[1] for cmd in self.commands]
        self.assertEqual(commands.count('check-standby'), 2)
        self.assertNotIn('check-ready', commands)
        health.assert_called_once_with(self.commit, settings['healthOrigin'], standby=True)

    def test_first_install_starts_an_inactive_unit_without_failure_state(self):
        def system(args, **kwargs):
            if args[1] == 'reset-failed':
                raise release.subprocess.CalledProcessError(1, args)
            if args[1] == 'show':
                return release.subprocess.CompletedProcess(args, 0, stdout="inactive\n")
            return self.system(args, **kwargs)
        with patch.object(release, 'run', side_effect=system):
            release.start_service()
        self.assertEqual(self.commands, [('systemctl', 'start', release.UNIT)])

    def test_bad_data_directory_is_rejected_before_stop(self):
        def service(binary, command, *args):
            if command == 'check-data':
                raise release.subprocess.CalledProcessError(1, [str(binary), command])
            return self.service(binary, command, *args)
        with patch.object(release, 'as_service', side_effect=service), patch.object(release, 'run', side_effect=self.system):
            with self.assertRaises(release.subprocess.CalledProcessError):
                release.install(self.incoming)
        self.assertFalse(any(item[0] == 'systemctl' for item in self.commands))

    def test_interrupted_install_does_not_become_rollback_candidate(self):
        unverified = self.root / 'releases' / ('b' * 40)
        unverified.mkdir(parents=True)
        (self.root / 'current').symlink_to(unverified)
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health', side_effect=RuntimeError('unhealthy')) as probe:
            with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
                release.install(self.incoming)
        self.assertFalse((self.root / 'current').is_symlink())
        self.assertFalse((self.root / 'last-healthy').is_symlink())
        self.assertEqual([c.args[0] for c in probe.call_args_list], [unverified.name, self.commit])

    def test_success_checks_data_again_after_stopping_old_service(self):
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health') as health:
            release.install(self.incoming)
        stop = self.commands.index(('systemctl', 'stop', release.UNIT))
        start = self.commands.index(('systemctl', 'start', release.UNIT))
        self.assertTrue(any(item[1:] == ('check-data', str(self.data)) for item in self.commands[:stop]))
        self.assertTrue(any(item[1:] == ('check-data', str(self.data)) for item in self.commands[stop + 1:start]))
        self.assertEqual((self.root / 'current').resolve().name, self.commit)
        health.assert_called_once_with(self.commit, 'http://[::1]:9123')

    def test_failed_first_release_removes_current_and_can_retry(self):
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health', side_effect=RuntimeError('not ready')):
            with self.assertRaisesRegex(RuntimeError, 'not ready'):
                release.install(self.incoming)
        self.assertFalse((self.root / 'current').is_symlink())
        self.assertFalse((self.root / 'last-healthy').is_symlink())
        self.assertEqual(self.commands[-1], ('systemctl', 'stop', release.UNIT))
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health'):
            release.install(self.incoming)
        self.assertEqual((self.root / 'current').resolve().name, self.commit)

    def test_health_uses_configured_origin_for_both_probes(self):
        seen = []
        commit = self.commit

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(self.path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "version": commit}).encode())

            def log_message(self, *_):
                pass

        with http.server.HTTPServer(('127.0.0.1', 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                release.health(commit, f'http://127.0.0.1:{server.server_port}')
            finally:
                server.shutdown()
                thread.join()
        self.assertEqual(seen, ['/healthz', '/readyz'])

    def test_failed_readiness_rolls_back_only_after_compatibility_check(self):
        previous = self.root / 'releases' / ('b' * 40)
        previous.mkdir(parents=True)
        (previous / 'wechatai').write_bytes(b'old binary')
        (self.root / 'current').symlink_to(previous)
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health', side_effect=[None, RuntimeError('candidate failed'), None]) as health:
            with self.assertRaises(RuntimeError):
                release.install(self.incoming)
        self.assertEqual((self.root / 'current').resolve(), previous)
        self.assertEqual(self.commands[-3:], [(str(previous / 'wechatai'), 'check-data', str(self.data)),
                                             ('systemctl', 'reset-failed', release.UNIT),
                                             ('systemctl', 'start', release.UNIT)])
        self.assertEqual([c.args for c in health.call_args_list], [(previous.name, 'http://[::1]:9123'), (self.commit, 'http://[::1]:9123'), (previous.name, 'http://[::1]:9123')])
        with patch.object(release, 'as_service', side_effect=self.service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health', side_effect=RuntimeError('probe failed')):
            with self.assertRaisesRegex(RuntimeError, 'Rollback to .* failed'):
                release.install(self.incoming)

    def test_incompatible_rollback_leaves_service_stopped(self):
        previous = self.root / 'releases' / ('b' * 40)
        previous.mkdir(parents=True)
        (previous / 'wechatai').write_bytes(b'old binary')
        (self.root / 'current').symlink_to(previous)
        (self.root / 'last-healthy').symlink_to(previous)
        def service(binary, command, *args):
            if binary == previous / 'wechatai' and command == 'check-data':
                raise release.subprocess.CalledProcessError(1, [str(binary), command])
            return self.service(binary, command, *args)
        with patch.object(release, 'as_service', side_effect=service), patch.object(release, 'run', side_effect=self.system), patch.object(release, 'health', side_effect=RuntimeError('simulated health failure')):
            with self.assertRaises(release.subprocess.CalledProcessError):
                release.install(self.incoming)
        self.assertEqual(self.commands[-1], ('systemctl', 'stop', release.UNIT))
        self.assertFalse((self.root / 'current').is_symlink())
        self.assertEqual((self.root / 'last-healthy').resolve(), previous)


if __name__ == '__main__':
    unittest.main()
