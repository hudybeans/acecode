import readline from 'node:readline';
import fs from 'node:fs';
const pidIndex = process.argv.indexOf('--pid-file');
if (pidIndex >= 0) fs.writeFileSync(process.argv[pidIndex + 1], JSON.stringify({ pid: process.pid, argv: process.argv }));
const input = readline.createInterface({ input: process.stdin });
const emit = frame => process.stdout.write(JSON.stringify(frame) + '\n');
let state = 'disconnected';
const account = '100@s.whatsapp.net';
emit({ event: 'ready', protocol: 1 });
input.on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (method === 'hang') return;
  if (method === 'exit') process.exit(1);
  if (method === 'malformed') { process.stdout.write('not json\n'); return; }
  if (method === 'oversized') { process.stdout.write('x'.repeat(300000)); return; }
  if (method === 'connect') { state = 'connected'; emit({ event: 'status', state, account }); }
  if (method === 'disconnect') state = 'disconnected';
  if (method === 'inject') emit({ event: 'message', ...params });
  emit({ id, ok: true, result: ['status', 'connect', 'disconnect'].includes(method) ? { state, account } : params });
});
input.on('close', () => process.exit(0));
