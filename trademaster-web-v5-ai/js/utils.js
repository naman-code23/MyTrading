export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function cn(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

export function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function uid(prefix = 'id') {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${seed}`;
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, options = {}) {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: options.year === false ? undefined : 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value, options = {}) {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: options.year === false ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatDurationMinutes(minutes) {
  const total = Number(minutes || 0);
  if (!(total > 0)) return '0m';
  if (total < 60) return `${Math.round(total)}m`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = Math.round(total % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  return `${hours}h`;
}

export function formatPercent(value, digits = 1) {
  const number = Number(value || 0);
  return `${number.toFixed(digits)}%`;
}

export function parseTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))];
}

export function stringifyTags(tags = []) {
  return parseTags(tags).join(', ');
}

function currencyLocale(currency = 'INR') {
  return currency === 'USD' ? 'en-US' : 'en-IN';
}

export function formatCurrency(value, currency = 'INR', options = {}) {
  const number = Number(value || 0);
  const locale = currencyLocale(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(number);
}

export function formatCompactCurrency(value, currency = 'INR') {
  const number = Number(value || 0);
  const locale = currencyLocale(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(number);
}

export function downloadTextFile(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function todayLocalDateTimeInput() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export function monthKey(value) {
  const date = safeDate(value);
  if (!date) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function labelFromMonthKey(key) {
  if (!key || key === 'Unknown') return 'Unknown';
  const [year, month] = String(key).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(date);
}

export function weekdayLabel(value) {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
}
