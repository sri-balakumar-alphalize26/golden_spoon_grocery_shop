import logging
from odoo import models, fields, api, _

_logger = logging.getLogger(__name__)


class ModuleVisibility(models.Model):
    """
    Hide Module Button (App Icon) per User.

    Strategy:
    - When you hide a module for a user, we auto-create menu.privilege records
      for ALL root menu items that belong to that module, setting is_visible=False.
    - This means the app icon (which IS a root menu item in Odoo) disappears,
      AND all sub-menus under it disappear too.
    - This hooks into the already-working IrUiMenu.search() override — so it
      works in real-time on every page load, no JS patching needed.

    Precedence: User-level record > Group-level record > Default (visible)
    """
    _name = 'module.visibility'
    _description = 'Module (App) Visibility per User'
    _rec_name = 'display_name'
    _order = 'user_id, module_id'
    _sql_constraints = [
        ('user_module_vis_unique', 'UNIQUE(user_id, module_id, company_id)',
         'A module visibility record already exists for this user and module!'),
    ]

    user_id = fields.Many2one(
        'res.users',
        string='User',
        required=True,
        ondelete='cascade',
        index=True,
    )
    module_id = fields.Many2one(
        'ir.module.module',
        string='Module (App)',
        required=True,
        ondelete='cascade',
        domain=[('state', '=', 'installed')],
        index=True,
        help='Select an installed Odoo module/application to control its visibility.',
    )
    module_name = fields.Char(
        related='module_id.name',
        string='Technical Name',
        store=True,
        readonly=True,
    )
    module_shortdesc = fields.Char(
        related='module_id.shortdesc',
        string='App Label',
        readonly=True,
    )
    is_visible = fields.Boolean(
        string='Visible',
        default=True,
        help=(
            'If unchecked, this module\'s app icon AND all its menus will be '
            'hidden for the user. Takes effect on next page refresh.'
        ),
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
    notes = fields.Text(string='Notes')

    @api.depends('user_id', 'module_id')
    def _compute_display_name(self):
        for rec in self:
            user_name = rec.user_id.name or ''
            mod_name = rec.module_id.shortdesc or rec.module_id.name or ''
            rec.display_name = f"{user_name} - {mod_name}"

    # ------------------------------------------------------------------
    # Core: sync to menu.privilege when is_visible changes
    # ------------------------------------------------------------------

    def _get_module_root_menus(self, module_name):
        """
        Find ALL root menus (app icons) that belong to this module.

        Strategy 1: ir.model.data — menus registered under this module's xml_id
        Strategy 2: ir.module.module.category — find app category then its menus
        Strategy 3: Fallback — find root menus whose name matches module shortdesc

        Root menus = menus with no parent (these are the app icons in home screen).
        """
        IrMenu = self.env['ir.ui.menu'].sudo()
        IrData = self.env['ir.model.data'].sudo()

        # Strategy 1: ir.model.data lookup
        menu_data = IrData.search([
            ('model', '=', 'ir.ui.menu'),
            ('module', '=', module_name),
        ])
        menu_ids = set(menu_data.mapped('res_id'))
        menus = IrMenu.browse(list(menu_ids)).exists()
        root_menus = menus.filtered(lambda m: not m.parent_id)
        if root_menus:
            return root_menus

        # Strategy 2: find menus whose xml_id starts with module_name
        all_data = IrData.search([
            ('model', '=', 'ir.ui.menu'),
            ('module', 'like', module_name),
        ])
        all_menu_ids = set(all_data.mapped('res_id'))
        all_menus = IrMenu.browse(list(all_menu_ids)).exists()
        root_menus2 = all_menus.filtered(lambda m: not m.parent_id)
        if root_menus2:
            return root_menus2

        # Strategy 3: root menus with any of the module's registered menu IDs' ancestors
        if all_menus:
            # Walk up to find root
            root_set = IrMenu.browse()
            for menu in all_menus:
                current = menu
                while current.parent_id:
                    current = current.parent_id
                root_set |= current
            if root_set:
                return root_set

        # Strategy 4: all root menus as last resort (not ideal but better than nothing)
        return IrMenu.browse()

    def _get_all_menus_for_module(self, module_name):
        """
        Return ALL menus (root + every descendant) that belong to this module.
        Hiding only the root is not enough — Odoo 19 will still show sub-menus
        in the nav bar. We must hide the entire tree.
        """
        IrMenu = self.env['ir.ui.menu'].sudo()
        IrData = self.env['ir.model.data'].sudo()

        # Collect all menu IDs registered by this module
        menu_data = IrData.search([
            ('model', '=', 'ir.ui.menu'),
            ('module', '=', module_name),
        ])
        direct_ids = set(menu_data.mapped('res_id'))

        # Also try broader match (submodules like easy_sale -> easy_sale_*)
        broader = IrData.search([
            ('model', '=', 'ir.ui.menu'),
            ('module', 'like', module_name),
        ])
        direct_ids.update(broader.mapped('res_id'))

        if not direct_ids:
            return IrMenu.browse()

        # Find root menus in this set
        all_found = IrMenu.browse(list(direct_ids)).exists()
        root_menus = all_found.filtered(lambda m: not m.parent_id)

        # Walk up to find root for non-root menus
        for menu in all_found:
            current = menu
            while current.parent_id:
                current = current.parent_id
            root_menus |= current

        # Now collect root + ALL descendants
        all_menu_records = IrMenu.search([])
        by_parent = {}
        for m in all_menu_records:
            pid = m.parent_id.id if m.parent_id else 0
            by_parent.setdefault(pid, IrMenu.browse())
            by_parent[pid] |= m

        def collect_tree(menu):
            result = menu
            for child in by_parent.get(menu.id, IrMenu.browse()):
                result |= collect_tree(child)
            return result

        full_tree = IrMenu.browse()
        for root in root_menus:
            full_tree |= collect_tree(root)

        return full_tree

    def _sync_menu_privileges(self, user_id, module_name, is_visible, company_id=None):
        """
        Create or update menu.privilege records for ALL menus of this module
        (root + every descendant). Hiding only the root is not enough in Odoo 19 —
        sub-menus still appear in the nav bar unless explicitly hidden too.
        """
        MenuPrivilege = self.env['menu.privilege'].sudo()
        all_menus = self._get_all_menus_for_module(module_name)

        if not all_menus:
            _logger.warning(
                'ModuleVisibility: No menus found for module %s', module_name
            )
            return

        for menu in all_menus:
            existing = MenuPrivilege.search([
                ('user_id', '=', user_id),
                ('menu_id', '=', menu.id),
            ], limit=1)
            vals = {
                'user_id': user_id,
                'menu_id': menu.id,
                'is_visible': is_visible,
                'active': True,
            }
            if company_id:
                vals['company_id'] = company_id
            if existing:
                existing.write(vals)
            else:
                MenuPrivilege.create(vals)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if rec.module_name:
                self._sync_menu_privileges(
                    rec.user_id.id,
                    rec.module_name,
                    rec.is_visible,
                    rec.company_id.id if rec.company_id else None,
                )
        return records

    def write(self, vals):
        res = super().write(vals)
        # Re-sync if visibility or user changed
        if 'is_visible' in vals or 'user_id' in vals or 'active' in vals:
            for rec in self:
                if rec.module_name:
                    effective_visible = rec.is_visible if rec.active else True
                    self._sync_menu_privileges(
                        rec.user_id.id,
                        rec.module_name,
                        effective_visible,
                        rec.company_id.id if rec.company_id else None,
                    )
        return res

    def unlink(self):
        # Restore visibility when record is deleted
        for rec in self:
            if rec.module_name:
                self._sync_menu_privileges(
                    rec.user_id.id,
                    rec.module_name,
                    True,  # restore to visible
                    rec.company_id.id if rec.company_id else None,
                )
        return super().unlink()

    # ------------------------------------------------------------------
    # Helpers used by privilege.role for group-level module hiding
    # ------------------------------------------------------------------

    @api.model
    def get_hidden_modules_for_user(self, user_id=None):
        """Return set of module technical names hidden for this user (user + groups)."""
        if user_id is None:
            user_id = self.env.uid

        user = self.env['res.users'].sudo().browse(user_id)
        if user._is_superuser() or user.has_group(
                'user_privilege_manager.group_privilege_manager'):
            return set()

        hidden = set()

        user_records = self.sudo().search([
            ('user_id', '=', user_id),
            ('is_visible', '=', False),
            ('active', '=', True),
        ])
        hidden.update(user_records.mapped('module_name'))

        user_visible_names = set(self.sudo().search([
            ('user_id', '=', user_id),
            ('is_visible', '=', True),
            ('active', '=', True),
        ]).mapped('module_name'))

        role_hidden = self.env['privilege.role'].sudo().get_hidden_modules_by_role(user_id)
        for mod_name in role_hidden:
            if mod_name not in user_visible_names:
                hidden.add(mod_name)

        return hidden
