const MAX_ROOM_SLUG_LENGTH = 80;

export function roomSlugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ROOM_SLUG_LENGTH);

  return slug || 'room';
}
