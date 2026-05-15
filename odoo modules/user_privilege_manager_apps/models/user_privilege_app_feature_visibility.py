import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class AppFeatureVisibility(models.Model):
    """Per-user record that hides one app feature."""
    _name = 'app.feature.visibility.app'
    _description = 'Per-user app feature visibility (Apps)'
    _rec_name = 'display_name'
    _order = 'user_id, feature_id'

    user_id = fields.Many2one(
        'res.users',
        string='User',
        required=True,
        ondelete='cascade',
        index=True,
    )
    feature_id = fields.Many2one(
        'app.feature.app',
        string='App Feature',
        required=True,
        ondelete='cascade',
        domain=[('active', '=', True)],
    )
    feature_key = fields.Char(
        related='feature_id.feature_key',
        store=True,
        readonly=True,
    )
    feature_description = fields.Text(
        related='feature_id.description',
        readonly=True,
    )
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    display_name = fields.Char(
        compute='_compute_display_name',
        store=True,
    )

    _sql_constraints = [
        ('user_feature_unique', 'UNIQUE(user_id, feature_id, company_id)',
         'A feature can be hidden only once per user.'),
    ]

    @api.depends('user_id', 'feature_id')
    def _compute_display_name(self):
        for rec in self:
            user_name = rec.user_id.name or ''
            feat_name = rec.feature_id.name or ''
            rec.display_name = f"{user_name} - {feat_name}"

    # ------------------------------------------------------------------
    # API: called by the React Native app at login (one RPC per session).
    # ------------------------------------------------------------------
    @api.model
    def get_hidden_features_for_user(self, user_id=None):
        """Return sorted list of feature_key strings hidden for this user."""
        if user_id is None:
            user_id = self.env.uid

        user = self.env['res.users'].sudo().browse(user_id)
        if not user.exists():
            _logger.info('[FeatureGate] uid=%s does not exist; returning []', user_id)
            return []
        if user._is_superuser():
            _logger.info('[FeatureGate] uid=%s is SUPERUSER; bypassing all hides', user_id)
            return []

        user_keys = set(self.sudo().search([
            ('user_id', '=', user_id),
            ('active', '=', True),
        ]).mapped('feature_key'))

        # Merge in role-level hides
        role_keys = self.env['privilege.role.app'].sudo().get_hidden_features_by_role(user_id)
        merged = sorted(k for k in (user_keys | set(role_keys)) if k)

        _logger.info(
            '[FeatureGate] uid=%s user-level=%s role-level=%s → merged=%s',
            user_id, sorted(user_keys), sorted(role_keys), merged,
        )
        return merged

    # ------------------------------------------------------------------
    # Admin RPCs
    # ------------------------------------------------------------------
    @api.model
    def get_user_hides_for_admin(self, user_id):
        if not user_id:
            return []
        rows = self.sudo().search([
            ('user_id', '=', int(user_id)),
            ('active', '=', True),
        ])
        return [{
            'id': r.id,
            'user_id': [r.user_id.id, r.user_id.display_name],
            'feature_id': [r.feature_id.id, r.feature_id.name or r.feature_id.feature_key],
            'feature_key': r.feature_key,
            'active': r.active,
        } for r in rows]

    @api.model
    def toggle_user_hide_admin(self, user_id, feature_id, hidden):
        if not user_id or not feature_id:
            raise UserError(_('user_id and feature_id are required.'))
        existing = self.sudo().search([
            ('user_id', '=', int(user_id)),
            ('feature_id', '=', int(feature_id)),
        ])
        if hidden:
            if not existing:
                return self.sudo().create({
                    'user_id': int(user_id),
                    'feature_id': int(feature_id),
                    'active': True,
                }).id
            inactive = existing.filtered(lambda r: not r.active)
            if inactive:
                inactive.write({'active': True})
            return existing[0].id
        if existing:
            existing.unlink()
        return False

    @api.model
    def hide_all_features_for_user(self, user_id):
        if not user_id:
            return 0
        uid = int(user_id)
        features = self.env['app.feature.app'].sudo().search([])
        existing_rows = self.sudo().search([('user_id', '=', uid)])
        existing_by_feat = {r.feature_id.id: r for r in existing_rows}
        created = 0
        reactivated = 0
        for feat in features:
            row = existing_by_feat.get(feat.id)
            if row is None:
                self.sudo().create({
                    'user_id': uid,
                    'feature_id': feat.id,
                    'active': True,
                })
                created += 1
            elif not row.active:
                row.write({'active': True})
                reactivated += 1
        total_active = self.sudo().search_count([
            ('user_id', '=', uid), ('active', '=', True),
        ])
        _logger.info(
            '[FeatureAdmin] hide_all_features_for_user uid=%s '
            'created=%s reactivated=%s total_active=%s',
            uid, created, reactivated, total_active,
        )
        return total_active

    @api.model
    def clear_all_hides_for_user(self, user_id):
        if not user_id:
            return 0
        rows = self.sudo().search([('user_id', '=', int(user_id))])
        count = len(rows)
        if count:
            rows.unlink()
        _logger.info('[FeatureAdmin] clear_all_hides_for_user uid=%s removed=%s',
                     user_id, count)
        return count

    @api.model
    def get_privilege_stats_for_user(self, user_id):
        """Return counts for the OWL Privilege Manager dashboard's stat tiles."""
        zeros = {'groups': 0, 'modules': 0, 'hidden_menus': 0,
                 'hidden_apps': 0, 'hidden_features': 0}
        if not user_id:
            return zeros
        uid = int(user_id)

        roles = self.env['privilege.role.app'].sudo().search([
            ('user_ids', 'in', [uid]),
            ('active', '=', True),
        ])

        user_hidden_modules = set(self.env['module.visibility.app'].sudo().search([
            ('user_id', '=', uid),
            ('is_visible', '=', False),
            ('active', '=', True),
        ]).mapped('module_id').ids)
        role_hidden_modules = set()
        for r in roles:
            role_hidden_modules.update(
                r.module_visibility_ids
                 .filtered(lambda x: not x.is_visible)
                 .mapped('module_id').ids
            )

        user_hidden_menus = set(self.env['menu.privilege.app'].sudo().search([
            ('user_id', '=', uid),
            ('is_visible', '=', False),
        ]).mapped('menu_id').ids)
        role_hidden_menus = set()
        for r in roles:
            role_hidden_menus.update(
                r.menu_visibility_ids
                 .filtered(lambda x: not x.is_visible)
                 .mapped('menu_id').ids
            )

        return {
            'groups': len(roles),
            'modules': self.env['module.privilege.app'].sudo().search_count([
                ('user_id', '=', uid),
                ('active', '=', True),
            ]),
            'hidden_menus': len(user_hidden_menus | role_hidden_menus),
            'hidden_apps': len(user_hidden_modules | role_hidden_modules),
            'hidden_features': self.sudo().search_count([
                ('user_id', '=', uid),
                ('active', '=', True),
            ]),
        }

    # ------------------------------------------------------------------
    # Module Privileges admin RPCs
    # ------------------------------------------------------------------
    @api.model
    def list_user_modules_admin(self, user_id):
        """Return module.privilege rows for the user with the 5 master flags."""
        if not user_id:
            return []
        rows = self.env['module.privilege.app'].sudo().search([
            ('user_id', '=', int(user_id)),
            ('active', '=', True),
        ], order='module_shortdesc, module_id')
        return [{
            'id': r.id,
            'module_id': [r.module_id.id, r.module_id.name],
            'module_shortdesc': r.module_shortdesc or r.module_id.shortdesc or r.module_id.name or '',
            'master_read':   r.master_read,
            'master_create': r.master_create,
            'master_write':  r.master_write,
            'master_cancel': r.master_cancel,
            'master_unlink': r.master_unlink,
        } for r in rows]

    @api.model
    def list_installable_modules_admin(self, user_id, search_text=''):
        if not user_id:
            return []
        used_module_ids = self.env['module.privilege.app'].sudo().search([
            ('user_id', '=', int(user_id)),
            ('active', '=', True),
        ]).mapped('module_id').ids
        domain = [('state', '=', 'installed'), ('id', 'not in', used_module_ids)]
        if search_text:
            domain += ['|', ('shortdesc', 'ilike', search_text),
                       ('name', 'ilike', search_text)]
        return self.env['ir.module.module'].sudo().search_read(
            domain, ['id', 'name', 'shortdesc'],
            limit=80, order='shortdesc, name')

    @api.model
    def set_module_master_perm_admin(self, mp_id, field, value):
        allowed = ('master_read', 'master_create', 'master_write',
                   'master_cancel', 'master_unlink')
        if field not in allowed:
            raise UserError(_('Invalid master field: %s') % field)
        mp = self.env['module.privilege.app'].sudo().browse(int(mp_id))
        if not mp.exists():
            raise UserError(_('Module privilege not found.'))
        mp.write({field: bool(value)})
        return True

    @api.model
    def grant_all_module_admin(self, mp_id):
        mp = self.env['module.privilege.app'].sudo().browse(int(mp_id))
        if not mp.exists():
            raise UserError(_('Module privilege not found.'))
        mp.write({
            'master_read': True, 'master_create': True, 'master_write': True,
            'master_cancel': True, 'master_unlink': True,
        })
        return True

    @api.model
    def read_only_module_admin(self, mp_id):
        mp = self.env['module.privilege.app'].sudo().browse(int(mp_id))
        if not mp.exists():
            raise UserError(_('Module privilege not found.'))
        mp.write({
            'master_read': True, 'master_create': False, 'master_write': False,
            'master_cancel': False, 'master_unlink': False,
        })
        return True

    @api.model
    def add_module_admin(self, user_id, module_id):
        if not user_id or not module_id:
            raise UserError(_('user_id and module_id are required.'))
        MP = self.env['module.privilege.app'].sudo()
        mp = MP.create({'user_id': int(user_id), 'module_id': int(module_id)})
        try:
            mp.action_load_models()
        except Exception:
            pass
        try:
            mp.action_apply_privileges()
        except Exception:
            pass
        try:
            MP.create_module_menu_privileges(
                module_id=int(module_id), user_id=int(user_id))
        except Exception:
            pass
        return mp.id

    @api.model
    def remove_module_admin(self, mp_id):
        MP = self.env['module.privilege.app'].sudo().browse(int(mp_id))
        if not MP.exists():
            return False
        derived_user_privs = self.env['user.privilege.app'].sudo().search(
            [('source_module_id', '=', MP.id)])
        if derived_user_privs:
            derived_user_privs.unlink()
        if 'source_module_id' in self.env['menu.privilege.app']._fields:
            derived_menu_privs = self.env['menu.privilege.app'].sudo().search(
                [('source_module_id', '=', MP.id)])
            if derived_menu_privs:
                try:
                    derived_menu_privs.unlink()
                except Exception:
                    pass
        MP.unlink()
        return True
