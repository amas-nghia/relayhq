export interface CronFieldSpec {
  readonly values: ReadonlySet<number>;
  readonly wildcard: boolean;
}

function expandToken(token: string, min: number, max: number, normalize?: (value: number) => number): ReadonlyArray<number> | null {
  if (token === '*') {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }

  if (token.startsWith('*/')) {
    const step = Number(token.slice(2));
    if (!Number.isInteger(step) || step <= 0) return null;
    const values: number[] = [];
    for (let value = min; value <= max; value += step) values.push(value);
    return values;
  }

  if (token.includes('-')) {
    const [rangePart, stepPart] = token.split('/', 2);
    const [startRaw, endRaw] = rangePart.split('-', 2);
    const start = Number(startRaw);
    const end = Number(endRaw);
    const step = stepPart !== undefined ? Number(stepPart) : 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(step) || step <= 0) return null;
    if (start < min || end > max || start > end) return null;
    const values: number[] = [];
    for (let value = start; value <= end; value += step) values.push(normalize ? normalize(value) : value);
    return values;
  }

  const [valueRaw, stepRaw] = token.split('/', 2);
  const value = Number(valueRaw);
  const step = stepRaw !== undefined ? Number(stepRaw) : null;
  if (value < min || value > max) return null;
  if (step === null) {
    return [normalize ? normalize(value) : value];
  }

  if (!Number.isInteger(step) || step <= 0) return null;
  const values: number[] = [];
  for (let current = value; current <= max; current += step) values.push(normalize ? normalize(current) : current);
  return values;
}

function parseField(field: string, min: number, max: number, normalize?: (value: number) => number): CronFieldSpec | null {
  const parts = field.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const values = new Set<number>();
  let wildcard = false;

  for (const part of parts) {
    const expanded = expandToken(part, min, max, normalize);
    if (expanded === null) return null;
    if (part === '*') wildcard = true;
    for (const value of expanded) values.add(normalize ? normalize(value) : value);
  }

  return { values, wildcard };
}

export interface ParsedCronSchedule {
  readonly minute: CronFieldSpec;
  readonly hour: CronFieldSpec;
  readonly dayOfMonth: CronFieldSpec;
  readonly month: CronFieldSpec;
  readonly dayOfWeek: CronFieldSpec;
}

export function parseCronSchedule(expression: string): ParsedCronSchedule | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const minute = parseField(parts[0]!, 0, 59);
  const hour = parseField(parts[1]!, 0, 23);
  const dayOfMonth = parseField(parts[2]!, 1, 31);
  const month = parseField(parts[3]!, 1, 12);
  const dayOfWeek = parseField(parts[4]!, 0, 7, (value) => (value === 7 ? 0 : value));

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function validateCronSchedule(expression: string): string | null {
  if (expression.trim().length === 0) return 'must be a non-empty string';
  if (parseCronSchedule(expression) === null) return 'must be a valid 5-field cron expression';
  return null;
}

function matchesField(spec: CronFieldSpec, value: number): boolean {
  return spec.values.has(value);
}

function matchesCronDate(spec: ParsedCronSchedule, date: Date): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay();

  if (!matchesField(spec.minute, minute) || !matchesField(spec.hour, hour) || !matchesField(spec.month, month)) {
    return false;
  }

  const domWildcard = spec.dayOfMonth.wildcard;
  const dowWildcard = spec.dayOfWeek.wildcard;
  const domMatches = matchesField(spec.dayOfMonth, dayOfMonth);
  const dowMatches = matchesField(spec.dayOfWeek, dayOfWeek);

  if (domWildcard && dowWildcard) return true;
  if (domWildcard) return dowMatches;
  if (dowWildcard) return domMatches;
  return domMatches || dowMatches;
}

export function nextCronOccurrence(expression: string, from: Date): Date | null {
  const spec = parseCronSchedule(expression);
  if (!spec) return null;

  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const limit = 60 * 24 * 366 * 5;
  for (let index = 0; index < limit; index += 1) {
    if (matchesCronDate(spec, candidate)) {
      return new Date(candidate.getTime());
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  return null;
}
