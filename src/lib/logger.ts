import { env } from './env';

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof ORDER;

function enabled(level: Level): boolean {
  try {
    return ORDER[level] >= ORDER[env.LOG_LEVEL as Level];
  } catch {
    return ORDER[level] >= ORDER.info;
  }
}

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  if (!enabled(level)) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra === undefined) fn(line);
  else fn(line, extra);
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => emit('debug', scope, m, e),
    info: (m: string, e?: unknown) => emit('info', scope, m, e),
    warn: (m: string, e?: unknown) => emit('warn', scope, m, e),
    error: (m: string, e?: unknown) => emit('error', scope, m, e),
  };
}

export type Logger = ReturnType<typeof logger>;
