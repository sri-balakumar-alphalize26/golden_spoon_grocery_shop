import re
import logging
from datetime import datetime

import odoo.api
from odoo import http, SUPERUSER_ID
from odoo.modules.registry import Registry
from odoo.http import request
from odoo.addons.web.controllers.home import Home
from odoo.addons.web.controllers.database import Database

_logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

_COOKIE_NAME = 'odoo_device_id'
_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days


def _is_device_registered(db, device_id):
    try:
        with Registry(db).cursor() as cr:
            env = odoo.api.Environment(cr, SUPERUSER_ID, {})
            count = env['device.registry'].search_count([
                ('device_id', '=', device_id),
                ('database_name', '=', db),
            ])
        return bool(count)
    except Exception as exc:
        _logger.warning('device.registry check failed for db=%s: %s', db, exc)
        return False


def _get_databases():
    try:
        from odoo.service import db as _db_svc
        return _db_svc.list_dbs(force=True)
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Override /web/database/selector → redirect to /device/config
# ---------------------------------------------------------------------------

class DeviceDatabase(Database):

    @http.route()
    def selector(self, **kw):
        _logger.info('DeviceDatabase.selector called — redirecting to /device/config')
        return request.redirect('/device/config')


# ---------------------------------------------------------------------------
# Override /web/login → block unregistered devices
# ---------------------------------------------------------------------------

class DeviceHome(Home):

    @http.route()
    def web_login(self, redirect=None, **kw):
        if request.httprequest.method == 'GET':
            db = request.db
            device_id = request.httprequest.cookies.get(_COOKIE_NAME)
            _logger.info('web_login GET: db=%s cookie=%s', db, device_id or '<none>')

            if db and device_id and _UUID_RE.match(device_id):
                if _is_device_registered(db, device_id):
                    _logger.info('Known device — showing login page')
                    return super().web_login(redirect=redirect, **kw)

            _logger.info('Unknown device — redirecting to /device/config')
            return request.redirect('/device/config')

        # POST: let Odoo handle login normally
        response = super().web_login(redirect=redirect, **kw)
        return response


# ---------------------------------------------------------------------------
# Device setup routes
# ---------------------------------------------------------------------------

class DeviceController(http.Controller):

    @http.route(
        '/device/config',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def device_config_page(self, **kwargs):
        databases = _get_databases()
        _logger.info('device_config_page: found databases=%s', databases)

        if not databases:
            return request.redirect('/web/database/manager')

        if not request.db:
            request.update_env(db=databases[0])
            _logger.info('device_config_page: set render db=%s', databases[0])

        default_base_url = request.httprequest.host_url.rstrip('/')

        return request.render(
            'device_login_config.device_config_template',
            {
                'databases': databases,
                'default_base_url': default_base_url,
                'csrf_token': request.csrf_token(),
            },
        )

    @http.route(
        '/device/register',
        type='http',
        auth='none',
        methods=['POST'],
        csrf=True,
    )
    def device_register(self, base_url='', database_name='', device_id='', device_name='', **kwargs):
        if not device_id or not _UUID_RE.match(device_id):
            return request.make_response(
                'Invalid device ID.',
                headers=[('Content-Type', 'text/plain')],
                status=400,
            )
        if not base_url or not database_name:
            return request.make_response(
                'Missing required fields.',
                headers=[('Content-Type', 'text/plain')],
                status=400,
            )

        base_url = base_url.strip().rstrip('/')
        database_name = database_name.strip()
        device_name = (
            (device_name or '').strip()
            or (request.httprequest.user_agent.string or 'Unknown Device')
        )[:256]

        try:
            with Registry(database_name).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                existing = env['device.registry'].search(
                    [('device_id', '=', device_id), ('database_name', '=', database_name)],
                    limit=1,
                )
                now = datetime.now()
                if existing:
                    existing.write({'last_login': now})
                    _logger.info('Device re-registered: id=%s db=%s', device_id, database_name)
                else:
                    env['device.registry'].create({
                        'device_id': device_id,
                        'device_name': device_name,
                        'base_url': base_url,
                        'database_name': database_name,
                        'last_login': now,
                    })
                    _logger.info('New device registered: id=%s db=%s', device_id, database_name)
                cr.commit()
        except Exception as exc:
            _logger.error('Device registration error: %s', exc)
            return request.make_response(
                f'Registration failed: {exc}',
                headers=[('Content-Type', 'text/plain')],
                status=500,
            )

        response = request.redirect(f'/web/login?db={database_name}')
        response.set_cookie(
            _COOKIE_NAME,
            device_id,
            max_age=_COOKIE_MAX_AGE,
            httponly=False,
            samesite='Lax',
        )
        return response

    @http.route(
        '/device/check',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def device_check(self, device_id=None, database_name=None):
        if not device_id or not _UUID_RE.match(device_id):
            return {'registered': False}
        db = database_name or request.db
        if not db:
            return {'registered': False}
        return {'registered': _is_device_registered(db, device_id)}

    @http.route(
        '/device/register/app',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def device_register_app(self, base_url='', database_name='', device_id='', device_name='', **kwargs):
        if not device_id or not _UUID_RE.match(device_id):
            return {'success': False, 'error': 'Invalid device_id.'}
        if not base_url or not database_name:
            return {'success': False, 'error': 'Missing required fields.'}

        base_url = base_url.strip().rstrip('/')
        database_name = database_name.strip()
        device_name = ((device_name or '').strip() or 'Unknown App Device')[:256]

        try:
            with Registry(database_name).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                existing = env['device.registry'].search(
                    [('device_id', '=', device_id), ('database_name', '=', database_name)],
                    limit=1,
                )
                now = datetime.now()
                if existing:
                    existing.write({'last_login': now, 'device_name': device_name})
                else:
                    env['device.registry'].create({
                        'device_id': device_id,
                        'device_name': device_name,
                        'base_url': base_url,
                        'database_name': database_name,
                        'last_login': now,
                    })
                cr.commit()
        except Exception as exc:
            _logger.error('App device registration error: %s', exc)
            return {'success': False, 'error': str(exc)}

        return {'success': True}

    @http.route(
        '/device/databases',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def device_databases(self, **kwargs):
        """
        Returns list of available databases on this Odoo server.
        Call this first on app setup to populate the DB picker.

        Request:  { "jsonrpc": "2.0", "method": "call", "params": {} }
        Response: { "databases": ["db1", "db2", ...] }
        """
        return {'databases': _get_databases()}

    @http.route(
        '/device/init',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def device_init(self, base_url='', database_name='', device_id='', device_name='', **kwargs):
        """
        Single unified endpoint for app startup.

        Checks if device is registered. If yes, returns registered=true.
        If no, registers it automatically and returns registered=false + just_registered=true.

        Response (registered):     { "registered": true }
        Response (new/registered): { "registered": false, "just_registered": true }
        Response (error):          { "registered": false, "error": "..." }
        """
        if not device_id or not _UUID_RE.match(device_id):
            return {'registered': False, 'error': 'Invalid device_id.'}
        if not database_name:
            return {'registered': False, 'error': 'Missing database_name.'}

        database_name = database_name.strip()
        base_url = (base_url or '').strip().rstrip('/')
        device_name = ((device_name or '').strip() or 'Unknown App Device')[:256]

        try:
            with Registry(database_name).cursor() as cr:
                env = odoo.api.Environment(cr, SUPERUSER_ID, {})
                existing = env['device.registry'].search(
                    [('device_id', '=', device_id), ('database_name', '=', database_name)],
                    limit=1,
                )
                now = datetime.now()

                if existing:
                    # Device exists — update last login
                    existing.write({'last_login': now})
                    cr.commit()
                    return {'registered': True}
                else:
                    # New device — register it
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

        except Exception as exc:
            _logger.error('device_init error: %s', exc)
            return {'registered': False, 'error': str(exc)}
