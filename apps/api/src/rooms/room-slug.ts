const MAX_ROOM_SLUG_LENGTH = 80;
const UUID_SLUG_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function roomSlugFromTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ROOM_SLUG_LENGTH);

  const slug = normalized || 'room';
  return UUID_SLUG_PATTERN.test(slug) ? `room-${slug}` : slug;
}
