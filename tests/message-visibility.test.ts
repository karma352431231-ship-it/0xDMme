import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageVisibility } from '../src/client/message-visibility/index.ts';
import type { HistoryUpdate } from '../src/client/message-visibility/index.ts';

await test('pagination and synchronization failure never publish intermediate history', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['mantida']);
  assert.deepEqual(frames, [null]);
  visibility.fail(token);
  assert.deepEqual(frames, [null, null]);
  assert.throws(() => visibility.complete(token));
  const retry = visibility.begin();
  visibility.stage(retry, ['mantida após aplicar exclusões']);
  visibility.complete(retry);
  assert.deepEqual(frames.at(-1), ['mantida após aplicar exclusões']);
  assert.throws(() => visibility.complete(retry));
});
await test('old response and old failure neither reopen nor interrupt the new account or device', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const old = visibility.begin();
  visibility.stage(old, ['mensagem antiga']);
  const current = visibility.begin();
  assert.throws(() => visibility.stage(old, ['atrasada']));
  assert.throws(() => visibility.complete(old));
  visibility.fail(old);
  visibility.stage(current, ['conta atual']);
  visibility.complete(current);
  assert.deepEqual(frames, [null, null, ['conta atual']]);
  visibility.close();
  assert.equal(frames.at(-1), null);
});
await test('first probe keeps history closed until full-view validation; failure discards retained nodes', () => {
  const frames: { rows: readonly string[] | null; update: HistoryUpdate }[] =
    [];
  const visibility = new MessageVisibility<string>((rows, update) =>
    frames.push({ rows, update }),
  );
  const token = visibility.begin('delivery');
  assert.deepEqual(frames, [{ rows: null, update: 'delivery' }]);
  visibility.stage(token, ['mensagem conferida']);
  assert.equal(frames.length, 1);
  visibility.complete(token);
  assert.deepEqual(frames.at(-1), {
    rows: ['mensagem conferida'],
    update: 'delivery',
  });
  const failed = visibility.begin('delivery');
  visibility.stage(failed, ['não conferida']);
  visibility.fail(failed);
  assert.deepEqual(frames.at(-1), { rows: null, update: 'history' });
  assert.throws(() => visibility.complete(failed));
});
await test('revocation or leaving the conversation invalidates the in-flight delivery probe', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin('delivery');
  visibility.close();
  assert.throws(() => visibility.stage(token, ['resposta atrasada']));
  assert.throws(() => visibility.complete(token));
  assert.ok(frames.every((rows) => rows === null));
});
await test('notice during initial reading allows completing the same data only after a new check', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['histórico verificado']);
  const oldCheck = visibility.verificationVersion(token);
  visibility.hint();
  assert.equal(frames.at(-1), null);
  assert.equal(visibility.complete(token, oldCheck), false);
  assert.throws(() => visibility.complete(token));
  const freshCheck = visibility.verificationVersion(token);
  visibility.hint();
  assert.equal(visibility.complete(token, freshCheck), false);
  assert.equal(
    visibility.complete(token, visibility.verificationVersion(token)),
    true,
  );
  assert.deepEqual(frames.at(-1), ['histórico verificado']);
});
await test('normal updates preserve the last complete view without publishing parts or closing history', async () => {
  for (const update of ['history', 'delivery'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const initial = visibility.begin();
    visibility.stage(initial, ['já verificada']);
    visibility.complete(initial);
    visibility.hint();
    const token = visibility.refresh(update);
    visibility.stage(token, ['nova visão completa']);
    assert.deepEqual(frames, [null, ['já verificada']]);
    let checks = 0;
    await visibility.confirm(token, () => {
      checks++;
      assert.deepEqual(frames.at(-1), ['já verificada']);
      if (checks === 1) visibility.hint();
      return Promise.resolve();
    });
    assert.equal(checks, 2);
    assert.deepEqual(frames, [
      null,
      ['já verificada'],
      ['nova visão completa'],
    ]);
  }
});
await test('different probe snapshot preserves the view while a full load is checked', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const initial = visibility.begin();
  visibility.stage(initial, ['verificada']);
  visibility.complete(initial);
  const probe = visibility.refresh('delivery');
  visibility.discard(probe);
  assert.throws(() => visibility.complete(probe));
  const full = visibility.refresh();
  visibility.stage(full, ['após mudança']);
  assert.deepEqual(frames.at(-1), ['verificada']);
  await visibility.confirm(full, () => Promise.resolve());
  assert.deepEqual(frames.at(-1), ['após mudança']);
});
await test('deletion or invalidation closes the working view and old responses cannot reopen it; failure also closes', async () => {
  for (const reason of ['removed', 'authorization', 'failed'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const initial = visibility.begin();
    visibility.stage(initial, ['antiga']);
    visibility.complete(initial);
    const token = visibility.refresh();
    visibility.stage(token, ['resposta antiga']);
    if (reason === 'failed') visibility.fail(token);
    else visibility.close();
    assert.equal(frames.at(-1), null);
    await assert.rejects(visibility.confirm(token, () => Promise.resolve()));
    assert.equal(frames.at(-1), null);
    const retry = visibility.refresh();
    visibility.stage(retry, ['após aplicar exclusões']);
    assert.equal(frames.at(-1), null);
    await visibility.confirm(retry, () => Promise.resolve());
    assert.deepEqual(frames.at(-1), ['após aplicar exclusões']);
  }
});
await test('divergent deletion or revocation after a notice discards retained reading without reopening content', () => {
  for (const invalidate of ['fail', 'close'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const token = visibility.begin();
    visibility.stage(token, ['conteúdo antigo']);
    visibility.hint();
    const check = visibility.verificationVersion(token);
    if (invalidate === 'fail') visibility.fail(token);
    else visibility.close();
    assert.throws(() => visibility.complete(token, check));
    assert.ok(frames.every((rows) => rows === null));
  }
});
await test('notice during confirm repeats only verification and keeps the decrypted window hidden until completion', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['janela decifrada uma vez']);
  let checks = 0;
  await visibility.confirm(token, async () => {
    checks++;
    assert.equal(frames.at(-1), null);
    if (checks === 1) visibility.hint();
    await Promise.resolve();
  });
  assert.equal(checks, 2);
  assert.deepEqual(frames.at(-1), ['janela decifrada uma vez']);
});
await test('continuous notices allow at most three confirmations and publish no unchecked snapshot', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['conteúdo retido']);
  let checks = 0;
  await assert.rejects(
    visibility.confirm(token, () => {
      checks++;
      visibility.hint();
      return Promise.resolve();
    }),
    /New updates/,
  );
  assert.equal(checks, 3);
  assert.ok(frames.every((rows) => rows === null));
});
await test('confirm rejected by deletion and revocation during confirm remain closed', async () => {
  for (const reason of ['deleted', 'revoked'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const token = visibility.begin();
    visibility.stage(token, ['não deve abrir']);
    await assert.rejects(
      visibility.confirm(token, () => {
        if (reason === 'deleted')
          return Promise.reject(new Error('snapshot mudou'));
        visibility.close();
        return Promise.resolve();
      }),
    );
    assert.ok(frames.every((rows) => rows === null));
  }
});

await test('resuming a closed view renders full history even when the snapshot only needs delivery checking', () => {
  const frames: { rows: readonly string[] | null; update: HistoryUpdate }[] =
    [];
  const visibility = new MessageVisibility<string>((rows, update) =>
    frames.push({ rows, update }),
  );
  const initial = visibility.begin();
  visibility.stage(initial, ['mensagem já validada']);
  visibility.complete(initial);
  visibility.close();
  const resume = visibility.refresh('delivery');
  visibility.stage(resume, ['mensagem já validada']);
  visibility.complete(resume);
  assert.equal(frames.at(-1)?.update, 'history');
  assert.deepEqual(frames.at(-1)?.rows, ['mensagem já validada']);
});

await test('deletion notice keeps candidates hidden during probing; failure discards and success publishes only after confirmation', async () => {
  const frames: { rows: readonly string[] | null; update: HistoryUpdate }[] =
    [];
  const gate = new MessageVisibility<string>((rows, update) =>
    frames.push({ rows, update }),
  );
  const initial = gate.begin();
  gate.stage(initial, ['intacta', 'apagada']);
  gate.complete(initial);
  gate.close('pending');
  const probe = gate.refresh('delivery');
  gate.discard(probe);
  const loading = gate.refresh();
  gate.stage(loading, ['intacta']);
  assert.ok(
    frames
      .slice(2)
      .every((frame) => frame.rows === null && frame.update === 'pending'),
  );
  await gate.confirm(loading, () => Promise.resolve());
  assert.deepEqual(frames.at(-1), { rows: ['intacta'], update: 'history' });
  gate.close('pending');
  const failed = gate.refresh();
  await assert.rejects(
    gate.confirm(failed, () => Promise.reject(new Error('Estado alterado'))),
  );
  assert.deepEqual(frames.at(-1), { rows: null, update: 'history' });
});
