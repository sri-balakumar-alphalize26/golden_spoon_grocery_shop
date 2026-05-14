// src/utils/uuid.js
// UUID v4 generator — same Math.random-based implementation used in the
// Odoo device_login_config JS client (device_config.js fallback).

export function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
