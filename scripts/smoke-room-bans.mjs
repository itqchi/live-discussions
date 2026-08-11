const apiBaseUrl = (process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerHeaders = devHeaders(`ci-ban-owner-${suffix}`, 'CI Ban Owner');
const memberHeaders = devHeaders(`ci-ban-member-${suffix}`, 'CI Ban Member');

const created = await expectJson(
  'POST',
  '/rooms',
  { title: `CI Ban Room ${suffix}` },
  ownerHeaders,
  201,
);
const roomSlug = created.room.slug;
const roomPath = `/rooms/${encodeURIComponent(roomSlug)}`;

await expectJson('POST', '/rooms/join', { roomId: roomSlug }, ownerHeaders, 201);
await expectJson('POST', '/rooms/join', { roomId: roomSlug }, memberHeaders, 201);

await expectStatus('GET', `${roomPath}/bans`, undefined, memberHeaders, 403);
await expectStatus(
  'PATCH',
  `${roomPath}/bans/${encodeURIComponent(ownerHeaders['x-dev-user-id'])}`,
  {},
  memberHeaders,
  403,
);

await expectStatus(
  'PATCH',
  `${roomPath}/bans/${encodeURIComponent(memberHeaders['x-dev-user-id'])}`,
  {},
  ownerHeaders,
  204,
);

const bannedUsers = await expectJson('GET', `${roomPath}/bans`, undefined, ownerHeaders, 200);
assert(Array.isArray(bannedUsers) && bannedUsers.length === 1, 'Ban list must contain exactly one participant.');
assert(bannedUsers[0]?.userId === memberHeaders['x-dev-user-id'], 'Ban list returned the wrong user id.');
assert(bannedUsers[0]?.displayName === 'CI Ban Member', 'Ban list did not preserve the display name.');

await expectStatus('POST', '/rooms/join', { roomId: roomSlug }, memberHeaders, 403);

const summaryAfterBan = await expectJson('GET', roomPath, undefined, undefined, 200);
assert(summaryAfterBan.memberCount === 1, 'Banned participants must not count as active room members.');

await expectStatus(
  'DELETE',
  `${roomPath}/bans/${encodeURIComponent(memberHeaders['x-dev-user-id'])}`,
  undefined,
  ownerHeaders,
  204,
);

const bansAfterUnban = await expectJson('GET', `${roomPath}/bans`, undefined, ownerHeaders, 200);
assert(Array.isArray(bansAfterUnban) && bansAfterUnban.length === 0, 'Unban must remove the participant from the ban list.');

await expectJson('POST', '/rooms/join', { roomId: roomSlug }, memberHeaders, 201);
const summaryAfterUnban = await expectJson('GET', roomPath, undefined, undefined, 200);
assert(summaryAfterUnban.memberCount === 2, 'Unbanned member must count again after reconnecting.');

console.log('✓ Room ban smoke tests passed');

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
