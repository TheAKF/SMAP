/**
 * In-app debug logger.
 * - Keeps the last 60 entries in memory (shown on screen in real-time)
 * - Also writes every entry to console.log/console.error
 * - Listeners are notified on every new entry so UI can re-render
 */

export type LogLevel = 'info' | 'warn' | 'error';

export type LogEntry = {
  id: number;
  time: string;
  level: LogLevel;
  msg: string;
};

let _seq = 0;
const _entries: LogEntry[] = [];
const _listeners = new Set<() => void>();

export function dlog(msg: string, level: LogLevel = 'info'): void {
  const time = new Date().toTimeString().slice(0, 8);
  const entry: LogEntry = { id: ++_seq, time, level, msg };
  _entries.push(entry);
  if (_entries.length > 60) _entries.shift();

  // Also route to native console so Xcode / device logs capture it
  if (level === 'error') console.error(`[D ${time}] ${msg}`);
  else if (level === 'warn') console.warn(`[D ${time}] ${msg}`);
  else console.log(`[D ${time}] ${msg}`);

  _listeners.forEach(fn => fn());
}

export function getEntries(): LogEntry[] {
  return [..._entries];
}

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function clearLog(): void {
  _entries.length = 0;
  _seq = 0;
  _listeners.forEach(fn => fn());
}
