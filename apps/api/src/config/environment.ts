const MEMORY_DRIVER = 'memory';
const POSTGRES_DRIVER = 'postgres';

export function validateEnvironment(environment: Record<string, unknown>): Record<string, unknown> {
  const databaseDriver = stringValue(environment['DATABASE_DRIVER']) || MEMORY_DRIVER;
  if (databaseDriver !== MEMORY_DRIVER && databaseDriver !== POSTGRES_DRIVER) {
    throw new Error(`Unsupported DATABASE_DRIVER: ${databaseDriver}`);
  }

  const livekitUrl = requiredString(environment, 'LIVEKIT_URL');
  const livekitApiKey = requiredString(environment, 'LIVEKIT_API_KEY');
  const livekitApiSecret = requiredString(environment, 'LIVEKIT_API_SECRET');

  const livekitProtocol = new URL(livekitUrl).protocol;
  if (livekitProtocol !== 'ws:' && livekitProtocol !== 'wss:') {
    throw new Error('LIVEKIT_URL must use ws or wss.');
  }
  if (livekitUrl.includes('your-project.livekit.cloud')) {
    throw new Error('LIVEKIT_URL still contains the example placeholder.');
  }
  if (livekitApiKey === 'replace-me' || livekitApiSecret === 'replace-me') {
    throw new Error('LiveKit credentials still contain example placeholders.');
  }

  let databaseUrl: string | undefined;
  if (databaseDriver === POSTGRES_DRIVER) {
    databaseUrl = requiredString(environment, 'DATABASE_URL');
    const databaseProtocol = new URL(databaseUrl).protocol;
    if (databaseProtocol !== 'postgres:' && databaseProtocol !== 'postgresql:') {
      throw new Error('DATABASE_URL must use postgres or postgresql.');
    }
  }

  return {
    ...environment,
    DATABASE_DRIVER: databaseDriver,
    LIVEKIT_URL: livekitUrl,
    LIVEKIT_API_KEY: livekitApiKey,
    LIVEKIT_API_SECRET: livekitApiSecret,
    ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
  };
}

function requiredString(environment: Record<string, unknown>, key: string): string {
  const value = stringValue(environment[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
