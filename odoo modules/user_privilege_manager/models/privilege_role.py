import logging
from odoo import models, fields, api, _

_logger = logging.getLogger(__name__)

# Maps model prefixes → minimum Odoo group needed to ACCESS that module's menus/data.
# When a role has models from these modules, users are auto-added to these groups
# so Odoo's native menu visibility and workflow access works correctly.
# Format: 'model_prefix_or_name': 'module.group_xml_id'
MODULE_GROUP_MAP = {
    # Sales
    'sale.':              'sales_team.group_sale_salesman',
    'easy.sales':         'sales_team.group_sale_salesman',
    # Purchase
    'purchase.':          'purchase.group_purchase_user',
    # Inventory / Stock
    'stock.':             'stock.group_stock_user',
    'mrp.':               'mrp.group_mrp_user',
    # Accounting
    'account.':           'account.group_account_user',
    # Project
    'project.':           'project.group_project_user',
    # HR
    'hr.':                'hr.group_hr_user',
    'hr.leave':           'hr_holidays.group_hr_holidays_user',
    # CRM
    'crm.':               'sales_team.group_sale_salesman',
    # Helpdesk
    'helpdesk.':          'helpdesk.group_helpdesk_user',
    # Manufacturing
    'mrp.':               'mrp.group_mrp_user',
    # Discuss / Messaging (always available, skip)
}

# Maps Odoo module technical names → required group XML IDs.
# When a module that DEPENDS on these is added to a role,
# the users get added to these groups so dependent models are accessible.
DEPENDENCY_MODULE_GROUP_MAP = {
    'sale':         'sales_team.group_sale_salesman',
    'sale_management': 'sales_team.group_sale_salesman',
    'purchase':     'purchase.group_purchase_user',
    'stock':        'stock.group_stock_user',
    'account':      'account.group_account_user',
    'account_accountant': 'account.group_account_user',
    'project':      'project.group_project_user',
    'hr':           'hr.group_hr_user',
    'hr_holidays':  'hr_holidays.group_hr_holidays_user',
    'crm':          'sales_team.group_sale_salesman',
    'helpdesk':     'helpdesk.group_helpdesk_user',
    'mrp':          'mrp.group_mrp_user',
}



class PrivilegeRole(models.Model):
    """
    Privilege Group — works like an Odoo Group but for custom privileges.

    How it mirrors Odoo groups:
    - Users are assigned to groups (like res.groups user_ids)
    - Groups have model-level CRUD lines (like ir.model.access per group)
    - Groups have menu visibility lines (like ir.ui.menu groups attribute)
    - Groups have module visibility lines (hide entire app icons)
    - Multiple groups merge with "most permissive wins" for CRUD
    - Multiple groups merge with "most restrictive wins" for visibility
    - User-level records ALWAYS override group-level (just like direct group override)

    When users are ADDED to a group → their menus/modules are immediately synced.
    When users are REMOVED from a group → their synced restrictions are cleaned up.
    """
    _name = 'privilege.role'
    _description = 'Privilege Group'
    _order = 'name'

    name = fields.Char('Group Name', required=True)
    description = fields.Text('Description')
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )

    user_ids = fields.Many2many(
        'res.users',
        'privilege_role_users_rel',
        'role_id', 'user_id',
        string='Users',
    )
    user_count = fields.Integer(compute='_compute_user_count', string='User Count')

    # ── Odoo Groups mapping ───────────────────────────────────────
    # When users are added to this group, they are ALSO added to these
    # native Odoo groups (e.g. purchase.group_purchase_manager).
    # This makes group-based access fully override Odoo's default group limits.
    # Auto-created Odoo group for this privilege group
    auto_odoo_group_id = fields.Many2one(
        'res.groups',
        string='Auto Group',
        readonly=True,
        copy=False,
        help='Odoo group automatically created for this privilege group. Do not edit manually.',
    )

    # Additional manually-mapped Odoo groups (existing Odoo groups like purchase.group_purchase_manager)
    odoo_group_ids = fields.Many2many(
        'res.groups',
        'privilege_role_odoo_groups_rel',
        'role_id', 'group_id',
        string='Linked Odoo Groups',
        help='Existing Odoo groups to also assign to users of this privilege group. '
             'The auto-created group above is always included automatically.',
    )

    # Multi-company support
    company_ids = fields.Many2many(
        'res.company',
        'privilege_role_company_rel',
        'role_id', 'company_id',
        string='Companies',
        default=lambda self: self.env.company,
        help='This group applies to users working in these companies. '
             'Leave empty to apply to all companies.',
    )

    # ── Model CRUD privileges ─────────────────────────────────────
    line_ids = fields.One2many(
        'role.privilege.line', 'role_id',
        string='Model Privileges',
        copy=True,
    )

    # ── Hide Menu Button per Role ─────────────────────────────────
    menu_visibility_ids = fields.One2many(
        'role.menu.visibility', 'role_id',
        string='Menu Visibility',
        copy=True,
        help='Menus listed here with Visible=False will be hidden for all users in this group.',
    )

    # ── Hide Module Button per Role ───────────────────────────────
    module_visibility_ids = fields.One2many(
        'role.module.visibility', 'role_id',
        string='Module (App) Visibility',
        copy=True,
        help='Apps listed here with Visible=False will be hidden for all users in this group.',
    )

    # ── Master toggles for quick bulk control ────────────────────
    add_model_ids = fields.Many2many(
        'ir.model',
        string='Add Models',
        domain=[('transient', '=', False)],
        store=False,
    )
    master_read = fields.Boolean(string='Read All', default=True)
    master_create = fields.Boolean(string='Create All', default=True)
    master_write = fields.Boolean(string='Edit All', default=True)
    master_cancel = fields.Boolean(string='Cancel All', default=True)
    master_unlink = fields.Boolean(string='Delete All', default=True)

    # ------------------------------------------------------------------
    # Compute
    # ------------------------------------------------------------------

    @api.depends('user_ids')
    def _compute_user_count(self):
        for role in self:
            role.user_count = len(role.user_ids)

    # ------------------------------------------------------------------
    # Master toggle onchange (UI only — write() handles DB sync)
    # ------------------------------------------------------------------

    @api.onchange('master_read')
    def _onchange_master_read(self):
        for line in self.line_ids:
            line.perm_read = self.master_read

    @api.onchange('master_create')
    def _onchange_master_create(self):
        for line in self.line_ids:
            line.perm_create = self.master_create

    @api.onchange('master_write')
    def _onchange_master_write(self):
        for line in self.line_ids:
            line.perm_write = self.master_write

    @api.onchange('master_cancel')
    def _onchange_master_cancel(self):
        for line in self.line_ids:
            line.perm_cancel = self.master_cancel

    @api.onchange('master_unlink')
    def _onchange_master_unlink(self):
        for line in self.line_ids:
            line.perm_unlink = self.master_unlink


    @api.onchange('odoo_group_ids')
    def _onchange_odoo_group_ids(self):
        """
        Auto-populate Model Privileges (line_ids) from selected groups.
        Menus are NOT auto-loaded here — use the 'Reload Menus' button on the
        Menus tab so only intentionally hidden menus appear in the dashboard.
        """
        if not self.odoo_group_ids:
            return

        # ── Model Privileges only ─────────────────────────────────────
        access_records = self.env['ir.model.access'].sudo().search([
            ('group_id', 'in', self.odoo_group_ids.ids),
            ('active', '=', True),
            ('model_id.transient', '=', False),
        ])

        existing_model_ids = set(self.line_ids.mapped('model_id').ids)
        seen_model_ids = set(existing_model_ids)
        new_privilege_lines = []
        for acc in access_records:
            if acc.model_id.id in seen_model_ids:
                continue
            seen_model_ids.add(acc.model_id.id)
            new_privilege_lines.append((0, 0, {
                'model_id': acc.model_id.id,
                'perm_read': acc.perm_read,
                'perm_create': acc.perm_create,
                'perm_write': acc.perm_write,
                'perm_cancel': True,
                'perm_unlink': acc.perm_unlink,
            }))

        if new_privilege_lines:
            existing = [(4, r.id) for r in self.line_ids if r.id]
            self.line_ids = existing + new_privilege_lines

    @api.onchange('add_model_ids')
    def _onchange_add_model_ids(self):
        if not self.add_model_ids:
            return
        existing_model_ids = self.line_ids.mapped('model_id').ids
        for model in self.add_model_ids:
            if model.id not in existing_model_ids:
                self.line_ids = [(0, 0, {
                    'model_id': model.id,
                    'perm_read': self.master_read,
                    'perm_create': self.master_create,
                    'perm_write': self.master_write,
                    'perm_cancel': self.master_cancel,
                    'perm_unlink': self.master_unlink,
                })]
                existing_model_ids.append(model.id)
        self.add_model_ids = [(5,)]

    # ------------------------------------------------------------------
    # Create override — auto-create Odoo group when role is created
    # ------------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            rec._ensure_auto_group()
        return records

    # ------------------------------------------------------------------
    # Write override — sync master toggles to lines + handle user changes
    # ------------------------------------------------------------------

    def write(self, vals):
        # If role name changed, rename the auto group too
        if 'name' in vals:
            for rec in self:
                if rec.auto_odoo_group_id:
                    rec.auto_odoo_group_id.sudo().write({
                        'name': f'[Group] {vals["name"]}',
                    })
        # Capture old user sets BEFORE write (needed for user change sync)
        old_user_ids = {}
        if 'user_ids' in vals:
            for rec in self:
                old_user_ids[rec.id] = set(rec.user_ids.ids)

        res = super().write(vals)

        # Sync master toggles → lines
        master_to_line = {
            'master_read': 'perm_read',
            'master_create': 'perm_create',
            'master_write': 'perm_write',
            'master_cancel': 'perm_cancel',
            'master_unlink': 'perm_unlink',
        }
        line_updates = {lf: vals[mf] for mf, lf in master_to_line.items() if mf in vals}
        if line_updates:
            for rec in self:
                if rec.line_ids:
                    rec.line_ids.write(line_updates)

        # When users are added/removed from a role → sync menu+module visibility
        if 'user_ids' in vals:
            for rec in self:
                new_user_ids = set(rec.user_ids.ids)
                prev_user_ids = old_user_ids.get(rec.id, set())

                added = new_user_ids - prev_user_ids
                removed = prev_user_ids - new_user_ids

                if added:
                    rec._apply_visibility_to_users(list(added))
                    rec._apply_odoo_groups_to_users(list(added))
                if removed:
                    rec._remove_visibility_from_users(list(removed))
                    rec._remove_odoo_groups_from_users(list(removed))

        # Always re-sync auto-detected groups when models or users change
        # This ensures Sales/Purchase/etc. groups are applied whenever role is saved
        if not self.env.context.get('skip_role_group_sync'):
            for rec in self:
                if rec.user_ids:
                    rec._apply_odoo_groups_to_users(rec.user_ids.ids)

        return res

    # ------------------------------------------------------------------
    # User membership sync helpers
    # ------------------------------------------------------------------

    def unlink(self):
        """Delete the auto-created Odoo group when the privilege group is deleted."""
        groups_to_delete = self.mapped('auto_odoo_group_id').filtered(lambda g: g.exists())
        result = super().unlink()
        if groups_to_delete:
            groups_to_delete.sudo().unlink()
        return result

    def _ensure_auto_group(self):
        """
        Create (or restore) the auto Odoo group for this privilege group.
        Called on create and can be called manually if the group was accidentally deleted.
        """
        if self.auto_odoo_group_id and self.auto_odoo_group_id.exists():
            return  # already exists

        # Get or create the category
        group = self.env['res.groups'].sudo().create({
            'name': f'[Group] {self.name}',
        })
        # Write without triggering our own write() to avoid recursion
        self.sudo().with_context(skip_role_group_sync=True).write({
            'auto_odoo_group_id': group.id,
        })
        _logger.info("PrivilegeGroup '%s': auto-created Odoo group id=%s", self.name, group.id)

    def _get_all_effective_groups(self):
        """Return all Odoo groups this privilege group grants: auto group + manually mapped groups."""
        groups = self.env['res.groups'].sudo()
        if self.auto_odoo_group_id and self.auto_odoo_group_id.exists():
            groups |= self.auto_odoo_group_id
        groups |= self.odoo_group_ids
        return groups

    def _get_auto_detected_groups(self):
        """
        Scan this group's model lines and return Odoo groups that are required
        for those models' modules to be accessible (menus, workflows, etc).

        Two detection methods:
        1. Model prefix matching: sale.order → sales_team.group_sale_salesman
        2. Module dependency matching: if lines have source_module_id, check that
           module's dependencies (e.g. Capital & Equity depends on account →
           account.group_account_user)

        This ensures dependent models (like account.journal) are accessible.
        """
        if not self.line_ids:
            return self.env['res.groups'].sudo()

        model_names = self.line_ids.mapped('model_name')
        required_group_xmlids = set()

        # 1) Model prefix matching
        for model_name in model_names:
            for prefix, group_xmlid in MODULE_GROUP_MAP.items():
                if model_name == prefix or model_name.startswith(prefix):
                    required_group_xmlids.add(group_xmlid)
                    break

        # 2) Module dependency matching — check source modules' dependencies
        source_modules = self.line_ids.mapped('source_module_id').filtered(lambda m: m.exists())
        if source_modules:
            dep_names = set()
            for mod in source_modules:
                dep_names.add(mod.name)
                for dep in mod.dependencies_id:
                    dep_names.add(dep.name)
            for dep_name in dep_names:
                xmlid = DEPENDENCY_MODULE_GROUP_MAP.get(dep_name)
                if xmlid:
                    required_group_xmlids.add(xmlid)

        groups = self.env['res.groups'].sudo()
        for xmlid in required_group_xmlids:
            try:
                group = self.env.ref(xmlid, raise_if_not_found=False)
                if group:
                    groups |= group
            except Exception:
                pass
        return groups

    def _apply_odoo_groups_to_users(self, user_ids):
        """
        Add users to ALL groups this privilege group grants:
          1. Auto-created group for this privilege group
          2. Manually mapped Odoo groups (odoo_group_ids)
          3. Auto-detected required groups based on model lines
             (e.g. sale.order models → sales_team.group_sale_salesman)
        Called when users are added to the group.
        """
        # Base groups (auto + manual)
        all_groups = self._get_all_effective_groups()
        # Auto-detected groups from model lines
        all_groups |= self._get_auto_detected_groups()

        if not all_groups:
            return
        for group in all_groups:
            existing_user_ids = set(group.user_ids.ids)
            to_add = [uid for uid in user_ids if uid not in existing_user_ids]
            if to_add:
                group.sudo().write({'user_ids': [(4, uid) for uid in to_add]})
        _logger.info(
            "PrivilegeGroup '%s': added %s users to groups: %s",
            self.name, len(user_ids), all_groups.mapped('full_name')
        )

    def _apply_dependency_groups_to_users(self, module_rec, user_ids):
        """
        Check the module's dependencies and add users to required Odoo groups.
        E.g., if Capital & Equity depends on 'account', users get account.group_account_user.
        This ensures dependent models (like account.journal) are accessible.
        """
        if not user_ids:
            return
        dep_names = set()
        # Direct dependencies
        for dep in module_rec.dependencies_id:
            dep_names.add(dep.name)
        # Also add the module itself
        dep_names.add(module_rec.name)

        required_xmlids = set()
        for dep_name in dep_names:
            xmlid = DEPENDENCY_MODULE_GROUP_MAP.get(dep_name)
            if xmlid:
                required_xmlids.add(xmlid)

        if not required_xmlids:
            return

        groups = self.env['res.groups'].sudo()
        for xmlid in required_xmlids:
            try:
                group = self.env.ref(xmlid, raise_if_not_found=False)
                if group:
                    groups |= group
            except Exception:
                pass

        for group in groups:
            existing_user_ids = set(group.user_ids.ids)
            to_add = [uid for uid in user_ids if uid not in existing_user_ids]
            if to_add:
                group.sudo().write({'user_ids': [(4, uid) for uid in to_add]})

        if groups:
            _logger.info(
                "PrivilegeGroup '%s': added dependency groups for module '%s': %s",
                self.name, module_rec.name, groups.mapped('full_name')
            )

    def _remove_odoo_groups_from_users(self, user_ids):
        """
        Remove users from ALL groups this privilege group granted.
        Only removes if no OTHER active group also grants the same Odoo group.
        Called when users are removed from the group.
        """
        all_groups = self._get_all_effective_groups() | self._get_auto_detected_groups()
        if not all_groups:
            return
        for uid in user_ids:
            other_roles = self.sudo().search([
                ('user_ids', 'in', [uid]),
                ('active', '=', True),
                ('id', '!=', self.id),
            ])
            still_needed_group_ids = set()
            for other_role in other_roles:
                still_needed_group_ids.update(
                    (other_role._get_all_effective_groups() | other_role._get_auto_detected_groups()).ids
                )

            for group in all_groups:
                if group.id not in still_needed_group_ids:
                    group.sudo().write({'user_ids': [(3, uid)]})

        _logger.info(
            "PrivilegeGroup '%s': removed %s users from groups %s",
            self.name, len(user_ids), all_groups.mapped('full_name')
        )

    def _apply_visibility_to_users(self, user_ids):
        """
        When users are added to this group, apply all group menu/module
        visibility restrictions to them (if no user-level override exists).
        """
        MenuPrivilege = self.env['menu.privilege'].sudo()
        ModuleVis = self.env['module.visibility'].sudo()

        for rec in self:
            # Apply hidden menus
            for mv in rec.menu_visibility_ids.filtered(lambda x: not x.is_visible):
                for uid in user_ids:
                    existing = MenuPrivilege.search([
                        ('user_id', '=', uid),
                        ('menu_id', '=', mv.menu_id.id),
                        ('active', '=', True),
                    ], limit=1)
                    if not existing:
                        MenuPrivilege.create({
                            'user_id': uid,
                            'menu_id': mv.menu_id.id,
                            'is_visible': False,
                        })

            # Apply hidden modules (syncs via menu.privilege under the hood)
            for modv in rec.module_visibility_ids.filtered(lambda x: not x.is_visible):
                if not modv.module_name:
                    continue
                for uid in user_ids:
                    existing = ModuleVis.search([
                        ('user_id', '=', uid),
                        ('module_name', '=', modv.module_name),
                        ('active', '=', True),
                    ], limit=1)
                    if not existing:
                        ModuleVis._sync_menu_privileges(uid, modv.module_name, False)

    def _remove_visibility_from_users(self, user_ids):
        """
        When users are removed from a group, clean up menu.privilege records
        that were created by this group (only those with no other group covering them).
        """
        MenuPrivilege = self.env['menu.privilege'].sudo()

        for rec in self:
            hidden_menu_ids = rec.menu_visibility_ids.filtered(
                lambda x: not x.is_visible
            ).mapped('menu_id').ids

            for uid in user_ids:
                # Find other roles this user still belongs to
                other_roles = self.sudo().search([
                    ('user_ids', 'in', [uid]),
                    ('active', '=', True),
                    ('id', '!=', rec.id),
                ])
                other_hidden = set()
                for other_role in other_roles:
                    other_hidden.update(
                        other_role.menu_visibility_ids.filtered(
                            lambda x: not x.is_visible
                        ).mapped('menu_id').ids
                    )

                # Remove menu.privilege records that no other role requires
                for menu_id in hidden_menu_ids:
                    if menu_id not in other_hidden:
                        priv = MenuPrivilege.search([
                            ('user_id', '=', uid),
                            ('menu_id', '=', menu_id),
                            ('active', '=', True),
                        ], limit=1)
                        if priv:
                            priv.unlink()

            # Restore module visibility for hidden modules
            for modv in rec.module_visibility_ids.filtered(lambda x: not x.is_visible):
                if not modv.module_name:
                    continue
                other_roles = self.sudo().search([
                    ('user_ids', 'in', user_ids),
                    ('active', '=', True),
                    ('id', '!=', rec.id),
                ])
                other_hidden_mods = set()
                for other_role in other_roles:
                    other_hidden_mods.update(
                        other_role.module_visibility_ids.filtered(
                            lambda x: not x.is_visible
                        ).mapped('module_name')
                    )
                for uid in user_ids:
                    if modv.module_name not in other_hidden_mods:
                        self.env['module.visibility'].sudo()._sync_menu_privileges(
                            uid, modv.module_name, True
                        )

    # ------------------------------------------------------------------
    # Duplicate role
    # ------------------------------------------------------------------

    def action_sync_groups_now(self):
        """
        Force re-sync all Odoo groups for current group users.
        Call this if Sales/Purchase/etc. menus are not showing after group save.
        """
        self.ensure_one()
        if not self.user_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'No Users',
                    'message': 'Add users to this group first.',
                    'type': 'warning',
                }
            }
        self._ensure_auto_group()
        self._apply_odoo_groups_to_users(self.user_ids.ids)
        groups = self._get_all_effective_groups() | self._get_auto_detected_groups()
        group_names = ', '.join(groups.mapped('full_name') or ['none'])
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Groups Synced ✓',
                'message': f'Applied to {len(self.user_ids)} user(s). Groups: {group_names}',
                'type': 'success',
                'sticky': True,
            }
        }

    def copy(self, default=None):
        default = dict(default or {})
        if 'name' not in default:
            default['name'] = '%s (copy)' % self.name
        new_role = super().copy(default)
        for line in self.line_ids:
            line.copy({'role_id': new_role.id})
        return new_role

    # ------------------------------------------------------------------
    # Button actions
    # ------------------------------------------------------------------

    def action_load_from_groups(self):
        """
        Auto-populate Model Privileges (line_ids) from the selected Odoo groups'
        ir.model.access records. Skips models already in line_ids.
        """
        self.ensure_one()
        if not self.odoo_group_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'No Groups Selected',
                    'message': 'Please add Linked Odoo Groups first, then click Load from Groups.',
                    'type': 'warning',
                }
            }

        # Get all ir.model.access records for the selected groups
        access_records = self.env['ir.model.access'].sudo().search([
            ('group_id', 'in', self.odoo_group_ids.ids),
            ('active', '=', True),
            ('model_id.transient', '=', False),
        ])

        existing_model_ids = set(self.line_ids.mapped('model_id').ids)
        added = 0
        seen_model_ids = set()

        new_lines = []
        for acc in access_records:
            if acc.model_id.id in existing_model_ids:
                continue
            if acc.model_id.id in seen_model_ids:
                continue
            seen_model_ids.add(acc.model_id.id)
            new_lines.append({
                'model_id': acc.model_id.id,
                'perm_read': acc.perm_read,
                'perm_create': acc.perm_create,
                'perm_write': acc.perm_write,
                'perm_cancel': True,
                'perm_unlink': acc.perm_unlink,
            })
            added += 1

        if new_lines:
            self.sudo().write({'line_ids': [(0, 0, vals) for vals in new_lines]})

        # Reload the form so the new lines are visible in the UI
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'privilege.role',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'current',
            'context': {
                **self.env.context,
                'notify_title': 'Model Privileges Loaded ✓',
                'notify_message': f'Added {added} model(s) from selected Odoo group(s).',
                'notify_type': 'success' if added else 'info',
                'default_tab': 'privileges',
            },
        }

    def action_load_menus_from_groups(self):
        """
        Auto-populate Menus tab (menu_visibility_ids) from the menus that
        belong to the selected Odoo groups. All loaded as visible=True so
        admin can selectively toggle off what to hide.
        """
        self.ensure_one()
        if not self.odoo_group_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'No Groups Selected',
                    'message': 'Please add Odoo Groups first, then click Load Menus.',
                    'type': 'warning',
                }
            }

        # ir.ui.menu has group_ids M2M to res.groups (renamed from groups_id in Odoo 19)
        group_ids = self.odoo_group_ids.ids
        menus = self.env['ir.ui.menu'].sudo().search([
            ('group_ids', 'in', group_ids),
            ('active', '=', True),
        ])

        # Also include parent menus so the tree makes sense
        all_menu_ids = set(menus.ids)
        for menu in menus:
            parent = menu.parent_id
            while parent:
                all_menu_ids.add(parent.id)
                parent = parent.parent_id

        all_menus = self.env['ir.ui.menu'].sudo().browse(list(all_menu_ids))
        existing_menu_ids = set(self.menu_visibility_ids.mapped('menu_id').ids)

        new_lines = []
        for menu in all_menus.sorted(key=lambda m: m.complete_name or m.name or ''):
            if menu.id in existing_menu_ids:
                continue
            new_lines.append({
                'role_id': self.id,
                'menu_id': menu.id,
                'is_visible': True,  # Loaded as visible — admin toggles off what to hide
            })

        if new_lines:
            self.sudo().write({'menu_visibility_ids': [(0, 0, vals) for vals in new_lines]})

        added = len(new_lines)
        # Reload the form so the new menu lines are visible in the UI
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'privilege.role',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'current',
            'context': {
                **self.env.context,
                'notify_title': 'Menus Loaded ✓',
                'notify_message': f'Loaded {added} menu(s) from selected Odoo group(s). Toggle off to hide.',
                'notify_type': 'success' if added else 'info',
                'default_tab': 'menu_visibility',
            },
        }

    def action_open_add_models_wizard(self):
        self.ensure_one()
        return {
            'name': 'Add Models',
            'type': 'ir.actions.act_window',
            'res_model': 'role.add.models.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_role_id': self.id,
                'default_perm_read': self.master_read,
                'default_perm_create': self.master_create,
                'default_perm_write': self.master_write,
                'default_perm_cancel': self.master_cancel,
                'default_perm_unlink': self.master_unlink,
            },
        }

    def action_grant_all_lines(self):
        for rec in self:
            rec.write({
                'master_read': True, 'master_create': True,
                'master_write': True, 'master_cancel': True,
                'master_unlink': True,
            })

    def action_revoke_all_lines(self):
        for rec in self:
            rec.write({
                'master_read': True, 'master_create': False,
                'master_write': False, 'master_cancel': False,
                'master_unlink': False,
            })

    def action_readonly_all_lines(self):
        self.action_revoke_all_lines()

    def action_add_module_models(self, module_id):
        """
        Add all models belonging to a module as role.privilege.line entries.
        Called from the dashboard 'Add Module' button in the Groups tab.
        Returns a dict with created/updated counts for proper UI feedback.
        """
        self.ensure_one()
        IrModel = self.env['ir.model'].sudo()
        IrData = self.env['ir.model.data'].sudo()

        module_rec = self.env['ir.module.module'].sudo().browse(module_id)
        if not module_rec.exists():
            return {'created': 0, 'updated': 0, 'module_name': ''}

        module_name = module_rec.name

        # 1) Models directly registered by this module via ir.model.data
        model_data = IrData.search([
            ('model', '=', 'ir.model'),
            ('module', '=', module_name),
        ])
        model_ids = set(model_data.mapped('res_id'))

        # 2) Models referenced by the module's ir.model.access records
        access_data = IrData.search([
            ('model', '=', 'ir.model.access'),
            ('module', '=', module_name),
        ])
        if access_data:
            access_records = self.env['ir.model.access'].sudo().browse(access_data.mapped('res_id')).exists()
            model_ids |= set(access_records.mapped('model_id').ids)

        # 3) Models referenced by the module's views
        view_data = IrData.search([
            ('model', '=', 'ir.ui.view'),
            ('module', '=', module_name),
        ])
        if view_data:
            views = self.env['ir.ui.view'].sudo().browse(view_data.mapped('res_id')).exists()
            view_model_names = set(views.mapped('model')) - {'', False}
            if view_model_names:
                view_models = IrModel.search([('model', 'in', list(view_model_names)), ('transient', '=', False)])
                model_ids |= set(view_models.ids)

        # 4) Models referenced by the module's actions
        action_data = IrData.search([
            ('model', '=', 'ir.actions.act_window'),
            ('module', '=', module_name),
        ])
        if action_data:
            actions = self.env['ir.actions.act_window'].sudo().browse(action_data.mapped('res_id')).exists()
            action_model_names = set(actions.mapped('res_model')) - {'', False}
            if action_model_names:
                action_models = IrModel.search([('model', 'in', list(action_model_names)), ('transient', '=', False)])
                model_ids |= set(action_models.ids)

        if not model_ids:
            return {'created': 0, 'updated': 0, 'module_name': module_rec.shortdesc or module_name}

        # Filter out transient and system models
        skip_models = {'ir.model', 'ir.model.fields', 'ir.model.access',
                       'ir.rule', 'ir.ui.view', 'ir.ui.menu',
                       'ir.actions.act_window', 'ir.actions.server'}
        valid_models = IrModel.browse(list(model_ids)).filtered(
            lambda m: m.exists() and not m.transient and m.model not in skip_models
        )

        existing_model_ids = set(self.line_ids.mapped('model_id').ids)

        new_lines = []
        updated_count = 0
        for model in valid_models:
            mid = model.id
            if mid in existing_model_ids:
                # Update existing line to set source_module_id if not set
                existing = self.line_ids.filtered(lambda l: l.model_id.id == mid)
                if existing and not existing[0].source_module_id:
                    existing[0].write({'source_module_id': module_id})
                    updated_count += 1
                continue
            new_lines.append({
                'role_id': self.id,
                'model_id': mid,
                'source_module_id': module_id,
                'perm_read': self.master_read,
                'perm_create': self.master_create,
                'perm_write': self.master_write,
                'perm_cancel': self.master_cancel,
                'perm_unlink': self.master_unlink,
            })

        created = self.env['role.privilege.line'].sudo().create(new_lines) if new_lines else self.env['role.privilege.line']

        # Auto-detect and grant required Odoo groups for this module AND its dependencies
        if self.user_ids:
            self._apply_odoo_groups_to_users(self.user_ids.ids)
            # Also add groups from module dependencies (e.g. Capital & Equity → account)
            self._apply_dependency_groups_to_users(module_rec, self.user_ids.ids)

        return {
            'created': len(created),
            'updated': updated_count,
            'module_name': module_rec.shortdesc or module_name,
        }

    def action_add_module_menus(self, module_id):
        """
        Add all menus belonging to a module as role.menu.visibility entries (visible=True).
        Called from the dashboard after adding a module to a group, to populate
        HIDE MENU BUTTON so admin can toggle specific menus off.
        Returns count of newly created records.
        """
        self.ensure_one()
        module_rec = self.env['ir.module.module'].sudo().browse(module_id)
        if not module_rec.exists():
            return 0

        module_name = module_rec.name

        # Get all ir.ui.menu IDs registered by this module via ir.model.data
        self.env.cr.execute("""
            SELECT imd.res_id
            FROM ir_model_data imd
            WHERE imd.module = %s
              AND imd.model = 'ir.ui.menu'
        """, (module_name,))
        menu_ids = [r[0] for r in self.env.cr.fetchall()]

        if not menu_ids:
            return 0

        menus = self.env['ir.ui.menu'].sudo().browse(menu_ids).filtered(
            lambda m: m.active
        )

        # Find existing role menu visibility records
        existing_menu_ids = set(self.menu_visibility_ids.mapped('menu_id').ids)

        RoleMenuVis = self.env['role.menu.visibility'].sudo()
        created = 0
        for menu in menus:
            if menu.id not in existing_menu_ids:
                RoleMenuVis.create({
                    'role_id': self.id,
                    'menu_id': menu.id,
                    'is_visible': True,
                })
                created += 1

        return created

    def action_remove_module_from_role(self, module_id):
        """
        Remove all role.privilege.line entries that belong to a specific module.
        Called from the dashboard 'remove module' button in the Groups tab.
        """
        self.ensure_one()
        lines = self.line_ids.filtered(lambda l: l.source_module_id.id == module_id)
        if lines:
            lines.unlink()
        return True

    # ------------------------------------------------------------------
    # Runtime privilege resolution (called by user.privilege on every request)
    # ------------------------------------------------------------------

    @api.model
    def get_role_privileges(self, model_name, user_id):
        """
        Get merged CRUD privileges for a user from all their groups.
        Most permissive wins (any group grants → granted).
        Returns None if user has no groups with lines for this model.
        """
        company_id = self.env.company.id
        roles = self.sudo().search([
            ('user_ids', 'in', [user_id]),
            ('active', '=', True),
            '|',
            ('company_ids', 'in', [company_id]),
            ('company_ids', '=', False),
        ])
        if not roles:
            return None

        lines = self.env['role.privilege.line'].sudo().search([
            ('role_id', 'in', roles.ids),
            ('model_name', '=', model_name),
        ])
        if not lines:
            return None

        # Most permissive: any role grants = granted
        return {
            'perm_read': any(l.perm_read for l in lines),
            'perm_create': any(l.perm_create for l in lines),
            'perm_write': any(l.perm_write for l in lines),
            'perm_cancel': any(l.perm_cancel for l in lines),
            'perm_unlink': any(l.perm_unlink for l in lines),
        }

    @api.model
    def get_hidden_menus_by_role(self, user_id):
        """
        Return set of menu IDs that should be hidden for this user based on groups.
        Most restrictive wins: any group hides → hidden.
        """
        company_id = self.env.company.id
        roles = self.sudo().search([
            ('user_ids', 'in', [user_id]),
            ('active', '=', True),
            '|',
            ('company_ids', 'in', [company_id]),
            ('company_ids', '=', False),
        ])
        if not roles:
            return set()

        hidden_ids = set()
        for role in roles:
            hidden_ids.update(
                role.menu_visibility_ids.filtered(
                    lambda x: not x.is_visible
                ).mapped('menu_id').ids
            )
        return hidden_ids

    @api.model
    def get_module_menu_labels(self):
        """
        Return a dict mapping module technical name → root menu display name.
        E.g. {'base': 'Apps', 'sale': 'Sales', ...}
        Used by the dashboard to let users search modules by their app icon name.
        """
        IrMenu = self.env['ir.ui.menu'].sudo()
        IrData = self.env['ir.model.data'].sudo()

        # Get all root menus (no parent)
        root_menus = IrMenu.with_context(ir_ui_menu_full_list=True).search([
            ('parent_id', '=', False),
        ])

        result = {}
        # Method 1: parse web_icon field ("module_name,icon_path")
        for menu in root_menus:
            if menu.web_icon:
                parts = menu.web_icon.split(',')
                if parts and parts[0]:
                    mod_name = parts[0].strip()
                    if mod_name not in result:
                        result[mod_name] = menu.name

        # Method 2: use ir.model.data to find defining module for each root menu
        if root_menus:
            menu_data = IrData.search([
                ('model', '=', 'ir.ui.menu'),
                ('res_id', 'in', root_menus.ids),
            ])
            menu_id_to_name = {m.id: m.name for m in root_menus}
            for d in menu_data:
                if d.module not in result and d.res_id in menu_id_to_name:
                    result[d.module] = menu_id_to_name[d.res_id]

        return result

    @api.model
    def get_hidden_modules_by_role(self, user_id):
        """
        Return set of module technical names hidden for this user based on roles.
        """
        company_id = self.env.company.id
        roles = self.sudo().search([
            ('user_ids', 'in', [user_id]),
            ('active', '=', True),
            '|',
            ('company_ids', 'in', [company_id]),
            ('company_ids', '=', False),
        ])
        if not roles:
            return set()

        hidden = set()
        for role in roles:
            hidden.update(
                role.module_visibility_ids.filtered(
                    lambda x: not x.is_visible
                ).mapped('module_name')
            )
        return hidden

    @api.model
    def is_menu_visible_by_role(self, menu_id, user_id):
        """Check if a specific menu is visible for user across all their roles."""
        hidden = self.get_hidden_menus_by_role(user_id)
        if not hidden:
            return None  # No role restriction
        if menu_id in hidden:
            return False
        return None  # Not explicitly hidden by any role

    @api.model
    def is_module_visible_by_role(self, module_name, user_id):
        """Check if a module is visible for user across all their roles."""
        hidden = self.get_hidden_modules_by_role(user_id)
        if not hidden:
            return None
        if module_name in hidden:
            return False
        return None

    @api.model
    def get_user_roles_data(self, user_id):
        """Used by dashboard to display group data for a user."""
        company_id = self.env.company.id
        roles = self.sudo().search([
            ('user_ids', 'in', [user_id]),
            ('active', '=', True),
            '|',
            ('company_ids', 'in', [company_id]),
            ('company_ids', '=', False),
        ])
        result = []
        for role in roles:
            lines = [{
                'id': line.id,
                'model_id': [line.model_id.id, line.model_id.name],
                'model_name': line.model_name,
                'perm_read': line.perm_read,
                'perm_create': line.perm_create,
                'perm_write': line.perm_write,
                'perm_cancel': line.perm_cancel,
                'perm_unlink': line.perm_unlink,
            } for line in role.line_ids]
            result.append({
                'id': role.id,
                'name': role.name,
                'line_count': len(role.line_ids),
                'lines': lines,
            })
        return result


class RolePrivilegeLine(models.Model):
    """CRUD permission line per model within a privilege group."""
    _name = 'role.privilege.line'
    _description = 'Group Privilege Line'
    _order = 'model_id'

    role_id = fields.Many2one('privilege.role', required=True, ondelete='cascade')
    model_id = fields.Many2one(
        'ir.model', string='Model', required=True, ondelete='cascade',
        domain=[('transient', '=', False)],
    )
    model_name = fields.Char(related='model_id.model', store=True, readonly=True)
    source_module_id = fields.Many2one(
        'ir.module.module', string='Source Module',
        ondelete='set null', index=True,
        help='The module this line was added from (via Add Module in dashboard).',
    )
    source_module_name = fields.Char(related='source_module_id.name', store=True, readonly=True)
    source_module_shortdesc = fields.Char(related='source_module_id.shortdesc', readonly=True)
    company_id = fields.Many2one(related='role_id.company_id', store=True, readonly=True)
    perm_read = fields.Boolean(string='Read', default=True)
    perm_create = fields.Boolean(string='Create', default=True)
    perm_write = fields.Boolean(string='Edit', default=True)
    perm_cancel = fields.Boolean(string='Cancel', default=True)
    perm_unlink = fields.Boolean(string='Delete', default=True)

    @api.model_create_multi
    def create(self, vals_list):
        """Invalidate privilege cache for role users when new lines added."""
        records = super().create(vals_list)
        # Role lines are read dynamically at runtime — no extra sync needed
        # but we log for traceability
        return records

    def write(self, vals):
        """Role lines are checked at runtime — write is sufficient."""
        return super().write(vals)


class RoleMenuVisibility(models.Model):
    """
    Hide Menu Button — per-group menu visibility.
    Adding a menu here with is_visible=False hides it for ALL users in the group.
    Checked on every page load via IrUiMenu.search() override.
    """
    _name = 'role.menu.visibility'
    _description = 'Group Menu Visibility'
    _order = 'role_id, menu_id'
    _sql_constraints = [
        ('role_menu_unique', 'UNIQUE(role_id, menu_id)',
         'A menu visibility record already exists for this group and menu!'),
    ]

    role_id = fields.Many2one('privilege.role', required=True, ondelete='cascade')
    menu_id = fields.Many2one('ir.ui.menu', string='Menu', required=True,
                               ondelete='cascade', index=True)
    menu_full_name = fields.Char(
        related='menu_id.complete_name', string='Menu Path', store=True, readonly=True)
    is_visible = fields.Boolean(
        string='Visible', default=True,
        help='Uncheck to hide this menu for ALL users in this group.')
    company_id = fields.Many2one(related='role_id.company_id', store=True, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        # When a new hidden menu is added to role, sync to existing role users
        for rec in records:
            if not rec.is_visible:
                rec._push_to_role_users(False)
        return records

    def write(self, vals):
        res = super().write(vals)
        if 'is_visible' in vals:
            for rec in self:
                rec._push_to_role_users(rec.is_visible)
        return res

    def unlink(self):
        # Restore visibility for role users when line is deleted
        for rec in self:
            rec._push_to_role_users(True)
        return super().unlink()

    def _push_to_role_users(self, is_visible):
        """Push this menu's visibility to all users in the group (no user-override exists)."""
        MenuPrivilege = self.env['menu.privilege'].sudo()
        for user in self.role_id.user_ids:
            existing = MenuPrivilege.search([
                ('user_id', '=', user.id),
                ('menu_id', '=', self.menu_id.id),
                ('active', '=', True),
            ], limit=1)
            if is_visible:
                # Restore: only remove if it was created by role (not user-level)
                if existing and existing.notes == '__role_managed__':
                    existing.unlink()
            else:
                if existing:
                    existing.write({'is_visible': False})
                else:
                    MenuPrivilege.create({
                        'user_id': user.id,
                        'menu_id': self.menu_id.id,
                        'is_visible': False,
                        'notes': '__role_managed__',
                    })


class RoleModuleVisibility(models.Model):
    """
    Hide Module Button — per-group module (app icon) visibility.
    Adding a module here with is_visible=False hides the entire app for ALL group users.
    Syncs via menu.privilege records on the root menu of the module.
    """
    _name = 'role.module.visibility'
    _description = 'Group Module (App) Visibility'
    _order = 'role_id, module_id'
    _sql_constraints = [
        ('role_module_unique', 'UNIQUE(role_id, module_id)',
         'A module visibility record already exists for this group and module!'),
    ]

    role_id = fields.Many2one('privilege.role', required=True, ondelete='cascade')
    module_id = fields.Many2one(
        'ir.module.module', string='Module (App)', required=True,
        ondelete='cascade', domain=[('state', '=', 'installed')], index=True,
    )
    module_name = fields.Char(related='module_id.name', store=True, readonly=True)
    module_shortdesc = fields.Char(related='module_id.shortdesc', readonly=True)
    is_visible = fields.Boolean(
        string='App Visible', default=True,
        help='Uncheck to hide this app icon for ALL users in this group.')
    # CRUD permissions for this module's models
    perm_read = fields.Boolean(string='Read', default=True)
    perm_create = fields.Boolean(string='Create', default=True)
    perm_write = fields.Boolean(string='Edit', default=True)
    perm_cancel = fields.Boolean(string='Cancel', default=True)
    perm_unlink = fields.Boolean(string='Delete', default=True)
    company_id = fields.Many2one(related='role_id.company_id', store=True, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if not rec.is_visible and rec.module_name:
                rec._push_to_role_users(False)
            # Auto-create role.privilege.line entries for all models of this module
            rec._sync_module_privilege_lines()
        return records

    def write(self, vals):
        res = super().write(vals)
        if 'is_visible' in vals:
            for rec in self:
                if rec.module_name:
                    rec._push_to_role_users(rec.is_visible)
        # Sync CRUD changes to role.privilege.line
        crud_fields = {'perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'}
        if crud_fields & set(vals.keys()):
            for rec in self:
                rec._sync_module_privilege_lines()
        return res

    def _sync_module_privilege_lines(self):
        """
        Auto-create/update role.privilege.line entries for all models
        belonging to this module, using this record's CRUD permissions.
        Uses ir.model.data to accurately find models owned by the module.
        """
        if not self.module_name:
            return
        IrModel = self.env['ir.model'].sudo()
        IrData = self.env['ir.model.data'].sudo()

        # Find all models registered by this module via ir.model.data
        model_data = IrData.search([
            ('model', '=', 'ir.model'),
            ('module', '=', self.module_name),
        ])
        model_ids = set(model_data.mapped('res_id'))

        if not model_ids:
            return

        existing_lines = {
            line.model_id.id: line
            for line in self.role_id.line_ids
        }
        crud_vals = {
            'perm_read': self.perm_read,
            'perm_create': self.perm_create,
            'perm_write': self.perm_write,
            'perm_cancel': self.perm_cancel,
            'perm_unlink': self.perm_unlink,
        }
        new_lines = []
        for model_id in model_ids:
            model = IrModel.browse(model_id)
            if not model.exists() or model.transient:
                continue
            if model_id in existing_lines:
                existing_lines[model_id].write(crud_vals)
            else:
                new_lines.append(dict(crud_vals, model_id=model_id))

        if new_lines:
            self.role_id.sudo().write({'line_ids': [(0, 0, v) for v in new_lines]})

    def unlink(self):
        for rec in self:
            if rec.module_name:
                rec._push_to_role_users(True)
        return super().unlink()

    def _push_to_role_users(self, is_visible):
        """Push module visibility to all users in this role."""
        ModVis = self.env['module.visibility'].sudo()
        for user in self.role_id.user_ids:
            # Check no user-level override
            user_override = ModVis.search([
                ('user_id', '=', user.id),
                ('module_name', '=', self.module_name),
                ('active', '=', True),
            ], limit=1)
            if not user_override:
                ModVis._sync_menu_privileges(user.id, self.module_name, is_visible)

    def action_create_custom_group(self):
        """
        Open a quick dialog to create a custom Odoo res.groups record
        and immediately link it to this role.
        Uses a simple wizard-style action with context defaults.
        """
        self.ensure_one()
        # Get or create the "Custom Roles" category for clean organisation
        return {
            'name': 'Create Custom Group',
            'type': 'ir.actions.act_window',
            'res_model': 'privilege.role.create.group.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_role_id': self.id,
                'default_name': f'{self.name} Access',
            },
        }
