import re
import logging
import threading
from odoo import models, api, _
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

# ── Thread-local bypass flag — prevents re-entry into our overrides ───────────
_privilege_bypass = threading.local()

def _is_bypassing():
    return getattr(_privilege_bypass, 'active', False)

class _Bypass:
    """Context manager that sets the bypass flag and clears it on exit."""
    def __enter__(self):
        _privilege_bypass.active = True
    def __exit__(self, *_):
        _privilege_bypass.active = False

# ── Models excluded from ALL privilege checks ─────────────────────────────────
EXCLUDED_MODELS = {
    'user.privilege', 'module.privilege', 'module.privilege.line',
    'menu.privilege', 'privilege.role', 'role.privilege.line',
    'role.menu.visibility', 'role.module.visibility', 'module.visibility',
    'ir.model', 'ir.model.fields', 'ir.model.access', 'ir.model.data',
    'ir.rule', 'ir.module.module', 'ir.module.category',
    'ir.ui.view', 'ir.ui.menu', 'ir.actions.act_window',
    'ir.actions.act_window.view', 'ir.actions.server', 'ir.actions.report',
    'ir.actions.client', 'ir.config_parameter', 'ir.sequence',
    'ir.attachment', 'ir.cron', 'ir.logging', 'ir.translation',
    'ir.property', 'ir.default', 'ir.filters', 'ir.exports', 'ir.mail_server',
    'base.language.install', 'base.module.update', 'base.module.upgrade',
    'bus.bus', 'bus.presence',
    'mail.message', 'mail.mail', 'mail.followers', 'mail.notification',
    'mail.activity', 'mail.activity.type', 'mail.channel', 'mail.channel.member',
    'res.config', 'res.config.settings', 'res.lang', 'res.groups',
    'res.groups.privilege', 'res.users', 'res.users.log', 'res.users.settings',
}


def _should_check(model):
    if _is_bypassing():
        return False
    if model._name in EXCLUDED_MODELS:
        return False
    if model._transient:
        return False
    if model.env.su:
        return False
    if model._name.startswith('ir.') or model._name.startswith('base.'):
        return False
    return True


def _get_priv(env, model_name):
    """Return privilege dict for current user, or None if no record."""
    try:
        with _Bypass():
            return env['user.privilege'].get_user_privilege(model_name)
    except Exception:
        return None


def _raise_deny(env, model_name, operation):
    try:
        model_desc = env['ir.model'].sudo().search(
            [('model', '=', model_name)], limit=1
        ).name or model_name
    except Exception:
        model_desc = model_name
    op_labels = {
        'create': _('Create'), 'read': _('Read'),
        'write': _('Edit'), 'cancel': _('Cancel'), 'unlink': _('Delete'),
    }
    raise AccessError(_(
        "You do not have '%(op)s' privilege on '%(model)s'. "
        "Contact your administrator.",
        op=op_labels.get(operation, operation),
        model=model_desc,
    ))


def _inject_attr(arch, tag, attr, value):
    if not arch or not isinstance(arch, str):
        return arch
    pattern = rf'(<{tag}\b[^>]*?)>'
    def replacer(m):
        existing = m.group(1)
        if f'{attr}=' in existing:
            return m.group(0)
        return f'{existing} {attr}="{value}">'
    return re.sub(pattern, replacer, arch, count=1)


class BaseModel(models.AbstractModel):
    """
    Privilege enforcement mixin for ALL Odoo models.

    GRANT logic  (group says allow):
        We call the ORM method on self.sudo() inside a _Bypass() context.
        sudo() bypasses ir.model.access. _Bypass() prevents our override
        from running again on that inner call. This is the correct Odoo
        pattern — it does NOT change the user, only skips ACL table checks.

    DENY logic (group says block):
        Raise AccessError immediately, before any ORM work.

    NO RECORD (no privilege defined):
        Fall through to super() — standard Odoo group/ACL applies.
    """
    _inherit = 'base'

    # ── check_access_rights ───────────────────────────────────────────────────

    def check_access_rights(self, operation, raise_exception=True):
        if not _should_check(self):
            return super().check_access_rights(operation, raise_exception=raise_exception)
        try:
            priv = _get_priv(self.env, self._name)
            if priv is not None:
                op_map = {
                    'read': 'perm_read', 'write': 'perm_write',
                    'create': 'perm_create', 'unlink': 'perm_unlink',
                }
                perm_key = op_map.get(operation)
                if perm_key:
                    if priv.get(perm_key, True):
                        return True          # group GRANTS — skip ACL check
                    else:
                        if raise_exception:
                            _raise_deny(self.env, self._name, operation)
                        return False         # group DENIES
        except AccessError:
            raise
        except Exception:
            pass
        return super().check_access_rights(operation, raise_exception=raise_exception)

    # ── get_views ─────────────────────────────────────────────────────────────

    @api.model
    def get_views(self, views, options=None):
        result = super().get_views(views, options or {})
        if not _should_check(self):
            return result
        try:
            priv = _get_priv(self.env, self._name)
            if priv is None:
                return result
            can_create = priv.get('perm_create', True)
            can_write  = priv.get('perm_write', True)
            can_delete = priv.get('perm_unlink', True)
            can_read   = priv.get('perm_read', True)
            if can_create and can_write and can_delete and can_read:
                return result
            for view_type, view_data in result.get('views', {}).items():
                arch = view_data.get('arch', '')
                if not arch or not isinstance(arch, str):
                    continue
                if view_type == 'form':
                    if not can_create:
                        arch = _inject_attr(arch, 'form', 'create', 'false')
                    if not can_write:
                        arch = _inject_attr(arch, 'form', 'edit', 'false')
                    if not can_delete:
                        arch = _inject_attr(arch, 'form', 'delete', 'false')
                elif view_type in ('list', 'tree'):
                    root_tag = 'list' if '<list' in arch else 'tree'
                    if not can_create:
                        arch = _inject_attr(arch, root_tag, 'create', 'false')
                    if not can_delete:
                        arch = _inject_attr(arch, root_tag, 'delete', 'false')
                    if not can_write:
                        arch = _inject_attr(arch, root_tag, 'editable', 'false')
                elif view_type == 'kanban':
                    if not can_create:
                        arch = _inject_attr(arch, 'kanban', 'create', 'false')
                    if not can_delete:
                        arch = _inject_attr(arch, 'kanban', 'delete', 'false')
                view_data['arch'] = arch
        except Exception as e:
            _logger.warning('get_views privilege injection error: %s', e)
        return result

    # ── search ────────────────────────────────────────────────────────────────

    @api.model
    def search(self, domain=None, offset=0, limit=None, order=None):
        if _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_read', True):
                        return self.browse()   # DENY — return empty
                    # GRANT — fall through to super() which now passes check_access_rights
            except AccessError:
                raise
            except Exception:
                pass
        return super().search(domain or [], offset=offset, limit=limit, order=order)

    # ── search_count ──────────────────────────────────────────────────────────

    @api.model
    def search_count(self, domain=None, limit=None):
        if _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_read', True):
                        return 0
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        if limit is not None:
            return super().search_count(domain or [], limit=limit)
        return super().search_count(domain or [])

    # ── read ──────────────────────────────────────────────────────────────────

    def read(self, fields=None, load='_classic_read'):
        if self.ids and _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_read', True):
                        _raise_deny(self.env, self._name, 'read')
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        return super().read(fields=fields, load=load)

    # ── web_search_read ───────────────────────────────────────────────────────

    @api.model
    def web_search_read(self, domain=None, specification=None, offset=0,
                        limit=None, order=None, count_limit=None):
        if _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_read', True):
                        return {'records': [], 'length': 0}
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        return super().web_search_read(
            domain=domain, specification=specification,
            offset=offset, limit=limit, order=order, count_limit=count_limit,
        )

    # ── create ────────────────────────────────────────────────────────────────

    @api.model_create_multi
    def create(self, vals_list):
        if _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_create', True):
                        _raise_deny(self.env, self._name, 'create')    # DENY
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        return super().create(vals_list)

    # ── write ─────────────────────────────────────────────────────────────────

    def write(self, vals):
        if self.ids and _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_write', True):
                        _raise_deny(self.env, self._name, 'write')     # DENY
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        return super().write(vals)

    # ── unlink ────────────────────────────────────────────────────────────────

    def unlink(self):
        if self.ids and _should_check(self):
            try:
                priv = _get_priv(self.env, self._name)
                if priv is not None:
                    if not priv.get('perm_unlink', True):
                        _raise_deny(self.env, self._name, 'unlink')    # DENY
                    # GRANT — fall through to super()
            except AccessError:
                raise
            except Exception:
                pass
        return super().unlink()

    # ── cancel ────────────────────────────────────────────────────────────────

    def _check_cancel_privilege(self):
        if not _should_check(self):
            return
        try:
            priv = _get_priv(self.env, self._name)
            if priv is not None and not priv.get('perm_cancel', True):
                _raise_deny(self.env, self._name, 'cancel')
        except AccessError:
            raise
        except Exception:
            pass

    def action_cancel(self):
        self._check_cancel_privilege()
        if hasattr(super(), 'action_cancel'):
            return super().action_cancel()

    def button_cancel(self):
        self._check_cancel_privilege()
        if hasattr(super(), 'button_cancel'):
            return super().button_cancel()

    def action_refuse(self):
        self._check_cancel_privilege()
        if hasattr(super(), 'action_refuse'):
            return super().action_refuse()

    def action_reject(self):
        self._check_cancel_privilege()
        if hasattr(super(), 'action_reject'):
            return super().action_reject()

    # ── utility ───────────────────────────────────────────────────────────────

    @api.model
    def get_user_privileges_for_model(self):
        try:
            priv = _get_priv(self.env, self._name)
        except Exception:
            priv = None
        if priv is None:
            return {
                'has_privilege_record': False,
                'perm_read': True, 'perm_create': True,
                'perm_write': True, 'perm_cancel': True, 'perm_unlink': True,
            }
        priv['has_privilege_record'] = True
        return priv
