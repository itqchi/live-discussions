const apiBaseUrl = (process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
const ownerHeaders = devHeaders('ci-owner', 'CI Owner');
const memberHeaders = devHeaders('ci-member', 'CI Member');
const newcomerHeaders = devHeaders('ci-newcomer', 'CI Newcomer');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

await expectJson('GET', '/health', undefined, undefined, 200, (body) => {
  assert(body.status === 'ok', 'Health endpoint did not report ok.');
  assert(body.database === 'memory', 'Health endpoint did not report memory persistence.');
});

await expectJson('GET', '/rooms', undefined, undefined, 200, (body) => {
  assert(Array.isArray(body), 'Rooms response must be an array.');
});

await expectJson('GET', '/houses', undefined, undefined, 200, (body) => {
  assert(Array.isArray(body), 'Houses response must be an array.');
});

const standalone = await expectJson(
  'POST',
  '/rooms',
  { title: 'CI Standalone Room' },
  ownerHeaders,
  201,
  (body) => {
    assert(body.participant === undefined, 'Room creation response must remain actor-neutral.');
    assert(uuidPattern.test(body.room?.id ?? ''), 'Room id must be a server-generated UUID.');
    assert(body.room?.slug === 'ci-standalone-room', 'Room slug was not generated from the title.');
    assert(body.room?.title === 'CI Standalone Room', 'Room title was not preserved.');
    assert(body.room?.participants?.[0]?.role === 'owner', 'Standalone room owner was not persisted.');
  },
);

await expectJson(
  'POST',
  '/rooms',
  { title: 'CI Standalone Room' },
  ownerHeaders,
  201,
  (body) => {
    assert(body.room?.id !== standalone.room.id, 'Duplicate standalone titles must still get a unique room id.');
    assert(body.room?.slug === 'ci-standalone-room-2', 'Duplicate standalone title must get a unique public slug.');
    assert(body.room?.title === standalone.room.title, 'Display title must remain unchanged when the slug is suffixed.');
  },
);

await expectJson(
  'POST',
  '/rooms/join',
  { roomId: standalone.room.slug },
  ownerHeaders,
  201,
  (body) => {
    assert(body.roomId === standalone.room.id, 'Join session did not resolve the immutable room id.');
    assert(body.roomSlug === standalone.room.slug, 'Join session did not preserve the route slug.');
    assert(body.roomTitle === standalone.room.title, 'Join session did not preserve the display title.');
    assert(body.participant?.role === 'owner', 'Owner role was not restored on join.');
    assert(typeof body.token === 'string' && body.token.length > 0, 'Join session did not issue a token.');
  },
);

await expectJson(
  'POST',
  '/rooms/join',
  { roomId: standalone.room.slug },
  memberHeaders,
  201,
  (body) => {
    assert(body.participant?.role === 'listener', 'New room member must join as listener.');
  },
);

await expectJson(
  'GET',
  `/rooms/${encodeURIComponent(standalone.room.slug)}`,
  undefined,
  undefined,
  200,
  (body) => {
    assert(body.slug === standalone.room.slug, 'Public room read returned the wrong slug.');
    assert(body.description === '', 'New room description must default to empty.');
    assert(body.isLocked === false, 'New room must default to unlocked.');
  },
);

await expectStatus(
  'PATCH',
  `/rooms/${encodeURIComponent(standalone.room.slug)}/settings`,
  { title: 'Member Rename Attempt', description: 'Must be rejected.', isLocked: true },
  memberHeaders,
  403,
);

await expectJson(
  'PATCH',
  `/rooms/${encodeURIComponent(standalone.room.slug)}/settings`,
  {
    title: 'CI Standalone Room Updated',
    description: 'Room profile and lock smoke test.',
    isLocked: true,
  },
  ownerHeaders,
  200,
  (body) => {
    assert(body.title === 'CI Standalone Room Updated', 'Room title update did not persist.');
    assert(body.description === 'Room profile and lock smoke test.', 'Room description update did not persist.');
    assert(body.isLocked === true, 'Room lock state did not persist.');
    assert(body.slug === standalone.room.slug, 'Editing the room title must not change its public slug.');
  },
);

await expectStatus(
  'POST',
  '/rooms/join',
  { roomId: standalone.room.slug },
  newcomerHeaders,
  403,
);

await expectJson(
  'POST',
  '/rooms/join',
  { roomId: standalone.room.slug },
  memberHeaders,
  201,
  (body) => {
    assert(body.participant?.role === 'listener', 'Existing room member must be able to reconnect while locked.');
    assert(body.roomTitle === 'CI Standalone Room Updated', 'Reconnect did not receive the updated room title.');
  },
);

await expectJson(
  'GET',
  `/rooms/${encodeURIComponent(standalone.room.slug)}`,
  undefined,
  undefined,
  200,
  (body) => {
    assert(body.title === 'CI Standalone Room Updated', 'Fresh room read did not return the updated title.');
    assert(body.description === 'Room profile and lock smoke test.', 'Fresh room read did not return the updated description.');
    assert(body.isLocked === true, 'Fresh room read did not return the locked state.');
  },
);

const commentsPath = `/rooms/${encodeURIComponent(standalone.room.slug)}/comments`;
const firstComment = await expectJson(
  'POST',
  commentsPath,
  { id: 'ci-comment-1', text: 'First shared comment', replyToId: null },
  ownerHeaders,
  201,
  (body) => {
    assert(body.id === 'ci-comment-1', 'Persisted comment id changed unexpectedly.');
    assert(body.participantIdentity === 'ci-owner', 'Persisted comment author is incorrect.');
    assert(body.text === 'First shared comment', 'Persisted comment text is incorrect.');
    assert(body.replyToId === null, 'Root comment must not have a reply target.');
  },
);

const replyComment = await expectJson(
  'POST',
  commentsPath,
  { id: 'ci-comment-2', text: 'Shared reply', replyToId: firstComment.id },
  memberHeaders,
  201,
  (body) => {
    assert(body.participantIdentity === 'ci-member', 'Reply author is incorrect.');
    assert(body.replyToId === firstComment.id, 'Reply relationship was not persisted.');
  },
);

await expectStatus(
  'PATCH',
  `${commentsPath}/${encodeURIComponent(firstComment.id)}/reaction`,
  { emoji: '👍', active: true },
  memberHeaders,
  204,
);

await expectJson('GET', commentsPath, undefined, ownerHeaders, 200, (body) => {
  assert(Array.isArray(body) && body.length === 2, 'Shared comment history did not return both comments.');
  const restoredRoot = body.find((comment) => comment.id === firstComment.id);
  const restoredReply = body.find((comment) => comment.id === replyComment.id);
  assert(restoredRoot?.reactions?.['👍']?.includes('ci-member'), 'Shared reaction was not restored.');
  assert(restoredReply?.replyToId === firstComment.id, 'Shared reply relationship was not restored.');
});

const createdHouse = await expectJson(
  'POST',
  '/houses',
  { name: 'CI House', description: 'Compiled API smoke test.' },
  ownerHeaders,
  201,
  (body) => {
    assert(uuidPattern.test(body.house?.id ?? ''), 'House id must be a UUID.');
    assert(body.role === 'owner', 'House creator must be the owner.');
  },
);

await expectJson(
  'GET',
  `/houses/${encodeURIComponent(createdHouse.house.id)}`,
  undefined,
  undefined,
  200,
  (body) => {
    assert(body.role === null, 'Public House read must not invent an authenticated role.');
    assert(body.house?.name === 'CI House', 'Public House read returned the wrong House.');
  },
);

await expectJson(
  'POST',
  '/houses/join',
  { houseId: createdHouse.house.id },
  memberHeaders,
  201,
  (body) => {
    assert(body.role === 'member', 'Joining a House must create a member role.');
  },
);

await expectJson(
  'GET',
  `/houses/${encodeURIComponent(createdHouse.house.id)}`,
  undefined,
  memberHeaders,
  200,
  (body) => {
    assert(body.role === 'member', 'Authenticated House read did not resolve membership.');
  },
);

await expectJson(
  'PATCH',
  `/houses/${encodeURIComponent(createdHouse.house.id)}`,
  { name: 'CI House Updated', description: 'Updated House profile.' },
  ownerHeaders,
  200,
  (body) => {
    assert(body.name === 'CI House Updated', 'House owner update did not persist the name.');
    assert(body.description === 'Updated House profile.', 'House owner update did not persist the description.');
  },
);

await expectStatus(
  'PATCH',
  `/houses/${encodeURIComponent(createdHouse.house.id)}`,
  { name: 'Member Rename Attempt', description: 'Must not be accepted.' },
  memberHeaders,
  403,
);

await expectJson(
  'GET',
  `/houses/${encodeURIComponent(createdHouse.house.id)}`,
  undefined,
  ownerHeaders,
  200,
  (body) => {
    assert(body.house?.name === 'CI House Updated', 'House profile update was not visible on a fresh read.');
    assert(body.house?.description === 'Updated House profile.', 'House description update was not visible on a fresh read.');
  },
);

const firstHouseRoom = await expectJson(
  'POST',
  `/houses/${encodeURIComponent(createdHouse.house.id)}/rooms`,
  { title: 'CI House Room' },
  ownerHeaders,
  201,
  (body) => {
    assert(uuidPattern.test(body.room?.id ?? ''), 'House room id must be a server-generated UUID.');
    assert(body.room?.slug === 'ci-house-room', 'House room slug was not generated by the server.');
    assert(body.room?.title === 'CI House Room', 'House room title was not preserved.');
  },
);

await expectStatus(
  'POST',
  `/houses/${encodeURIComponent(createdHouse.house.id)}/rooms`,
  { title: 'ci house room' },
  ownerHeaders,
  409,
);

const secondHouse = await expectJson(
  'POST',
  '/houses',
  { name: 'CI House Two', description: 'Second House for scoped uniqueness.' },
  ownerHeaders,
  201,
  (body) => {
    assert(uuidPattern.test(body.house?.id ?? ''), 'Second House id must be a UUID.');
  },
);

await expectJson(
  'POST',
  `/houses/${encodeURIComponent(secondHouse.house.id)}/rooms`,
  { title: firstHouseRoom.room.title },
  ownerHeaders,
  201,
  (body) => {
    assert(body.room?.id !== firstHouseRoom.room.id, 'Same room name in another House must get a different UUID.');
    assert(body.room?.title === firstHouseRoom.room.title, 'Cross-House duplicate name must preserve its display title.');
    assert(body.room?.slug === 'ci-house-room-2', 'Cross-House duplicate name must get a globally unique route slug.');
  },
);

console.log('✓ Compiled API behavior smoke tests passed');

function devHeaders(userId, displayName) {
  return {
    'x-dev-user-id': userId,
    'x-dev-display-name': displayName,
  };
}

async function expectStatus(method, path, body, headers, expectedStatus) {
  const response = await request(method, path, body, headers);
  assert(
    response.status === expectedStatus,
    `${method} ${path} expected ${expectedStatus}, received ${response.status}: ${await response.text()}`,
  );
}

async function expectJson(method, path, body, headers, expectedStatus, validate) {
  const response = await request(method, path, body, headers);
  const text = await response.text();
  assert(
    response.status === expectedStatus,
    `${method} ${path} expected ${expectedStatus}, received ${response.status}: ${text}`,
  );

  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${path} returned invalid JSON: ${text}`);
  }

  validate(parsed);
  return parsed;
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
