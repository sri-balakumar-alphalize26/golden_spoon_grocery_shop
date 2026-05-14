from odoo import models, fields, api


class ResUsers(models.Model):
    _inherit = 'res.users'

    privilege_ids = fields.One2many(
        'user.privilege',
        'user_id',
        string='User Privileges',
    )
    privilege_count = fields.Integer(
        string='Privilege Count',
        compute='_compute_privilege_count',
    )
    module_privilege_ids = fields.One2many(
        'module.privilege',
        'user_id',
        string='Module Privileges',
    )
    module_privilege_count = fields.Integer(
        string='Module Privilege Count',
        compute='_compute_module_privilege_count',
    )
    menu_privilege_ids = fields.One2many(
        'menu.privilege',
        'user_id',
        string='Menu Privileges',
    )
    menu_privilege_count = fields.Integer(
        string='Menu Privilege Count',
        compute='_compute_menu_privilege_count',
    )
    # ── Hide Module Button (per user) ─────────────────────────────
    module_visibility_ids = fields.One2many(
        'module.visibility',
        'user_id',
        string='Module (App) Visibility',
    )
    module_visibility_count = fields.Integer(
        string='Module Visibility Count',
        compute='_compute_module_visibility_count',
    )
    role_count = fields.Integer(
        string='Group Count',
        compute='_compute_role_count',
    )

    @api.depends('privilege_ids')
    def _compute_privilege_count(self):
        for user in self:
            user.privilege_count = len(user.privilege_ids)

    @api.depends('module_privilege_ids')
    def _compute_module_privilege_count(self):
        for user in self:
            user.module_privilege_count = len(user.module_privilege_ids)

    @api.depends('menu_privilege_ids')
    def _compute_menu_privilege_count(self):
        for user in self:
            user.menu_privilege_count = len(user.menu_privilege_ids)

    @api.depends('module_visibility_ids')
    def _compute_module_visibility_count(self):
        for user in self:
            user.module_visibility_count = len(user.module_visibility_ids)

    def _compute_role_count(self):
        for user in self:
            if not user._origin.id:
                user.role_count = 0
                continue
            user.role_count = self.env['privilege.role'].sudo().search_count([
                ('user_ids', 'in', [user._origin.id]),
                ('active', '=', True),
            ])

    def action_view_privileges(self):
        self.ensure_one()
        return {
            'name': f'Privileges - {self.name}',
            'type': 'ir.actions.act_window',
            'res_model': 'user.privilege',
            'view_mode': 'list,form',
            'domain': [('user_id', '=', self.id)],
            'context': {'default_user_id': self.id},
        }

    def action_view_module_privileges(self):
        self.ensure_one()
        return {
            'name': f'Module Privileges - {self.name}',
            'type': 'ir.actions.act_window',
            'res_model': 'module.privilege',
            'view_mode': 'list,form',
            'domain': [('user_id', '=', self.id)],
            'context': {'default_user_id': self.id},
        }

    def action_view_menu_privileges(self):
        self.ensure_one()
        return {
            'name': f'Menu Privileges - {self.name}',
            'type': 'ir.actions.act_window',
            'res_model': 'menu.privilege',
            'view_mode': 'list,form',
            'domain': [('user_id', '=', self.id)],
            'context': {'default_user_id': self.id},
        }

    def action_view_roles(self):
        self.ensure_one()
        return {
            'name': f'Groups - {self.name}',
            'type': 'ir.actions.act_window',
            'res_model': 'privilege.role',
            'view_mode': 'list,form',
            'domain': [('user_ids', 'in', [self.id])],
        }

    def action_view_module_visibility(self):
        self.ensure_one()
        return {
            'name': f'Module Visibility - {self.name}',
            'type': 'ir.actions.act_window',
            'res_model': 'module.visibility',
            'view_mode': 'list,form',
            'domain': [('user_id', '=', self.id)],
            'context': {'default_user_id': self.id},
        }


import threading
_group_check_bypass = threading.local()

class ResUsersGroupOverride(models.Model):
    """
    Override has_group / _has_group so that Odoo's native group checks
    (e.g. purchase.group_purchase_manager, stock.group_stock_manager)
    respect our privilege group mappings.

    When a user's privilege group has odoo_group_ids that include a group,
    has_group() returns True for that group — even if the user is not
    directly a member of that Odoo group in res.groups.

    This makes group-based access work for ALL Odoo module behaviours
    that gate functionality on groups (confirm buttons, approval limits,
    manager-only menus inside views, etc.)
    """
    _inherit = 'res.users'

    def _get_role_group_xmlids(self):
        """
        Return set of group xml_ids that this user has via their privilege groups.
        Uses raw SQL to avoid any ORM recursion.
        Uses thread-local to prevent re-entry.
        """
        if getattr(_group_check_bypass, 'active', False):
            return set()
        try:
            _group_check_bypass.active = True
            uid = self.id or self.env.uid
            cr = self.env.cr
            # Get all group IDs from all active roles this user belongs to
            cr.execute("""
                SELECT DISTINCT grp_id FROM (
                    -- manually mapped odoo groups
                    SELECT prg.group_id AS grp_id
                    FROM privilege_role_odoo_groups_rel prg
                    JOIN privilege_role_users_rel pru ON pru.role_id = prg.role_id
                    JOIN privilege_role pr ON pr.id = prg.role_id
                    WHERE pru.user_id = %s AND pr.active = true
                    UNION ALL
                    -- auto-created group for each role
                    SELECT pr.auto_odoo_group_id AS grp_id
                    FROM privilege_role pr
                    JOIN privilege_role_users_rel pru ON pru.role_id = pr.id
                    WHERE pru.user_id = %s
                      AND pr.active = true
                      AND pr.auto_odoo_group_id IS NOT NULL
                ) sub WHERE grp_id IS NOT NULL
            """, (uid, uid))
            group_ids = {row[0] for row in cr.fetchall()}
            if not group_ids:
                return set()
            # Get xml_ids for those groups
            cr.execute("""
                SELECT imd.module || '.' || imd.name
                FROM ir_model_data imd
                WHERE imd.model = 'res.groups'
                  AND imd.res_id = ANY(%s)
            """, (list(group_ids),))
            return {row[0] for row in cr.fetchall()}
        except Exception:
            return set()
        finally:
            _group_check_bypass.active = False

    def has_group(self, group_ext_id):
        """
        Override has_group to include groups granted via privilege groups.
        First checks standard Odoo group membership, then checks privilege group-mapped groups.
        """
        # Standard check first
        result = super().has_group(group_ext_id)
        if result:
            return True
        # Check if any of user's privilege groups grant this group
        try:
            role_groups = self._get_role_group_xmlids()
            if group_ext_id in role_groups:
                return True
        except Exception:
            pass
        return False
