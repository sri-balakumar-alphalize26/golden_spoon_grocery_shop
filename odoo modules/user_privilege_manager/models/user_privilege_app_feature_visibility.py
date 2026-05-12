from odoo import models, fields, api, _
from odoo.exceptions import UserError


class AppFeatureVisibility(models.Model):
    """Per-user record that hides one app feature.

    Mirrors the module.visibility / role.module.visibility pattern: the mere
    existence of a record (with active=True) means the feature is hidden for
    that user. Removing the record restores visibility.
    """
    _name = 'app.feature.visibility'
    _description = 'Per-user app feature visibility'
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
        'app.feature',
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
        """Return sorted list of feature_key strings hidden for this user.

        Merges per-user records (this model) with per-role records
        (role.app.feature.visibility, queried via privilege.role). Most-
        restrictive wins — i.e. a key is hidden if EITHER source hides it.

        Returns [] if the caller is the superuser or has the privilege manager
        group (admins always see everything in the app, same convention the
        existing module.visibility uses).
        """
        if user_id is None:
            user_id = self.env.uid

        user = self.env['res.users'].sudo().browse(user_id)
        if not user.exists():
            return []
        if user._is_superuser() or user.has_group(
                'user_privilege_manager.group_privilege_manager'):
            return []

        keys = set(self.sudo().search([
            ('user_id', '=', user_id),
            ('active', '=', True),
        ]).mapped('feature_key'))

        # Merge in role-level hides
        role_keys = self.env['privilege.role'].sudo().get_hidden_features_by_role(user_id)
        keys.update(role_keys)
        # Drop any falsy values that could sneak in if a related field is unset
        return sorted(k for k in keys if k)

    # ------------------------------------------------------------------
    # Admin RPCs: called by the in-app App Features admin screen.
    # Both sudo internally so the caller only needs to invoke the method,
    # not have direct ACL on the records. The functional security gate is
    # the admin check in src/screens/Admin/AppFeaturesScreen.js.
    # ------------------------------------------------------------------
    @api.model
    def get_user_hides_for_admin(self, user_id):
        """Read all active per-user hide rows for `user_id`. Returns a list
        of dicts shaped like search_read output so the React Native admin
        screen can populate its toggles + unlink rows by id."""
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
        """Atomic create/unlink of the (user_id, feature_id) hide row.

        hidden=True  -> ensure a row exists. Create one if missing; reactivate
                        any archived row(s) for the pair.
        hidden=False -> unlink every row for the pair (active or not).
        """
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
    def get_privilege_stats_for_user(self, user_id):
        """Return the four counts shown on the OWL Privilege Manager
        dashboard's top stat tiles, plus a bonus app-feature count.

        All counts are computed under sudo so the calling user only needs
        to be allowed to invoke this method — same pattern as the rest of
        the admin RPCs on this model.
        """
        zeros = {'groups': 0, 'modules': 0, 'hidden_menus': 0,
                 'hidden_apps': 0, 'hidden_features': 0}
        if not user_id:
            return zeros
        uid = int(user_id)
        return {
            'groups': self.env['privilege.role'].sudo().search_count([
                ('user_ids', 'in', [uid]),
                ('active', '=', True),
            ]),
            'modules': self.env['module.privilege'].sudo().search_count([
                ('user_id', '=', uid),
                ('active', '=', True),
            ]),
            'hidden_menus': self.env['menu.privilege'].sudo().search_count([
                ('user_id', '=', uid),
                ('is_visible', '=', False),
            ]),
            'hidden_apps': self.env['module.visibility'].sudo().search_count([
                ('user_id', '=', uid),
                ('is_visible', '=', False),
                ('active', '=', True),
            ]),
            'hidden_features': self.sudo().search_count([
                ('user_id', '=', uid),
                ('active', '=', True),
            ]),
        }
