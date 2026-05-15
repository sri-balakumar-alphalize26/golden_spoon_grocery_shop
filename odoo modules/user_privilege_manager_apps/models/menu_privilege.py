import logging
from odoo import models, fields, api, _

_logger = logging.getLogger(__name__)


class MenuPrivilege(models.Model):
    _name = 'menu.privilege.app'
    _description = 'Menu Visibility Privilege (Apps)'
    _rec_name = 'display_name'
    _order = 'user_id, menu_id'
    _sql_constraints = [
        ('user_menu_unique', 'UNIQUE(user_id, menu_id)',
         'A menu privilege record already exists for this user and menu!'),
    ]

    user_id = fields.Many2one('res.users', required=True, ondelete='cascade', index=True)
    menu_id = fields.Many2one('ir.ui.menu', required=True, ondelete='cascade', index=True)
    menu_full_name = fields.Char(related='menu_id.complete_name', store=True, readonly=True)
    is_visible = fields.Boolean(default=True)
    active = fields.Boolean(default=True)
    notes = fields.Char()
    display_name = fields.Char(compute='_compute_display_name', store=True)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)
    source_module_id = fields.Many2one(
        'ir.module.module',
        string='Source Module',
        ondelete='set null',
        index=True,
        help='Set when this menu privilege was auto-created from a module addition.',
    )

    @api.depends('user_id', 'menu_id')
    def _compute_display_name(self):
        for rec in self:
            rec.display_name = (
                f"{rec.user_id.name or ''} - "
                f"{rec.menu_id.complete_name or rec.menu_id.name or ''}"
            )

    def write(self, vals):
        res = super().write(vals)
        self.env.registry.clear_cache()
        return res

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        self.env.registry.clear_cache()
        return records

    def unlink(self):
        res = super().unlink()
        self.env.registry.clear_cache()
        return res


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    def _filter_visible_menus(self):
        menus = super()._filter_visible_menus()

        try:
            uid = self.env.uid
            if not uid or uid <= 2:
                return menus

            cr = self.env.cr
            hidden = set()

            cr.execute("SAVEPOINT priv_menu_filter_app")
            try:
                # a) User-level hidden menus
                cr.execute("""
                    SELECT menu_id FROM menu_privilege_app
                    WHERE user_id = %s
                      AND is_visible = false
                      AND active = true
                """, (uid,))
                hidden.update(r[0] for r in cr.fetchall())

                # b) Role-level hidden menus
                cr.execute("""
                    SELECT DISTINCT rmv.menu_id
                    FROM role_menu_visibility_app rmv
                    JOIN privilege_role_app pr ON pr.id = rmv.role_id
                    JOIN privilege_role_app_users_rel pru ON pru.role_id = pr.id
                    WHERE pru.user_id = %s
                      AND pr.active = true
                      AND rmv.is_visible = false
                """, (uid,))
                role_hidden = {r[0] for r in cr.fetchall()}

                cr.execute("""
                    SELECT menu_id FROM menu_privilege_app
                    WHERE user_id = %s AND is_visible = true AND active = true
                """, (uid,))
                user_visible = {r[0] for r in cr.fetchall()}
                hidden.update(m for m in role_hidden if m not in user_visible)

                # c) Apps special menu
                cr.execute("""
                    SELECT 1 FROM special_menu_privilege_app
                    WHERE user_id = %s AND menu_key = 'apps' AND is_visible = false
                    LIMIT 1
                """, (uid,))
                if cr.fetchone():
                    cr.execute("""
                        SELECT id FROM ir_ui_menu
                        WHERE parent_id IS NULL
                          AND active = true
                          AND (
                              name->>'en_US' ILIKE 'apps'
                              OR name::text ILIKE '%%apps%%'
                          )
                    """)
                    hidden.update(r[0] for r in cr.fetchall())

                # d) Expand to all child menus
                cr.execute(
                    "SELECT id, parent_id FROM ir_ui_menu WHERE parent_id IS NOT NULL"
                )
                children_map = {}
                for row in cr.fetchall():
                    children_map.setdefault(row[1], []).append(row[0])

                cr.execute("RELEASE SAVEPOINT priv_menu_filter_app")

            except Exception as e:
                cr.execute("ROLLBACK TO SAVEPOINT priv_menu_filter_app")
                cr.execute("RELEASE SAVEPOINT priv_menu_filter_app")
                _logger.warning("privilege filter SQL rolled back: %s", e)
                return menus

            if not hidden:
                return menus

            expanded = set(hidden)
            queue = list(hidden)
            while queue:
                pid = queue.pop()
                for cid in children_map.get(pid, []):
                    if cid not in expanded:
                        expanded.add(cid)
                        queue.append(cid)

            if expanded:
                _logger.info(
                    "PrivilegeManager: _filter_visible_menus hiding %d menus for uid=%s (direct hidden=%d)",
                    len(expanded), uid, len(hidden)
                )

            return menus.filtered(lambda m: m.id not in expanded)

        except Exception as e:
            _logger.warning("privilege _filter_visible_menus: %s", e)
            return menus


class SpecialMenuPrivilege(models.Model):
    _name = 'special.menu.privilege.app'
    _description = 'Special Menu Privilege (Client-Side, Apps)'
    _sql_constraints = [
        ('user_special_unique', 'UNIQUE(user_id, menu_key)',
         'A special menu privilege already exists for this user and menu!'),
    ]

    user_id = fields.Many2one('res.users', required=True, ondelete='cascade', index=True)
    menu_key = fields.Selection([
        ('apps', 'Apps'),
        ('home', 'Home'),
        ('discuss', 'Discuss'),
        ('dashboards', 'Dashboards'),
    ], string='Menu', required=True)
    is_visible = fields.Boolean(default=False)

    @api.model
    def get_hidden_special_menus(self):
        """Called by navbar_patch.js — returns hidden menu keys for current user."""
        uid = self.env.uid
        if not uid or uid <= 2:
            return []
        try:
            cr = self.env.cr
            cr.execute("""
                SELECT 1 FROM res_groups_users_rel rel
                JOIN ir_model_data imd
                  ON imd.model = 'res.groups' AND imd.res_id = rel.gid
                WHERE rel.uid = %s
                  AND imd.module = 'user_privilege_manager_apps'
                  AND imd.name = 'group_privilege_apps_manager'
                LIMIT 1
            """, (uid,))
            if cr.fetchone():
                return []
            cr.execute("""
                SELECT menu_key FROM special_menu_privilege_app
                WHERE user_id = %s AND is_visible = false
            """, (uid,))
            return [r[0] for r in cr.fetchall()]
        except Exception as e:
            _logger.warning("get_hidden_special_menus: %s", e)
            return []

    def write(self, vals):
        res = super().write(vals)
        self.env.registry.clear_cache()
        return res

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        self.env.registry.clear_cache()
        return records

    def unlink(self):
        res = super().unlink()
        self.env.registry.clear_cache()
        return res
