import json
import logging
import re
from datetime import datetime

import odoo.api
from odoo import http, SUPERUSER_ID
from odoo.modules.registry import Registry
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# UUID v4 the app generates for each device.
_DEVICE_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


class DeviceRegistryController(http.Controller):

    @http.route('/device/registration-qr.png', type='http', auth='user', methods=['GET'], csrf=False)
    def registration_qr_image(self, **kwargs):
        """
        Returns a QR code PNG for the current session's database.
        QR payload: {"a":"ng_reg","d":"<dbname>"}
        No record ID needed — works on unsaved New forms immediately.
        App uses the URL already entered in setup screen, so no localhost problem.
        """
        try:
            import qrcode
            from io import BytesIO
            db = request.env.cr.dbname
            qr_data = json.dumps({'a': 'ng_reg', 'd': db})
            qr = qrcode.QRCode(box_size=7, border=3)
            qr.add_data(qr_data)
            qr.make(fit=True)
            img = qr.make_image(fill_color='black', back_color='white')
            buf = BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)
            return Response(buf.read(), content_type='image/png', status=200)
        except Exception:
            _logger.exception('Failed to generate registration QR')
            return Response(status=500)

    @http.route('/device/lookup', type='json', auth='none', methods=['POST'], csrf=False)
    def lookup_device(self, mac_address=None, database_name=None, **kwargs):
        """
        Step 1 — App sends its auto-generated Device UUID.
        Odoo checks if that UUID is pre-registered by an admin.

        Request:  { "mac_address": "<device-uuid>", "database_name": "mydb" }

        Response (found):
            { "status": "found", "device_name": "Reception Tablet",
              "device_status": "pre_registered" | "active" | "blocked" }

        Response (not found):
            { "status": "not_found", "message": "Device not registered." }
        """
        if not mac_address or not database_name:
            return {'status': 'error', 'message': 'mac_address and database_name are required.'}

        identifier = mac_address.strip()
        db = database_name.strip()

        try:
            with Registry(db).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                registry = env['device.registry'].search(
                    [('mac_address', '=', identifier)], limit=1
                )
                if not registry:
                    _logger.warning('Lookup: unregistered device %s on db %s', identifier, db)
                    return {
                        'status': 'not_found',
                        'message': 'This device is not registered. Please contact your administrator.',
                    }
                status = registry.status
                name = registry.device_name

        except Exception:
            _logger.exception('Error during device lookup for db=%s', db)
            return {'status': 'error', 'message': 'Server error during lookup.'}

        return {
            'status': 'found',
            'device_name': name,
            'device_status': status,
        }

    @http.route('/device/activate', type='json', auth='none', methods=['POST'], csrf=False)
    def activate_device(self, mac_address=None, database_name=None, device_id=None, base_url=None, **kwargs):
        """
        Step 2 — Links the app's UUID to the pre-registered record and marks it Active.

        Request:
            { "mac_address": "<device-uuid>", "database_name": "mydb",
              "device_id": "<device-uuid>", "base_url": "http://..." }

        Response:
            { "status": "activated" | "already_active" | "blocked" | "not_found" | "error" }
        """
        if not mac_address or not database_name or not device_id:
            return {'status': 'error', 'message': 'mac_address, database_name, and device_id are required.'}

        identifier = mac_address.strip()
        db = database_name.strip()

        try:
            with Registry(db).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                registry = env['device.registry'].search(
                    [('mac_address', '=', identifier)], limit=1
                )

                if not registry:
                    return {
                        'status': 'not_found',
                        'message': 'This device is not registered. Please contact your administrator.',
                    }

                if registry.status == 'blocked':
                    _logger.warning('Blocked device attempted activation: %s', identifier)
                    return {'status': 'blocked', 'message': 'This device has been blocked by the administrator.'}

                # Already active — same device re-configuring
                if registry.status == 'active':
                    from odoo import fields as odoo_fields
                    registry.write({'last_login': odoo_fields.Datetime.now()})
                    cr.commit()
                    return {'status': 'already_active', 'message': 'Device already registered.'}

                # Pre-registered → activate
                from odoo import fields as odoo_fields
                vals = {
                    'device_id': device_id,
                    'status': 'active',
                    'database_name': db,
                    'last_login': odoo_fields.Datetime.now(),
                }
                if base_url:
                    vals['base_url'] = base_url.strip().rstrip('/')

                registry.write(vals)
                cr.commit()
                _logger.info('Device activated: identifier=%s db=%s', identifier, db)
                return {'status': 'activated', 'message': 'Device activated successfully.'}

        except Exception:
            _logger.exception('Error during device activation for db=%s', db)
            return {'status': 'error', 'message': 'Server error during activation.'}

    @http.route('/device/register-from-scan', type='json', auth='none', methods=['POST'], csrf=False)
    def register_from_scan(self, device_id=None, device_name=None, database_name=None, base_url=None, record_id=None, **kwargs):
        """
        QR scan registration — app scans QR shown on Odoo Device Registry form.

        QR payload: {"a":"ng_reg","d":"dbname","rid":<record_id>}
        App sends:  device_id, device_name, database_name, record_id

        Uses record_id to update THAT specific record — no duplicate records created.
        Both Device ID and Device Name come from the app automatically.

        Response: { "status": "registered" | "already_registered" | "blocked" | "error" }
        """
        if not device_id or not database_name:
            return {'status': 'error', 'message': 'device_id and database_name are required.'}

        identifier = device_id.strip()
        db = database_name.strip()
        name = (device_name or 'NexGen App').strip()
        burl = base_url.strip().rstrip('/') if base_url else False

        try:
            from odoo import fields as odoo_fields
            with Registry(db).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})

                # Common field values written on every scan
                scan_vals = {
                    'mac_address': identifier,
                    'device_name': name,
                    'device_id': identifier,
                    'status': 'active',
                    'database_name': db,
                    'last_login': odoo_fields.Datetime.now(),
                    'awaiting_rescan': False,
                }
                if burl:
                    scan_vals['base_url'] = burl

                def _clear_awaiting(dev_id):
                    # After a successful (re)registration, clear the "tap New and
                    # scan" banner on this device's older unblocked records.
                    if dev_id:
                        env['device.registry'].search([
                            ('device_id', '=', dev_id),
                            ('database_name', '=', db),
                            ('awaiting_rescan', '=', True),
                        ]).write({'awaiting_rescan': False})

                # ── 0. Device-wide block. If this Device ID is blocked on ANY
                # record, refuse to (re)register it — even onto a fresh
                # Pre-Registered QR — so a blocked device cannot reconnect. ──
                blocked = env['device.registry'].search([
                    ('device_id', '=', identifier),
                    ('database_name', '=', db),
                    ('status', '=', 'blocked'),
                ], limit=1)
                if blocked:
                    return {
                        'status': 'blocked',
                        'message': 'This device has been blocked.',
                        'serial_no': blocked.serial_no or '',
                        'last_blocked': str(blocked.last_blocked or ''),
                    }

                # ── 1. The QR carries the record id it belongs to (the form QR). ──
                # Single-use rule: ONLY a Pre-Registered record can be claimed.
                # Once a record is used (active/deactivated), its QR is dead and the
                # scan is rejected — the admin must tap New for a fresh QR.
                if record_id:
                    try:
                        rid = int(record_id)
                    except (TypeError, ValueError):
                        return {'status': 'error', 'message': 'Invalid record_id.'}

                    rec = env['device.registry'].browse(rid)
                    if not rec.exists():
                        return {'status': 'error', 'message': 'Record not found. It may have been deleted.'}
                    if rec.status == 'blocked':
                        return {'status': 'blocked', 'message': 'This device has been blocked.'}
                    if rec.status != 'pre_registered':
                        return {
                            'status': 'used',
                            'message': 'This QR code has already been used. In Odoo, tap New to generate a fresh QR, then scan it.',
                        }

                    rec.write(scan_vals)
                    _clear_awaiting(identifier)
                    cr.commit()
                    _logger.info('QR scan: claimed pre-registered record %s → %s (%s) on db %s', rid, identifier, name, db)
                    return {'status': 'registered', 'message': 'Device registered successfully.'}

                # ── 2. Record-less QR: claim the oldest unused Pre-Registered record. ──
                pending = env['device.registry'].search(
                    [('status', '=', 'pre_registered')],
                    order='id asc', limit=1
                )
                if pending:
                    pending.write(scan_vals)
                    _clear_awaiting(identifier)
                    cr.commit()
                    _logger.info('QR scan: claimed pending record %s → %s (%s) on db %s',
                                 pending.id, identifier, name, db)
                    return {'status': 'registered', 'message': 'Device registered successfully.'}

                # ── 3. Nothing available — admin must create a fresh record. ──
                return {
                    'status': 'used',
                    'message': 'No available QR. In Odoo, tap New to generate a fresh QR, then scan it.',
                }

        except Exception:
            _logger.exception('Error during QR-scan registration for db=%s', db)
            return {'status': 'error', 'message': 'Server error during registration.'}

    @http.route('/device/init', type='json', auth='none', methods=['POST'], csrf=False)
    def device_init(self, base_url='', database_name='', device_id='', device_name='', **kwargs):
        """
        App-startup heartbeat. Bumps last_login AND returns the device's current
        registry status so the app can enforce blocked/deactivated on boot.
        Auto-registers a brand-new device. Never changes an existing record's
        status here — so a deactivated/blocked device is never silently
        reactivated by the heartbeat.

        Response (known):  { "registered": true, "status": "active|deactivated|blocked|pre_registered" }
        Response (new):    { "registered": false, "just_registered": true }
        """
        if not device_id or not _DEVICE_UUID_RE.match(device_id):
            return {'registered': False, 'error': 'Invalid device_id.'}
        if not database_name:
            return {'registered': False, 'error': 'Missing database_name.'}

        database_name = database_name.strip()
        base_url = (base_url or '').strip().rstrip('/')
        device_name = ((device_name or '').strip() or 'Unknown App Device')[:256]

        try:
            with Registry(database_name).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                # Fetch ALL records for this device id — blocking is device-wide.
                recs = env['device.registry'].search(
                    [('device_id', '=', device_id), ('database_name', '=', database_name)],
                )
                now = datetime.now()
                if recs:
                    newest = recs[0]  # _order = create_date desc → newest first
                    newest.write({'last_login': now})
                    cr.commit()
                    # Fail closed: if ANY record for this device is blocked, the
                    # device is blocked; otherwise the newest record's status wins.
                    blocked = recs.filtered(lambda r: r.status == 'blocked')
                    if blocked:
                        b = blocked[0]  # _order = create_date desc → latest blocked
                        return {
                            'registered': True,
                            'status': 'blocked',
                            'serial_no': b.serial_no or '',
                            'last_blocked': str(b.last_blocked or ''),
                        }
                    return {'registered': True, 'status': newest.status}
                if not base_url:
                    return {'registered': False, 'error': 'Missing base_url for new device.'}
                env['device.registry'].create({
                    'device_id': device_id,
                    'device_name': device_name,
                    'base_url': base_url,
                    'database_name': database_name,
                    'last_login': now,
                })
                cr.commit()
                _logger.info('Device auto-registered via /device/init: id=%s db=%s', device_id, database_name)
                return {'registered': False, 'just_registered': True}
        except Exception:
            _logger.exception('device_init error for db=%s', database_name)
            return {'registered': False, 'error': 'Server error during init.'}

    @http.route('/device/deactivate', type='json', auth='none', methods=['POST'], csrf=False)
    def device_deactivate(self, device_id=None, database_name=None, **kwargs):
        """
        Ends a device's session — called by the app when the user re-enters
        Device Config. Flips an 'active' record to 'deactivated'. Leaves
        'blocked' and 'pre_registered' untouched and never raises.

        A deactivated device cannot silently resume; it must re-scan its QR
        (/device/register-from-scan sets status back to active).

        Response: { "success": true } if a record was deactivated, else
                  { "success": false }.
        """
        if not device_id or not _DEVICE_UUID_RE.match(device_id):
            return {'success': False}
        db = (database_name or request.db or '').strip()
        if not db:
            return {'success': False}

        try:
            with Registry(db).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                rec = env['device.registry'].search(
                    [('device_id', '=', device_id), ('database_name', '=', db)],
                    limit=1,
                )
                if rec and rec.status == 'active':
                    rec.write({'status': 'deactivated', 'last_deactivated': datetime.now()})
                    cr.commit()
                    _logger.info('Device deactivated: id=%s db=%s', device_id, db)
                    return {'success': True}
            return {'success': False}
        except Exception:
            _logger.exception('device_deactivate failed for db=%s', db)
            return {'success': False}
