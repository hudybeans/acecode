#!/usr/bin/env python3
"""Exercise the real helper's protocol/lifetime without capturing or injecting input."""
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
import unittest

HELPER = str(Path(sys.argv.pop(1)).resolve())

def read_line(process, timeout=5):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(timeout):
            raise AssertionError('helper response timed out')
    line = process.stdout.readline()
    if not line:
        raise AssertionError('helper closed without a response')
    return json.loads(line)

def send(process, request):
    process.stdin.write(json.dumps(request) + '\n')
    process.stdin.flush()
    return read_line(process)

class HelperProtocol(unittest.TestCase):
    def worker(self):
        child = subprocess.Popen([HELPER], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True)
        def cleanup():
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)
            child.stdin.close()
            child.stdout.close()
            child.stderr.close()
        self.addCleanup(cleanup)
        return child

    def test_protocol_bounds_and_invalid_observation(self):
        child = self.worker()
        child.stdin.write('invalid json\n')
        child.stdin.flush()
        self.assertEqual(read_line(child)['error'], 'invalid_json')
        self.assertEqual(send(child, {'protocol_version': 2})['error'], 'protocol_mismatch')
        reply = send(child, {'protocol_version': 1, 'action': 'click', 'window': 1,
                             'observation_id': 'forged', 'x': 1, 'y': 1})
        self.assertEqual(reply['error'], 'stale_observation')
        child.stdin.write('x' * (256 * 1024 + 1) + '\n')
        child.stdin.flush()
        self.assertEqual(read_line(child)['error'], 'request_too_large')
        self.assertEqual(child.wait(timeout=3), 3)

    def test_exclusive_lease_released_after_shutdown(self):
        first = self.worker()
        self.assertTrue(send(first, {'protocol_version': 1, 'action': 'release'})['success'])
        second = self.worker()
        busy = send(second, {'protocol_version': 1, 'action': 'release'})
        self.assertEqual(busy['output']['error'], 'COMPUTER_USE_BUSY')
        second.wait(timeout=3)
        first.terminate()
        first.wait(timeout=3)
        third = self.worker()
        self.assertTrue(send(third, {'protocol_version': 1, 'action': 'release'})['success'])

    def test_parent_death_terminates_idle_worker_and_releases_lease(self):
        code = '''import subprocess, sys, json, os
p = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
p.stdin.write('{"protocol_version":1,"action":"release"}\\n'); p.stdin.flush()
assert json.loads(p.stdout.readline())["success"]
print(p.pid, flush=True)
os._exit(0)
'''
        parent = subprocess.run([sys.executable, '-c', code, HELPER], capture_output=True, text=True, timeout=5)
        self.assertEqual(parent.returncode, 0, parent.stderr)
        pid = int(parent.stdout.strip())
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True)
            if result.returncode != 0 or result.stdout.strip().startswith('Z'):
                break
            time.sleep(0.05)
        else:
            os.kill(pid, 9)
            self.fail('worker survived its parent')
        child = self.worker()
        self.assertTrue(send(child, {'protocol_version': 1, 'action': 'release'})['success'])

    def test_permission_probe_does_not_take_desktop_lease(self):
        child = self.worker()
        self.assertTrue(send(child, {'protocol_version': 1, 'action': 'release'})['success'])
        probe = subprocess.run([HELPER, '--permissions'], capture_output=True, text=True, timeout=5)
        self.assertEqual(probe.returncode, 0, probe.stderr)
        output = json.loads(probe.stdout)['output']
        self.assertIn(output['accessibility'], ['granted', 'required'])
        self.assertIn(output['screen_recording'], ['granted', 'required'])
        self.assertTrue(send(child, {'protocol_version': 1, 'action': 'release'})['success'])

if __name__ == '__main__':
    unittest.main()
