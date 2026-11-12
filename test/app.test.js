// -----------------------------------------------------------------------------
// The app against the SDK's fake Gladys, a scripted Kraken API and a virtual
// clock: pace, refusal, pauses, /data, Discovery, consumption, prices,
// delegated pricing, Intelligent devices, secrets.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHandlers } from '../src/handlers.js';
import { createMemoryStore } from '../src/store.js';
import { fromMadrid } from '../src/time.js';
import { keyOf } from '../src/kraken/model.js';
import { CONFIG, DAY, HOUR, MINUTE, createKraken, json, setup, written } from './helpers/app.js';
import * as K from './fixtures/kraken.js';

const statusText = (env) => env.fake.connectionStatus?.message?.en ?? '';
const KEY = keyOf(K.ID_KEY, 'cups', K.CUPS);
const F = (key, kind = 'cups', id = KEY) => `ext:octopus-spain:${kind}:${id}:${key}`;

/** The MaLo device as the user creates it from Discovery. */
const cupsDevice = (env) =>
  structuredClone(env.fake.discoveredDevices.find((d) => d.external_id.includes(':cups:')));

async function started(options = {}) {
  const env = await setup(options);
  registerHandlers(env.gladys, env.app, env.app.log);
  await env.start(options.config);
  return env;
}

test('start: one login, the account read, Discovery and status; the MaLo never written out', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  assert.deepEqual(
    env.kraken.calls.map((c) => c.op),
    ['token', 'accounts', 'account', 'billing'],
  );
  assert.equal(env.kraken.calls[2].variables.accountNumber, K.ACCOUNT_NUMBER);
  const [device] = env.fake.discoveredDevices;
  assert.equal(device.name, 'Octopus electricity (CUPS …JN0F)');
  assert.equal(device.external_id, `ext:octopus-spain:cups:${KEY}`);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').at(-1)),
    ['price', 'next_price', 'price_p1', 'price_p2', 'price_p3', 'surplus_price', 'consumption'],
  );
  assert.match(statusText(env), /^Connected: 1 electricity supply point/);
  assert.equal(env.fake.connectionStatus.connected, true);
  const out = written(env);
  for (const secret of [K.CUPS, K.PASSWORD, K.EMAIL, 'tok-', 'ref-', K.ACCOUNT_NUMBER]) {
    assert.ok(!out.includes(secret), `${secret} written out`);
  }
  assert.equal(env.store.data.meters[0].suffix, 'JN0F');
});

test('pace: the account every hour, never sooner; a restart waits for the rest', async (t) => {
  const store = createMemoryStore();
  const env = await started({ store });
  await env.wait(59 * MINUTE);
  assert.equal(env.kraken.count('accounts'), 1);
  await env.wait(1 * MINUTE + 1000);
  assert.equal(env.kraken.count('accounts'), 2);
  // One login; the token renewed before its end with the refresh token, never the password.
  const logins = env.kraken.calls.filter((c) => c.op === 'token');
  assert.deepEqual(
    logins.map((c) => Object.keys(c.variables.input).join()),
    ['email,password', 'refreshToken'],
  );
  // Discovery, the test button, a saved config: never a read of the account.
  await env.fake.scanRequest();
  await env.fake.configUpdated(CONFIG);
  await env.wait(1000);
  assert.equal(env.kraken.count('account'), 2);
  await env.app.stop();
  // A restart 10 minutes later: the next read 50 minutes after it.
  const later = await started({ store, now: env.clock.now + 10 * MINUTE });
  t.after(() => later.app.stop());
  assert.equal(later.kraken.count('accounts'), 0);
  assert.match(statusText(later), /^Starting: first read at/);
  await later.wait(49 * MINUTE);
  assert.equal(later.kraken.count('accounts'), 0);
  await later.wait(2 * MINUTE);
  assert.equal(later.kraken.count('accounts'), 1);
});

test('a time of /data in the future is ignored; /data unreadable waits a whole interval', async (t) => {
  const future = await started({ store: createMemoryStore({ lastAccount: K.NOW + DAY }) });
  t.after(() => future.app.stop());
  assert.equal(future.kraken.count('accounts'), 1);
  const store = createMemoryStore({});
  store.unreadable = true;
  const env = await started({ store });
  t.after(() => env.app.stop());
  assert.equal(env.kraken.count('accounts'), 0);
  assert.match(statusText(env), /\/data cannot be read/);
  await env.wait(59 * MINUTE);
  assert.equal(env.kraken.count('accounts'), 0);
  assert.equal(store.saves, 0, 'never written over');
  await env.wait(2 * MINUTE);
  assert.equal(env.kraken.count('accounts'), 1);
  assert.equal(store.saves, 0, 'never written over, even after a read');
});

test('refused login: no request until the credentials change or Test succeeds; kept across a restart', async () => {
  const store = createMemoryStore();
  const kraken = createKraken({ token: () => K.ktError('KT-CT-1138') });
  const env = await started({ store, kraken });
  assert.deepEqual(
    kraken.calls.map((c) => c.op),
    ['token'],
  );
  assert.match(statusText(env), /refused the login \(KT-CT-1138\)/);
  assert.equal(env.fake.connectionStatus.connected, false);
  assert.equal(env.app.roundTimer, null, 'no read even scheduled');
  for (const secret of [K.PASSWORD, K.EMAIL, 'kunde@example.com']) {
    assert.ok(!written(env).includes(secret), 'never in logs, statuses, /data');
  }
  await env.wait(3 * DAY);
  assert.equal(kraken.calls.length, 1, 'never tried again by itself');
  const kept = JSON.stringify(store.data);
  assert.ok(!kept.includes(K.PASSWORD) && !kept.includes(K.EMAIL));
  assert.ok(store.data.refused.tag >= 0 && store.data.refused.tag < 256, '8 bits at most');
  await env.app.stop();

  // Restart: still refused, nothing sent.
  const again = await started({ store, kraken, now: env.clock.now });
  await again.wait(2 * HOUR);
  assert.equal(kraken.calls.length, 1);
  // Another password: tried at once.
  kraken.answers.token = () => K.token();
  await again.fake.configUpdated({ ...CONFIG, password: 'another one' });
  await again.wait(1000);
  assert.equal(kraken.count('token'), 2, 'tried at once');
  await again.wait(MINUTE);
  assert.equal(kraken.count('accounts'), 1);
  assert.equal(store.data.refused, null);
  await again.app.stop();
});

test('refused login lifted by a successful Test, which is limited to once a minute', async (t) => {
  const kraken = createKraken({ token: () => K.ktError('KT-CT-1138') });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  // Same credentials, still refused at Octopus: the refusal stays.
  const first = await env.fake.action('test_connection');
  assert.match(first.data.message.en, /refused the login/);
  const soon = await env.fake.action('test_connection');
  assert.match(soon.data.message.en, /less than a minute/);
  assert.equal(kraken.count('token'), 2);
  kraken.answers.token = () => K.token();
  await env.wait(MINUTE);
  const ok = await env.fake.action('test_connection');
  assert.match(ok.data.message.en, /Login accepted: 1 account/);
  // The reads resume at their pace (5 minutes after the failed attempt).
  await env.wait(4 * MINUTE);
  assert.equal(kraken.count('account'), 1, 'the reads resume');
  assert.match(statusText(env), /^Connected/);
});

test('the refused tag: a brute force over /data cannot single out the password', async () => {
  const { tagOf } = await import('../src/app.js');
  const salt = '0123456789abcdef0123456789abcdef';
  const tag = tagOf(salt, { email: K.EMAIL, password: K.PASSWORD });
  let matches = 0;
  for (let i = 0; i < 4096; i += 1)
    if (tagOf(salt, { email: K.EMAIL, password: `guess-${i}` }) === tag) matches += 1;
  assert.ok(matches > 4, `${matches} other passwords share the tag`);
});

test('KT-CT-1136 (login blocked) is a pause of an hour, never a refusal', async (t) => {
  const store = createMemoryStore();
  const kraken = createKraken({ token: () => K.ktError('KT-CT-1136') });
  const env = await started({ store, kraken });
  t.after(() => env.app.stop());
  assert.match(statusText(env), /blocks the login for now/);
  assert.equal(store.data.refused, null);
  assert.equal(store.data.pause.code, 'login_blocked');
  await env.wait(59 * MINUTE);
  assert.equal(kraken.count('token'), 1);
  kraken.answers.token = () => K.token();
  await env.wait(2 * MINUTE);
  assert.equal(kraken.count('token'), 2);
  assert.equal(kraken.count('account'), 1);
  assert.equal(store.data.pause, null);
});

test('429: a pause of Retry-After for every request, persisted; then doubled', async (t) => {
  const store = createMemoryStore();
  const kraken = createKraken({
    accounts: () => new Response('', { status: 429, headers: { 'retry-after': '1800' } }),
  });
  const env = await started({ store, kraken });
  assert.match(statusText(env), /asked to slow down: next request at 10:37/);
  assert.equal(store.data.pause.code, 'rate_limited');
  await env.wait(MINUTE);
  const paused = await env.fake.action('test_connection');
  assert.match(paused.data.message.en, /Not sent: Octopus asked to wait until 10:37/);
  await env.wait(28 * MINUTE);
  assert.equal(kraken.count('accounts'), 1);
  assert.equal(kraken.count('token'), 1, 'the test sent nothing');
  await env.app.stop();
  // A restart during the pause keeps it; the read comes an interval after the last one.
  kraken.answers.accounts = () => K.ktError('KT-CT-1199');
  const again = await started({ store, kraken, now: env.clock.now });
  t.after(() => again.app.stop());
  assert.match(statusText(again), /asked to slow down/);
  await again.wait(30 * MINUTE);
  assert.equal(kraken.count('accounts'), 1);
  await again.wait(2 * MINUTE);
  assert.equal(kraken.count('accounts'), 2);
  // KT-CT-1199 without Retry-After, the second in a row: 15 min doubled.
  assert.equal(store.data.pause.count, 2);
  await again.wait(28 * MINUTE);
  assert.equal(kraken.count('accounts'), 2);
  kraken.answers.accounts = () => K.accounts();
  await again.wait(3 * MINUTE);
  assert.equal(kraken.count('accounts'), 3);
  assert.equal(store.data.pause, null, 'an answer ends the pause');
});

test('a 401 of the account query is never a refusal: one new login, then retried later', async (t) => {
  const kraken = createKraken({ account: () => new Response('{}', { status: 401 }) });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  assert.equal(env.store.data.refused, null);
  assert.equal(kraken.count('token'), 2);
  assert.match(statusText(env), /could not be read \(unauthorized\): next try at 10:12/);
  kraken.answers.account = () => K.account();
  await env.wait(5 * MINUTE + 1000);
  assert.match(statusText(env), /^Connected/);
});

test('failures: retried after 5, 10, 20, 40 then every 60 minutes', async (t) => {
  const kraken = createKraken({ accounts: () => 'timeout' });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  const at = [];
  for (let i = 0; i < 6 * 60; i += 1) {
    const before = kraken.count('accounts');
    await env.wait(MINUTE);
    if (kraken.count('accounts') > before) at.push(i + 1);
  }
  assert.deepEqual(at, [5, 15, 35, 75, 135, 195, 255, 315]);
});

test('getConfig failing in connected: retried, then started', async (t) => {
  const env = await setup();
  t.after(() => env.app.stop());
  const real = env.gladys.getConfig.bind(env.gladys);
  let fail = 1;
  env.gladys.getConfig = async () => {
    if (fail-- > 0) throw new Error('down');
    return real();
  };
  await env.app.connected();
  assert.match(statusText(env), /configuration could not be read/);
  assert.equal(env.kraken.calls.length, 0);
  await env.wait(5000);
  assert.match(statusText(env), /^Connected/);
});

test('the time of a read is in /data before the request leaves', async (t) => {
  const store = createMemoryStore();
  const kraken = createKraken({
    accounts: (call) =>
      new Promise((resolve, reject) =>
        call.signal.addEventListener('abort', () =>
          reject(new DOMException('stopped', 'AbortError')),
        ),
      ),
  });
  const env = await started({ store, kraken });
  t.after(() => env.app.stop());
  assert.equal(kraken.count('accounts'), 1, 'the request is in flight');
  assert.equal(store.data.lastAccount, K.NOW);
});

test('a time of /data in the future is never taken', async (t) => {
  const env = await setup();
  t.after(() => env.app.stop());
  env.app.merge({ lastAccount: K.NOW + HOUR, lastConsumption: K.NOW + DAY });
  assert.equal(env.app.data.lastAccount, null);
  assert.equal(env.app.data.lastConsumption, null);
  env.app.merge({ lastAccount: K.NOW - HOUR });
  assert.equal(env.app.data.lastAccount, K.NOW - HOUR);
});

test('several accounts: the first one, or the one entered; an unknown number is said', async (t) => {
  const kraken = createKraken({ accounts: () => K.accounts(['A-AAAA1111', K.ACCOUNT_NUMBER]) });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  assert.equal(kraken.calls.find((c) => c.op === 'account').variables.accountNumber, 'A-AAAA1111');
  assert.match(statusText(env), /several accounts/);
  await env.fake.configUpdated({ ...CONFIG, account_number: 'a-1b2c3d4e' });
  await env.wait(MINUTE);
  assert.equal(
    kraken.calls.filter((c) => c.op === 'account').at(-1).variables.accountNumber,
    K.ACCOUNT_NUMBER,
  );
  await env.fake.configUpdated({ ...CONFIG, account_number: 'A-ZZZZ9999' });
  await env.wait(MINUTE);
  assert.match(statusText(env), /not one of this login/);
});

test('config problems: nothing sent', async (t) => {
  for (const [config, text] of [
    [{}, /Enter an API key/],
    [{ email: K.EMAIL }, /nothing is sent with only one/],
    [{ password: K.PASSWORD }, /nothing is sent with only one/],
    [{ email: 'nobody', password: 'x' }, /does not look like one/],
    [{ ...CONFIG, account_number: 'xyz' }, /looks like A-1B2C3D4E/],
    [{ ...CONFIG, email: `${K.EMAIL}\r\nX: y` }, /control character/],
  ]) {
    const env = await started({ config });
    t.after(() => env.app.stop());
    await env.wait(2 * HOUR);
    assert.equal(env.kraken.calls.length, 0, JSON.stringify(config));
    assert.match(statusText(env), text);
    const answer = await env.fake.action('test_connection');
    assert.match(answer.data.message.en, text);
  }
});

test('stop: nothing is sent afterwards, no timer left that sends', async () => {
  const env = await started();
  await env.app.stop();
  const n = env.kraken.calls.length;
  await env.wait(3 * DAY);
  assert.equal(env.kraken.calls.length, n);
});

test('a slow answer of an old configuration publishes nothing', async (t) => {
  let release;
  const kraken = createKraken({
    account: (call) =>
      call.at === K.NOW
        ? new Promise((r) => (release = () => r(K.account({ malo: '50400000001' }))))
        : K.account(),
  });
  const env = await setup({ kraken });
  t.after(() => env.app.stop());
  registerHandlers(env.gladys, env.app, env.app.log);
  env.app.connected();
  await env.wait(0);
  assert.ok(release);
  await env.fake.configUpdated({ ...CONFIG, password: 'changed' });
  await env.wait(1000);
  release();
  await env.wait(1000);
  assert.ok(env.fake.discoveredDevices.every((d) => d.name.endsWith('…5678)')));
});

test('r1 I3: the MaLo key is an HMAC under a key kept in the Gladys config, never in /data', async (t) => {
  const { createHash } = await import('node:crypto');
  const store = createMemoryStore();
  const env = await started({ store, config: { email: K.EMAIL, password: K.PASSWORD } });
  t.after(() => env.app.stop());
  const idKey = env.fake.config.id_key;
  assert.match(idKey, /^[0-9a-f]{64}$/, 'made and stored in the Gladys config');
  const id = env.fake.discoveredDevices[0].external_id.split(':').at(-1);
  assert.equal(id, keyOf(idKey, 'cups', K.CUPS));
  assert.ok(!written(env).includes(idKey), 'the id key is not in /data, logs, statuses');
  // A brute force over CUPS ending in the 4 characters shown finds nothing without the key.
  const suffix = store.data.meters[0].suffix;
  let found = 0;
  for (let n = 0; n < 200_000; n += 1) {
    const candidate = `ES00314051234${String(n).padStart(5, '0')}${suffix}`;
    const plain = createHash('sha256')
      .update(`octopus-spain:cups:${candidate}`)
      .digest('hex')
      .slice(0, 16);
    if (plain === id || keyOf('00'.repeat(32), 'cups', candidate) === id) found += 1;
  }
  assert.equal(found, 0);
  // A restart with the stored key: the same ids.
  await env.app.stop();
  const again = await started({ store, config: env.fake.config });
  t.after(() => again.app.stop());
  assert.equal(again.fake.discoveredDevices[0].external_id.split(':').at(-1), id);
});

test('r2 I1: the id key not stored: spaced tries, no storm, a status naming Gladys', async (t) => {
  const env = await setup({ config: { email: K.EMAIL, password: K.PASSWORD } });
  t.after(() => env.app.stop());
  registerHandlers(env.gladys, env.app, env.app.log);
  let fail = true;
  let calls = 0;
  const real = env.gladys.setConfig.bind(env.gladys);
  env.gladys.setConfig = async (c) => {
    calls += 1;
    if (fail) throw new Error('down');
    return real(c);
  };
  await env.start({ email: K.EMAIL, password: K.PASSWORD });
  assert.equal(env.kraken.count('account'), 0);
  assert.deepEqual(env.fake.discoveredDevices, []);
  assert.match(statusText(env), /Gladys could not store the key of the device ids/);
  // The time said is the real next try: the next read of the account, 5 minutes later.
  assert.match(statusText(env), /Next try at 10:12\./);
  const tries = calls;
  await env.wait(4 * MINUTE + 50 * 1000);
  assert.equal(calls, tries, 'nothing before the time said');
  await env.wait(20 * 1000);
  assert.equal(calls, tries + 1, 'tried at the time said');
  assert.match(statusText(env), /Next try at 10:22\./);
  await env.wait(10 * MINUTE);
  assert.ok(calls >= 2 && calls <= 8, `${calls} setConfig in 10 minutes`);
  assert.ok(env.lines.length <= 2 * calls + 4, `${env.lines.length} log lines`);
  assert.equal(env.kraken.count('account'), 0, 'nothing read without the key');
  // Ten saves of the form in a row: the key is not tried at each one.
  const before = calls;
  for (let i = 0; i < 10; i += 1)
    await env.fake.configUpdated({ email: K.EMAIL, password: K.PASSWORD });
  assert.ok(calls - before <= 1, `${calls - before} setConfig for 10 saves`);
  fail = false;
  await env.wait(20 * MINUTE);
  assert.equal(env.kraken.count('account'), 1);
  assert.equal(env.fake.discoveredDevices.length, 2, 'the supply point and the account');
  assert.match(statusText(env), /^Connected/);
});

test('r2 I2: a form saved during the first setConfig: one key, the stored one, the same ids after a restart', async (t) => {
  const store = createMemoryStore();
  const env = await setup({ store, config: { email: K.EMAIL, password: K.PASSWORD } });
  t.after(() => env.app.stop());
  registerHandlers(env.gladys, env.app, env.app.log);
  const real = env.gladys.setConfig.bind(env.gladys);
  let release;
  let calls = 0;
  env.gladys.setConfig = (c) => {
    calls += 1;
    return new Promise((resolve) => (release = () => resolve(real(c))));
  };
  const first = env.start({ email: K.EMAIL, password: K.PASSWORD });
  await env.settle();
  // The form is saved while the key is being stored (no id_key in what it sends).
  const saved = env.fake.configUpdated({ email: K.EMAIL, password: K.PASSWORD });
  await env.settle();
  release();
  await first;
  await saved;
  await env.wait(1000);
  assert.equal(calls, 1, 'one key made');
  assert.equal(env.app.idKey, env.fake.config.id_key, 'the key in use is the stored one');
  const id = env.fake.discoveredDevices[0].external_id;
  await env.app.stop();
  const again = await started({ store, config: env.fake.config });
  t.after(() => again.app.stop());
  assert.equal(again.fake.discoveredDevices[0].external_id, id);
});

test('r2 I2: another id key than the one /data was kept with: what depends on the old one goes', async (t) => {
  const store = createMemoryStore();
  const env = await started({ store });
  await env.app.stop();
  assert.ok(Object.keys(store.data.prices).length === 1 && store.data.keyTag);
  const other = 'cd'.repeat(32);
  const again = await started({ store, config: { ...CONFIG, id_key: other } });
  t.after(() => again.app.stop());
  const key = keyOf(other, 'cups', K.CUPS);
  assert.deepEqual(again.app.data.prices, {}, 'the prices of the old keys gone');
  assert.deepEqual(again.app.data.meters, []);
  assert.deepEqual(again.fake.discoveredDevices, [], 'never a device of the old key offered');
  assert.equal(again.app.data.accountKey, null);
  await again.wait(HOUR + 1000);
  assert.deepEqual(Object.keys(store.data.prices), [key]);
  assert.deepEqual(
    store.data.meters.map((m) => m.key),
    [key],
  );
  assert.equal(again.fake.discoveredDevices.length, 2, 'never the same supply point twice');
});

test('r1 I4: the e-mail login refused by the schema: a status toward the API key, spaced tries', async (t) => {
  const store = createMemoryStore();
  const gone = () =>
    json(
      { errors: [{ message: "Field 'email' is not defined by type 'ObtainJSONWebTokenInput'." }] },
      400,
    );
  const kraken = createKraken({
    token: (call) => (call.variables.input.APIKey ? K.token() : gone()),
  });
  const env = await started({ store, kraken });
  t.after(() => env.app.stop());
  assert.match(
    statusText(env),
    /no longer accepts the login by e-mail address and password: enter an API key/,
  );
  assert.equal(store.data.refused, null, 'never a refusal');
  assert.equal(store.data.pause.code, 'login_gone');
  await env.wait(59 * MINUTE);
  assert.equal(kraken.count('token'), 1);
  await env.wait(2 * MINUTE);
  assert.equal(kraken.count('token'), 2, 'after 1 hour');
  await env.wait(117 * MINUTE);
  assert.equal(kraken.count('token'), 2);
  await env.wait(2 * MINUTE);
  assert.equal(kraken.count('token'), 3, 'then 2 hours');
  // An API key entered: tried at once, the login pause lifted.
  await env.fake.configUpdated({ ...CONFIG, api_key: 'sk_live_ABCDEFGHIJ' });
  await env.wait(MINUTE + 1000);
  assert.equal(kraken.count('account'), 1);
  assert.match(statusText(env), /^Connected/);
  // KT-CT-1113 (field disabled) is the same case.
  const disabled = createKraken({ token: () => K.ktError('KT-CT-1113') });
  const other = await started({ kraken: disabled });
  t.after(() => other.app.stop());
  assert.match(statusText(other), /no longer accepts the login/);
});

test('r1 I5: a Retry-After of years pauses 6 hours at most, also read back from /data', async (t) => {
  const { validPause } = await import('../src/app.js');
  const store = createMemoryStore();
  const kraken = createKraken({
    accounts: () => new Response('', { status: 429, headers: { 'retry-after': '1000000000' } }),
  });
  const env = await started({ store, kraken });
  t.after(() => env.app.stop());
  assert.ok(store.data.pause.until - K.NOW <= 6 * HOUR);
  const p = validPause({ until: K.NOW + 30 * DAY, count: 1, code: 'server' }, K.NOW, 1000);
  assert.equal(p.due, 1000 + 6 * HOUR);
  assert.equal(p.until, K.NOW + 6 * HOUR);
});

test('r1 I5: the refused tag depends on the password', async () => {
  const { tagOf } = await import('../src/app.js');
  const salt = '0123456789abcdef0123456789abcdef';
  const tags = new Set();
  for (let i = 0; i < 32; i += 1) tags.add(tagOf(salt, { email: K.EMAIL, password: `p-${i}` }));
  assert.ok(tags.size > 8);
});

test('r1 I5: getConfig failing after stop() arms nothing; nothing is sent', async () => {
  const env = await setup();
  let reject;
  const real = env.gladys.getConfig.bind(env.gladys);
  let first = true;
  env.gladys.getConfig = () => {
    if (!first) return real();
    first = false;
    return new Promise((_, r) => (reject = r));
  };
  const pending = env.app.connected();
  await env.settle();
  await env.app.stop();
  reject(new Error('down'));
  await pending;
  await env.wait(DAY);
  assert.equal(env.kraken.calls.length, 0);
  assert.equal(env.pending.size, 0, 'no timer left');
});

test('r1 m3: the current price of a contract is null when the tariff is stale', async (t) => {
  const kraken = createKraken({ account: () => K.account({ agreements: [K.goAgreement()] }) });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  kraken.answers.accounts = () => 'network';
  await env.wait(7 * HOUR);
  const ack = await env.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.equal(ack.data.price, null);
});

test('r1 m4: another account number alone never lifts a refusal', async (t) => {
  const kraken = createKraken({ token: () => K.ktError('KT-CT-1138') });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  await env.fake.configUpdated({ ...CONFIG, account_number: 'A-ZZZZ9999' });
  await env.wait(2 * HOUR);
  assert.equal(kraken.count('token'), 1);
  assert.match(statusText(env), /refused the login/);
});

test('r2 m3: a schema error of the login that does not name the e-mail or password is not "login gone"', async (t) => {
  const kraken = createKraken({
    token: () =>
      json({ errors: [{ message: "Cannot query field 'refreshExpiresIn' on type 'X'." }] }, 400),
  });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  assert.doesNotMatch(statusText(env), /no longer accepts/);
  assert.match(statusText(env), /could not be read \(graphql\)/);
});

// --- Spain: prices, contracts, consumption, balances ----------------------------

const ACCOUNT_KEY = keyOf(K.ID_KEY, 'account', K.ACCOUNT_NUMBER);
const accountDevice = (env) =>
  structuredClone(env.fake.discoveredDevices.find((d) => d.external_id.includes(':account:')));
const interval = (startsAt, kwh = 1) => ({ starts_at: startsAt, kwh, max_power_kw: 1 });
const price = (env, intervals, inputs = {}) =>
  env.fake.energyPrice({
    contract: { id: 'c', template_key: 'octopus-es-electricity', inputs },
    billing_period: {},
    cumulative_before: {},
    intervals,
  });

test('prices: the period price of a created device, published again at the quarter, no request', async (t) => {
  // 13:50 in Madrid on a Wednesday: punta until 14:00, then llano.
  const env = await started({ now: fromMadrid(2026, 11, 4, 13, 50) });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.settle();
  assert.equal(env.fake.lastState(F('price')), 0.201234);
  assert.equal(env.fake.lastState(F('next_price')), 0.151234);
  assert.equal(env.fake.lastState(F('price_p1')), 0.201234);
  assert.equal(env.fake.lastState(F('price_p2')), 0.151234);
  assert.equal(env.fake.lastState(F('price_p3')), 0.091234);
  assert.equal(env.fake.lastState(F('surplus_price')), 0.06);
  const requests = env.kraken.calls.length;
  await env.wait(11 * MINUTE);
  assert.equal(env.fake.lastState(F('price')), 0.151234);
  assert.equal(env.fake.lastState(F('next_price')), 0.201234, 'punta again at 18:00');
  const sent = env.kraken.calls.slice(requests).filter((c) => c.op !== 'readings');
  assert.deepEqual(sent, [], 'the ticks send nothing (only the consumption backfill)');
});

test('prices: the zone of the form sets the hours (Ceuta and Melilla an hour later)', async (t) => {
  const env = await started({ config: { ...CONFIG, zone: 'ceuta_melilla' } });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.settle();
  assert.equal(env.fake.lastState(F('price')), 0.151234, '10:07 is llano there');
});

test('prices: not published as current when read more than 6 hours ago', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.settle();
  env.kraken.answers.accounts = () => 'network';
  const count = () =>
    env.fake.states.filter((s) => s.device_feature_external_id === F('price')).length;
  await env.wait(5 * HOUR);
  env.gladys.forgetPublishedStates();
  let before = count();
  await env.wait(15 * MINUTE);
  assert.equal(count(), before + 1, 'read 5 h ago: published');
  await env.wait(2 * HOUR);
  env.gladys.forgetPublishedStates();
  before = count();
  await env.wait(15 * MINUTE);
  assert.equal(count(), before, 'read 7 h ago: not published');
  const current = await env.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.equal(current.data.price, null);
});

test('prices without taxes only: never published nor used; the status says it', async (t) => {
  const kraken = createKraken({
    account: () => K.account({ points: [K.point({ withTaxes: null })] }),
  });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.settle();
  assert.equal(env.fake.lastState(F('price')), undefined);
  assert.equal(env.fake.lastState(F('price_p1')), undefined);
  assert.match(statusText(env), /prices of 1 supply point\(s\) were not given with taxes/);
  assert.deepEqual(env.store.data.prices, {});
  assert.equal((await price(env, [interval('2026-11-04T09:00:00.000Z')])).success, false);
});

test('delegated pricing: the past from the prices kept then, the current quarter live; unknown = failure', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  await env.wait(5 * HOUR); // 15:07 in Madrid, five reads of the account
  const ack = await price(env, [
    interval('2026-11-04T12:30:00.000Z', 2), // 13:30, punta
    interval('2026-11-04T13:00:00.000Z', 1), // 14:00, llano
    interval('2026-11-04T14:00:00.000Z', 1), // 15:00, the current quarter
  ]);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    ack.data.costs.map((c) => c.cost),
    [0.402468, 0.151234, 0.151234],
  );
  assert.ok(
    ack.data.costs.every((c) => c.label === undefined),
    'no label: the period then is not kept',
  );
  // Before the installation: never priced from today's prices.
  const before = await price(env, [interval('2026-11-04T08:00:00.000Z')]);
  assert.equal(before.success, false, 'never a guess, never 0');
  assert.equal(
    env.kraken.calls.filter((c) => c.op === 'account').length,
    6,
    'priced from what is held',
  );
});

test('delegated pricing: a price change never rewrites the quarters kept; restart prices the past', async (t) => {
  const store = createMemoryStore();
  const env = await started({ store });
  await env.wait(2 * HOUR);
  env.kraken.answers.account = () =>
    K.account({ points: [K.point({ withTaxes: ['0.3', '0.2', '0.1'] })] });
  await env.wait(HOUR); // 13:07: the new prices from now on
  await env.app.stop();
  const later = await started({ store, now: K.NOW + 2 * DAY, kraken: env.kraken });
  t.after(() => later.app.stop());
  const ack = await price(later, [
    interval('2026-11-04T10:00:00.000Z'), // 11:00, read with the old prices
    interval('2026-11-04T12:30:00.000Z'), // 13:30, the new ones
  ]);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    ack.data.costs.map((c) => c.cost),
    [0.201234, 0.3],
  );
});

test('delegated pricing: the prices are kept two hours ahead only', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  const indexes = Object.keys(env.store.data.prices[KEY]).map(Number);
  const q = 15 * MINUTE;
  assert.equal(Math.min(...indexes) * q, K.NOW - (K.NOW % q));
  assert.ok(Math.max(...indexes) * q < K.NOW + 2 * HOUR);
});

test('current price: the price, its end and the next one with their periods; a flat product has no label', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  const ack = await env.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.deepEqual(ack.data, {
    price: 0.201234,
    valid_until: new Date(fromMadrid(2026, 11, 4, 14)).toISOString(),
    next_price: 0.151234,
    label: 'P1',
    next_label: 'P2',
  });
  const flat = await started({
    kraken: createKraken({
      account: () => K.account({ points: [K.point({ withTaxes: ['0.15', '0.15', '0.15'] })] }),
    }),
  });
  t.after(() => flat.app.stop());
  const same = await flat.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.deepEqual(same.data, { price: 0.15, valid_until: null, next_price: null });
});

test('current price on a Saturday: valle until Monday 08:00', async (t) => {
  const env = await started({ now: fromMadrid(2026, 11, 7, 12) });
  t.after(() => env.app.stop());
  const ack = await env.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.equal(ack.data.price, 0.091234);
  assert.equal(ack.data.valid_until, new Date(fromMadrid(2026, 11, 9, 8)).toISOString());
  assert.equal(ack.data.label, 'P3');
});

test('consumption: only for a created device, 14 days at first, then 4 days every 6 hours, in halves', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  await env.wait(2 * HOUR);
  assert.equal(env.kraken.count('readings'), 0, 'nobody created the device');
  await env.fake.deviceCreated(cupsDevice(env));
  await env.wait(1000);
  const first = env.kraken.calls.filter((c) => c.op === 'readings');
  assert.ok(first.length >= 4, `${first.length} pages`);
  const v = first[0].variables;
  assert.equal(v.accountNumber, K.ACCOUNT_NUMBER);
  assert.equal(v.first, 100);
  assert.equal(v.startAt, new Date(fromMadrid(2026, 10, 21)).toISOString());
  const published = env.fake.publishedEnergyConsumption.filter(
    (p) => p.device_feature_external_id === F('consumption'),
  );
  assert.equal(published.length, 1);
  const intervals = published[0].intervals;
  assert.equal(intervals[0].starts_at, '2026-10-20T22:00:00.000Z');
  assert.ok(intervals.every((i) => Math.abs(i.kwh - 0.2) < 1e-9));
  assert.ok(Date.parse(intervals.at(-1).starts_at) + 30 * MINUTE <= env.clock.now, 'elapsed only');
  const pages = env.kraken.count('readings');
  await env.wait(6 * HOUR - 2000);
  assert.equal(env.kraken.count('readings'), pages);
  await env.wait(3000);
  const next = env.kraken.calls.filter((c) => c.op === 'readings').at(-1);
  assert.equal(next.variables.startAt, new Date(fromMadrid(2026, 10, 31)).toISOString());
});

test('consumption failing does not block the prices; the status says it', async (t) => {
  const kraken = createKraken({ readings: () => K.ktError('KT-CT-4301') });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.wait(MINUTE + 1000);
  assert.match(statusText(env), /consumption could not be read \(KT-CT-4301\)/);
  assert.equal(env.fake.lastState(F('price')), 0.201234);
  assert.equal(env.store.data.lastFull, null, 'the daily 14 days not marked done');
});

test('consumption: a 429 pauses every request, the 14 days not marked done', async (t) => {
  const kraken = createKraken({ readings: () => new Response('', { status: 429 }) });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.wait(MINUTE + 1000);
  assert.equal(kraken.count('readings'), 1);
  assert.equal(env.store.data.pause.code, 'rate_limited');
  assert.equal(env.store.data.lastFull, null);
  const calls = kraken.calls.length;
  await env.wait(10 * MINUTE);
  assert.equal(kraken.calls.length, calls, 'paused');
});

test('two supply points: the suffix chooses the contract; no consumption (the readings name none)', async (t) => {
  const kraken = createKraken({
    account: () =>
      K.account({
        points: [
          K.point(),
          K.point({ cups: K.CUPS2, withTaxes: ['0.5', '0.4', '0.3'] }),
          K.point({ cups: 'ES0031405999999999JN0F' }),
        ],
      }),
  });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  assert.equal(env.fake.discoveredDevices.length, 4);
  const one = (suffix) =>
    price(env, [interval('2026-11-04T09:15:00.000Z')], { cups_suffix: suffix });
  assert.equal((await one('32AB')).data.costs[0].cost, 0.5);
  assert.equal((await one('2ab')).data.costs[0].cost, 0.5, 'any case');
  assert.equal((await one('JN0F')).success, false, 'two end with JN0F');
  assert.equal((await one('x y')).success, false);
  assert.equal((await one('')).success, false, 'empty with several: never a guess');
  for (const d of env.fake.discoveredDevices) await env.fake.deviceCreated(structuredClone(d));
  await env.wait(7 * HOUR);
  assert.equal(kraken.count('readings'), 0);
  assert.match(statusText(env), /several supply points/);
});

test('the account device: balances and last bill; the billing failing never hides the prices', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  const device = accountDevice(env);
  assert.equal(device.external_id, `ext:octopus-spain:account:${ACCOUNT_KEY}`);
  await env.fake.deviceCreated(device);
  await env.settle();
  assert.equal(env.fake.lastState(F('credit', 'account', ACCOUNT_KEY)), 12.5);
  assert.equal(env.fake.lastState(F('solar_wallet', 'account', ACCOUNT_KEY)), 8.3);
  assert.equal(env.fake.lastState(F('last_bill', 'account', ACCOUNT_KEY)), 65.43);
  assert.ok(!written(env).includes(K.ACCOUNT_NUMBER));
  env.kraken.answers.billing = () => 'network';
  await env.wait(HOUR + 1000);
  assert.match(statusText(env), /^Connected.*balances and the last bill could not be read/);
  await env.fake.deviceCreated(cupsDevice(env));
  await env.settle();
  assert.equal(env.fake.lastState(F('price')), 0.201234);
});

test('the billing: a 429 pauses every request; a missing wallet stays unknown', async (t) => {
  const kraken = createKraken({ billing: () => new Response('', { status: 429 }) });
  const env = await started({ kraken });
  t.after(() => env.app.stop());
  assert.equal(env.store.data.pause.code, 'rate_limited');
  const other = await started({
    kraken: createKraken({
      billing: () =>
        K.billing({ ledgers: [{ ledgerType: 'SPAIN_ELECTRICITY_LEDGER', balance: '0' }] }),
    }),
  });
  t.after(() => other.app.stop());
  await other.fake.deviceCreated(accountDevice(other));
  await other.settle();
  assert.equal(other.fake.lastState(F('credit', 'account', ACCOUNT_KEY)), 0, 'a real 0');
  assert.equal(other.fake.lastState(F('solar_wallet', 'account', ACCOUNT_KEY)), undefined);
});

test('account answers with errors: one supply point spoiled keeps what was read; elsewhere, nothing taken', async (t) => {
  const store = createMemoryStore();
  const env = await started({ store });
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  env.kraken.answers.account = () => ({
    ...K.account({ points: [K.point({ withTaxes: ['0.9', '0.9', '0.9'] })] }),
    errors: [{ message: 'x', path: ['account', 'properties', 0, 'electricitySupplyPoints', 0] }],
  });
  await env.wait(HOUR + 1000);
  assert.equal(env.fake.lastState(F('price')), 0.201234, 'the spoiled one keeps its prices');
  env.kraken.answers.account = () => ({
    ...K.account({ points: [K.point({ withTaxes: ['0.9', '0.9', '0.9'] })] }),
    errors: [{ message: 'Temporary error', extensions: { errorCode: 'KT-CT-3956' } }],
  });
  await env.wait(HOUR);
  assert.match(statusText(env), /last read failed \(KT-CT-3956\)/);
  assert.equal(env.fake.lastState(F('price')), 0.201234);
});

test('reads without the supply point never erase its prices nor its device', async (t) => {
  const store = createMemoryStore();
  const env = await started({ store });
  t.after(() => env.app.stop());
  await env.wait(HOUR + 1000);
  const kept = Object.keys(store.data.prices[KEY]).length;
  env.kraken.answers.account = () => K.ok({ account: { properties: [] } });
  await env.wait(2 * HOUR);
  assert.match(statusText(env), /no electricity supply point/);
  assert.ok(Object.keys(store.data.prices[KEY]).length >= kept, 'nothing erased');
  assert.equal(store.data.meters.length, 1);
  const ack = await price(env, [interval('2026-11-04T09:15:00.000Z')]);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.costs[0].cost, 0.201234);
});

test('mutants: a negative price costs 0; a quarter already started keeps its kept price', async (t) => {
  const negative = await started({
    kraken: createKraken({
      account: () => K.account({ points: [K.point({ withTaxes: ['-0.05', '0.1', '0.1'] })] }),
    }),
  });
  t.after(() => negative.app.stop());
  await negative.wait(HOUR);
  const zero = await price(negative, [interval('2026-11-04T09:15:00.000Z')]);
  assert.equal(zero.success, true, zero.error);
  assert.equal(zero.data.costs[0].cost, 0);

  const env = await started();
  t.after(() => env.app.stop());
  env.kraken.answers.account = () =>
    K.account({ points: [K.point({ withTaxes: ['0.9', '0.9', '0.9'] })] });
  await env.wait(HOUR); // 11:07: the read keeps 11:00 (started), takes 11:15 on
  await env.wait(2 * HOUR);
  const ack = await price(env, [interval('2026-11-04T10:00:00.000Z')]);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.costs[0].cost, Math.round(((0.201234 + 0.9) / 2) * 1e8) / 1e8);
});

test('mutants: balances read more than 6 hours ago are not published again', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(accountDevice(env));
  await env.settle();
  env.kraken.answers.billing = () => 'network';
  const id = F('credit', 'account', ACCOUNT_KEY);
  const count = () => env.fake.states.filter((s) => s.device_feature_external_id === id).length;
  await env.wait(5 * HOUR);
  env.gladys.forgetPublishedStates();
  let before = count();
  await env.wait(15 * MINUTE);
  assert.equal(count(), before + 1, 'read 5 h ago: published');
  await env.wait(2 * HOUR);
  env.gladys.forgetPublishedStates();
  before = count();
  await env.wait(15 * MINUTE);
  assert.equal(count(), before, 'read 7 h ago: not published');
});

test('r1 I1: a supply point in error for 7 hours: no current price, nothing new kept, the past still priced, the status says it', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  await env.fake.deviceCreated(cupsDevice(env));
  await env.wait(HOUR + 1000); // 11:07: a good read keeps up to 13:00
  const lastKept = Math.max(...Object.keys(env.store.data.prices[KEY]).map(Number));
  env.kraken.answers.account = () => ({
    ...K.account({ points: [K.point({ withTaxes: ['0.9', '0.9', '0.9'] })] }),
    errors: [
      {
        message: 'x',
        path: ['account', 'properties', 0, 'electricitySupplyPoints', 0, 'activeAgreement'],
      },
    ],
  });
  await env.wait(HOUR);
  assert.match(
    statusText(env),
    /prices of 1 supply point\(s\) could not be read \(error\): last good read at 11:0\d/,
  );
  await env.wait(6 * HOUR);
  const current = await env.fake.energyCurrent({ contract: { id: 'c', inputs: {} } });
  assert.equal(current.data.price, null, 'never served as fresh');
  assert.equal(
    Math.max(...Object.keys(env.store.data.prices[KEY]).map(Number)),
    lastKept,
    'no quarter kept from an old read',
  );
  assert.ok(!Object.values(env.store.data.prices[KEY]).includes(0.9));
  const past = await price(env, [interval('2026-11-04T10:00:00.000Z')]);
  assert.equal(past.data.costs[0].cost, 0.201234, 'the past from what was kept');
  const gap = await price(env, [interval('2026-11-04T14:00:00.000Z')]);
  assert.equal(gap.success, false, 'the hours of the error have no price');
  env.gladys.forgetPublishedStates();
  const before = env.fake.states.length;
  await env.wait(15 * MINUTE);
  assert.equal(
    env.fake.states.filter((s) => s.device_feature_external_id === F('price')).length,
    env.fake.states.slice(0, before).filter((s) => s.device_feature_external_id === F('price'))
      .length,
    'the price feature not published',
  );
});

test('r1 I2: a negative kWh and a half hour whose second quarter has no price are refused', async (t) => {
  const env = await started();
  t.after(() => env.app.stop());
  env.kraken.answers.accounts = () => 'network';
  await env.wait(7 * HOUR); // the last quarter kept is 12:00; 12:15 has no price
  const ok = await price(env, [interval('2026-11-04T10:30:00.000Z')]);
  assert.equal(ok.success, true, ok.error);
  assert.equal((await price(env, [interval('2026-11-04T10:30:00.000Z', -1)])).success, false);
  assert.equal((await price(env, [interval('2026-11-04T11:00:00.000Z')])).success, false);
});
