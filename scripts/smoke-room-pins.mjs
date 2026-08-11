const apiBaseUrl = (process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
const ownerHeaders = devHeaders('ci-pin-owner', 'CI Pin Owner');
const listenerHeaders = devHeaders('ci-pin-listener', 'CI Pin Listener');

const created = await expectJson(
  'POST',
  '/rooms',
  { title: 'CI Pinned Comments Room' },
  ownerHeaders,
  201,
);
const roomSlug = created.room.slug;

await expectJson('POST', '/rooms/join', { roomId: roomSlug }, ownerHeaders, 201);
await expectJson('POST', '/rooms/join', { roomId: roomSlug }, listenerHeaders, 201);

const commentsPath = `/rooms/${encodeURIComponent(roomSlug)}/comments`;
const comment = await expectJson(
  'POST',
  commentsPath,
  { id: 'ci-pinned-comment', text: 'Important room announcement', replyToId: null },
  ownerHeaders,
  201,
);
assert(comment.pinned === false, 'New comments must start unpinned.');

const pinPath = `${commentsPath}/${encodeURIComponent(comment.id)}/pinned`;
await expectStatus('PATCH', pinPath, { pinned: true }, listenerHeaders, 403);
await expectStatus('PATCH', pinPath, { pinned: true }, ownerHeaders, 204);

const history = await expectJson('GET', commentsPath, undefined, ownerHeaders, 200);
const restored = history.find((item) => item.id === comment.id);
assert(restored?.pinned === true, 'Pinned state was not restored from shared comment history.');

await expectStatus('PATCH', pinPath, { pinned: false }, ownerHeaders, 204);
const unpinnedHistory = await expectJson('GET', commentsPath, undefined, ownerHeaders, 200);
assert(
  unpinnedHistory.find((item) => item.id === comment.id)?.pinned === false,
  'Unpinned state was not restored from shared comment history.',
);

console.log('✓ Pinned room comment smoke tests passed');

function devHeaders(userId, displayName) {
  return {
    'x-dev-user-id': userId,
    'x-dev-display-name': displayName,
  };
}

async function expectStatus(method, path, body, headers, expectedStatus) {
  const response = await request(method, path, body, headers);
  const text = await response.text();
  assert(
    response.status === expectedStatus,
    `${method} ${path} expected ${expectedStatus}, received ${response.status}: ${text}`,
  );
}

async function expectJson(method, path, body, headers, expectedStatus) {
  const response = await request(method, path, body, headers);
  const text = await response.text();
  assert(
    response.status === expectedStatus,
    `${method} ${path} expected ${expectedStatus}, received ${response.status}: ${text}`,
  );
  return text ? JSON.parse(text) : null;
}

function request(method, path, body, headers = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
