/**
 * device_config.js
 * ================
 * Loaded on the /device/config page (web.assets_frontend asset bundle).
 *
 * Responsibilities:
 *   1. Generate a UUID v4 Device ID (or recover one from a prior session).
 *   2. Persist the ID in both a 30-day cookie AND localStorage so it
 *      survives browser restarts and cookie-only or storage-only restrictions.
 *   3. Populate the hidden form fields (device_id, device_name) before the
 *      form is submitted so the server can save them.
 */

(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────────────
    var COOKIE_NAME   = 'odoo_device_id';
    var LS_KEY        = 'odoo_device_id';
    var COOKIE_DAYS   = 30;
    var UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // ── UUID v4 generator (RFC 4122) ───────────────────────────────────────
    function generateUUID() {
        // Use the Web Crypto API when available for cryptographically strong
        // random numbers; fall back to Math.random() for legacy environments.
        if (
            typeof window !== 'undefined' &&
            window.crypto &&
            typeof window.crypto.getRandomValues === 'function'
        ) {
            var buf = new Uint8Array(16);
            window.crypto.getRandomValues(buf);
            // Set version bits (UUID v4)
            buf[6] = (buf[6] & 0x0f) | 0x40;
            // Set variant bits (RFC 4122)
            buf[8] = (buf[8] & 0x3f) | 0x80;

            var hex = Array.from(buf).map(function (b) {
                return ('00' + b.toString(16)).slice(-2);
            });
            return (
                hex.slice(0, 4).join('') + '-' +
                hex.slice(4, 6).join('') + '-' +
                hex.slice(6, 8).join('') + '-' +
                hex.slice(8, 10).join('') + '-' +
                hex.slice(10, 16).join('')
            );
        }

        // Fallback (Math.random-based)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            var v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // ── Cookie helpers ─────────────────────────────────────────────────────
    function getCookie(name) {
        var match = document.cookie.match(
            new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
        );
        return match ? decodeURIComponent(match[1]) : null;
    }

    function setCookie(name, value, days) {
        var expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie =
            encodeURIComponent(name) + '=' + encodeURIComponent(value) +
            '; expires=' + expires +
            '; path=/' +
            '; SameSite=Lax';
        // Note: omit Secure flag here to support local HTTP dev environments.
        // In production (HTTPS) the flag can be added without issues.
    }

    // ── localStorage helpers ───────────────────────────────────────────────
    function lsGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function lsSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode / storage full */ }
    }

    // ── Device ID management ───────────────────────────────────────────────
    /**
     * Returns the existing device UUID if one is already stored and valid,
     * otherwise generates a fresh one and persists it.
     */
    function getOrCreateDeviceId() {
        // Priority: cookie → localStorage → generate new
        var id = getCookie(COOKIE_NAME) || lsGet(LS_KEY);

        if (!id || !UUID_RE.test(id)) {
            id = generateUUID();
        }

        // Refresh storage so both sources are in sync and expiry is extended.
        setCookie(COOKIE_NAME, id, COOKIE_DAYS);
        lsSet(LS_KEY, id);

        return id;
    }

    // ── Device name (best-effort) ──────────────────────────────────────────
    /**
     * Returns a human-readable label for this device based on the browser's
     * User-Agent string. Truncated to 256 characters for safety.
     */
    function getDeviceName() {
        var ua = (navigator && navigator.userAgent) ? navigator.userAgent : 'Unknown Device';
        return ua.substring(0, 256);
    }

    // ── Form wiring ────────────────────────────────────────────────────────
    function init() {
        var deviceId   = getOrCreateDeviceId();
        var deviceName = getDeviceName();

        var idField   = document.getElementById('device_id_field');
        var nameField = document.getElementById('device_name_field');

        if (idField)   { idField.value   = deviceId; }
        if (nameField) { nameField.value = deviceName; }

        // Guard: prevent form submission if the device_id field is empty
        // (should never happen, but defensive coding).
        var form = document.getElementById('device-config-form');
        if (form) {
            form.addEventListener('submit', function (evt) {
                if (!idField || !idField.value) {
                    evt.preventDefault();
                    var fresh = generateUUID();
                    setCookie(COOKIE_NAME, fresh, COOKIE_DAYS);
                    lsSet(LS_KEY, fresh);
                    if (idField) { idField.value = fresh; }
                    form.submit();
                }
            });
        }
    }

    // Run after DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
