import logging
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class ModulePrivilege(models.Model):
    _name = 'module.privilege'
    _description = 'Module-based Privilege'
    _rec_name = 'display_name'
    _order = 'user_id, module_id'
    _sql_constraints = [
        ('user_module_unique', 'UNIQUE(user_id, module_id, company_id)',
         'A privilege record already exists for this user and module!'),
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
        string='Module',
        required=True,
        ondelete='cascade',
        domain=[('state', '=', 'installed')],
        index=True,
    )
    module_name = fields.Char(
        related='module_id.name',
        string='Module Technical Name',
        store=True,
        readonly=True,
    )
    module_shortdesc = fields.Char(
        related='module_id.shortdesc',
        string='Module Description',
        readonly=True,
    )
    line_ids = fields.One2many(
        'module.privilege.line',
        'module_privilege_id',
        string='Model Privileges',
    )
    active = fields.Boolean(default=True)
    display_name = fields.Char(
        compute='_compute_display_name',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    notes = fields.Text(string='Notes')

    # ==========================================
    # MASTER TOGGLE FIELDS (Module-level control)
    # ==========================================
    master_read = fields.Boolean(
        string='Read All',
        default=True,
        help='Toggle Read permission for ALL models in this module at once.',
    )
    master_create = fields.Boolean(
        string='Create All',
        default=True,
        help='Toggle Create permission for ALL models in this module at once.',
    )
    master_write = fields.Boolean(
        string='Edit All',
        default=True,
        help='Toggle Edit permission for ALL models in this module at once.',
    )
    master_cancel = fields.Boolean(
        string='Cancel All',
        default=True,
        help='Toggle Cancel permission for ALL models in this module at once.',
    )
    master_unlink = fields.Boolean(
        string='Delete All',
        default=True,
        help='Toggle Delete permission for ALL models in this module at once.',
    )

    @api.depends('user_id', 'module_id')
    def _compute_display_name(self):
        for rec in self:
            user_name = rec.user_id.name or ''
            mod_name = rec.module_id.shortdesc or rec.module_id.name or ''
            rec.display_name = f"{user_name} - {mod_name}"


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

    @api.onchange('module_id')
    def _onchange_module_id(self):
        """Auto-load models belonging to the selected module."""
        if self.module_id:
            self._load_module_models()

    def _load_module_models(self):
        """Load all models associated with the selected module."""
        self.ensure_one()
        if not self.module_id:
            return

        module_name = self.module_id.name

        # Find models registered by this module via ir.model.data
        model_data = self.env['ir.model.data'].sudo().search([
            ('model', '=', 'ir.model'),
            ('module', '=', module_name),
        ])

        model_ids = model_data.mapped('res_id')
        models = self.env['ir.model'].sudo().browse(model_ids).filtered(
            lambda m: not m.transient and m.model not in [
                'ir.model', 'ir.model.fields', 'ir.model.access',
                'ir.rule', 'ir.ui.view', 'ir.ui.menu',
                'ir.actions.act_window', 'ir.actions.server',
            ]
        )

        # Get existing model_ids in lines to avoid duplicates
        existing_model_ids = self.line_ids.mapped('model_id').ids

        new_lines = []
        for model in models:
            if model.id not in existing_model_ids:
                new_lines.append((0, 0, {
                    'model_id': model.id,
                    'perm_read': self.master_read,
                    'perm_create': self.master_create,
                    'perm_write': self.master_write,
                    'perm_cancel': self.master_cancel,
                    'perm_unlink': self.master_unlink,
                }))

        if new_lines:
            self.line_ids = new_lines

    def write(self, vals):
        """Override write to sync privileges on ANY change."""
        res = super().write(vals)

        # Map master toggle fields to line permission fields
        master_to_line = {
            'master_read': 'perm_read',
            'master_create': 'perm_create',
            'master_write': 'perm_write',
            'master_cancel': 'perm_cancel',
            'master_unlink': 'perm_unlink',
        }

        # Sync lines if master toggles changed
        line_updates = {}
        for master_field, line_field in master_to_line.items():
            if master_field in vals:
                line_updates[line_field] = vals[master_field]

        if line_updates:
            for rec in self:
                if rec.line_ids:
                    rec.line_ids.write(line_updates)

        # ALWAYS auto-apply to user.privilege on any write
        # This ensures real-time enforcement without needing "Apply to System"
        self._auto_apply_privileges()

        return res

    def _force_apply_all(self):
        """
        Force re-sync all module.privilege records to user.privilege.
        Called by the admin button and also after model loading.
        """
        self._auto_apply_privileges()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Synced'),
                'message': _('All privileges have been applied to users.'),
                'type': 'success',
                'sticky': False,
            }
        }

    def _auto_apply_privileges(self):
        """Auto-sync lines to user.privilege records and grant module groups."""
        UserPrivilege = self.env['user.privilege'].sudo()
        for rec in self:
            for line in rec.line_ids:
                existing = UserPrivilege.search([
                    ('user_id', '=', rec.user_id.id),
                    ('model_id', '=', line.model_id.id),
                ], limit=1)
                vals = {
                    'user_id': rec.user_id.id,
                    'model_id': line.model_id.id,
                    'perm_read': line.perm_read,
                    'perm_create': line.perm_create,
                    'perm_write': line.perm_write,
                    'perm_cancel': line.perm_cancel,
                    'perm_unlink': line.perm_unlink,
                    'company_id': rec.company_id.id,
                    'source_module_id': rec.module_id.id,
                }
                if existing:
                    existing.write(vals)
                else:
                    UserPrivilege.create(vals)
        # Always ensure user has module security groups
        self._grant_module_groups()

    @api.model_create_multi
    def create(self, vals_list):
        """Auto-apply privileges immediately on creation and grant module access."""
        records = super().create(vals_list)
        records._auto_apply_privileges()
        # Note: _auto_apply_privileges already calls _grant_module_groups
        return records

    def _get_module_groups(self):
        """
        Find ALL security groups needed to access a module:
        1. Groups registered by the module in ir.model.data
        2. Groups required by the module's menu items AND their parent menus
        3. Groups from ir.model.access for the module's models
        4. Groups from ir.model.access registered by the module's ACL records
        Returns a recordset of res.groups.
        """
        self.ensure_one()
        module_name = self.module_id.name
        all_group_ids = set()

        # 1. Groups registered directly by the module
        group_data = self.env['ir.model.data'].sudo().search([
            ('module', '=', module_name),
            ('model', '=', 'res.groups'),
        ])
        if group_data:
            all_group_ids.update(group_data.mapped('res_id'))

        # 2. Groups required by the module's menus AND all parent menus
        menu_data = self.env['ir.model.data'].sudo().search([
            ('module', '=', module_name),
            ('model', '=', 'ir.ui.menu'),
        ])
        if menu_data:
            menu_ids = menu_data.mapped('res_id')
            menus = self.env['ir.ui.menu'].sudo().browse(menu_ids).exists()
            for menu in menus:
                # Collect groups from this menu and all parents up to root
                current = menu
                while current:
                    if current.group_ids:
                        all_group_ids.update(current.group_ids.ids)
                    current = current.parent_id

        # 3. Groups from ir.model.access for models in this module
        model_data = self.env['ir.model.data'].sudo().search([
            ('module', '=', module_name),
            ('model', '=', 'ir.model'),
        ])
        if model_data:
            model_ids = model_data.mapped('res_id')
            access_records = self.env['ir.model.access'].sudo().search([
                ('model_id', 'in', model_ids),
                ('group_id', '!=', False),
            ])
            if access_records:
                all_group_ids.update(access_records.mapped('group_id').ids)

        # 4. Groups from ir.model.access records registered by this module
        acl_data = self.env['ir.model.data'].sudo().search([
            ('module', '=', module_name),
            ('model', '=', 'ir.model.access'),
        ])
        if acl_data:
            acl_ids = acl_data.mapped('res_id')
            acl_records = self.env['ir.model.access'].sudo().browse(acl_ids).exists()
            for acl in acl_records:
                if acl.group_id:
                    all_group_ids.add(acl.group_id.id)

        if not all_group_ids:
            return self.env['res.groups'].sudo()
        return self.env['res.groups'].sudo().browse(list(all_group_ids)).exists()

    def _grant_module_groups(self):
        """
        Grant the user access to ALL security groups needed for the module.
        This includes groups from menus, model access, and module registration.
        Also ensures module menus are visible (clears any stale hidden records).
        Wrapped in savepoint so errors don't break the main transaction.
        """
        for rec in self:
            if not rec.module_id or not rec.user_id:
                continue

            cr = self.env.cr
            cr.execute("SAVEPOINT grant_module_groups")
            try:
                groups = rec._get_module_groups()

                _logger.info(
                    "PrivilegeManager: Found %d groups for user '%s' module '%s': %s",
                    len(groups), rec.user_id.login, rec.module_id.name,
                    ', '.join(groups.mapped('full_name')) if groups else 'NONE'
                )

                if groups:
                    group_cmds = [(4, g.id) for g in groups if rec.user_id.id not in g.user_ids.ids]
                    if group_cmds:
                        _logger.info("  -> Adding %d groups to user %s",
                                     len(group_cmds), rec.user_id.login)
                        rec.user_id.sudo().write({'group_ids': group_cmds})
                        _logger.info("  -> Done. User groups updated.")
                    else:
                        _logger.info("  -> User already has all groups.")

                cr.execute("RELEASE SAVEPOINT grant_module_groups")
            except Exception as e:
                cr.execute("ROLLBACK TO SAVEPOINT grant_module_groups")
                cr.execute("RELEASE SAVEPOINT grant_module_groups")
                _logger.error("PrivilegeManager: Error granting groups for %s: %s",
                              rec.module_id.name, e)

            # Ensure module menus are visible (separate savepoint)
            rec._ensure_module_menus_visible()

        # Clear cache once after all records processed
        try:
            self.env.registry.clear_cache()
        except Exception:
            pass

    def _ensure_module_menus_visible(self):
        """
        When a module is added for a user, ensure ALL its menus are visible.
        Uses direct SQL with savepoint protection so errors don't break the transaction.
        """
        for rec in self:
            if not rec.module_id or not rec.user_id:
                continue
            module_name = rec.module_id.name
            user_id = rec.user_id.id
            cr = self.env.cr

            cr.execute("SAVEPOINT ensure_menus_visible")
            try:
                # Collect ALL menu IDs for this module
                cr.execute("""
                    SELECT res_id FROM ir_model_data
                    WHERE module = %s AND model = 'ir.ui.menu'
                """, (module_name,))
                menu_ids = {r[0] for r in cr.fetchall()}

                if not menu_ids:
                    cr.execute("RELEASE SAVEPOINT ensure_menus_visible")
                    continue

                # Walk up parent chain to include root menus
                all_menu_ids = set(menu_ids)
                to_resolve = list(menu_ids)
                while to_resolve:
                    cr.execute("""
                        SELECT id, parent_id FROM ir_ui_menu
                        WHERE id = ANY(%s) AND parent_id IS NOT NULL
                    """, (to_resolve,))
                    to_resolve = []
                    for row in cr.fetchall():
                        if row[1] not in all_menu_ids:
                            all_menu_ids.add(row[1])
                            to_resolve.append(row[1])

                all_menu_ids_list = list(all_menu_ids)
                _logger.info(
                    "PrivilegeManager: Ensuring %d menu(s) visible for user %s module %s",
                    len(all_menu_ids_list), rec.user_id.login, module_name
                )

                # 1. Fix ALL existing hidden/inactive menu_privilege records
                cr.execute("""
                    UPDATE menu_privilege
                    SET is_visible = true, active = true,
                        write_uid = %s, write_date = NOW() AT TIME ZONE 'UTC'
                    WHERE user_id = %s
                      AND menu_id = ANY(%s)
                      AND (is_visible = false OR active = false)
                """, (self.env.uid, user_id, all_menu_ids_list))
                fixed = cr.rowcount
                if fixed:
                    _logger.info("  -> Fixed %d hidden menu_privilege records", fixed)

                # 2. Find menus that DON'T have any menu_privilege record yet
                cr.execute("""
                    SELECT menu_id FROM menu_privilege
                    WHERE user_id = %s AND menu_id = ANY(%s)
                """, (user_id, all_menu_ids_list))
                existing_menu_ids = {r[0] for r in cr.fetchall()}
                missing = [mid for mid in all_menu_ids_list if mid not in existing_menu_ids]

                # 3. Create is_visible=true records for missing menus
                if missing:
                    for mid in missing:
                        cr.execute("""
                            INSERT INTO menu_privilege
                                (user_id, menu_id, is_visible, active,
                                 source_module_id, company_id,
                                 create_uid, create_date, write_uid, write_date)
                            VALUES (%s, %s, true, true, %s, %s, %s,
                                    NOW() AT TIME ZONE 'UTC', %s,
                                    NOW() AT TIME ZONE 'UTC')
                        """, (user_id, mid,
                              rec.module_id.id,
                              rec.company_id.id if rec.company_id else None,
                              self.env.uid, self.env.uid))
                    _logger.info("  -> Created %d new visible menu_privilege records", len(missing))

                # 4. Fix module.visibility records
                cr.execute("""
                    UPDATE module_visibility
                    SET is_visible = true,
                        write_uid = %s, write_date = NOW() AT TIME ZONE 'UTC'
                    WHERE user_id = %s AND module_id = %s AND is_visible = false
                """, (self.env.uid, user_id, rec.module_id.id))
                if cr.rowcount:
                    _logger.info("  -> Set module_visibility to visible")

                cr.execute("RELEASE SAVEPOINT ensure_menus_visible")

            except Exception as e:
                cr.execute("ROLLBACK TO SAVEPOINT ensure_menus_visible")
                cr.execute("RELEASE SAVEPOINT ensure_menus_visible")
                _logger.error("PrivilegeManager: Error ensuring menu visibility for %s: %s",
                              module_name, e)

    def _revoke_module_groups(self):
        """
        Remove the user from the module's security groups when the
        module privilege is deleted.
        """
        for rec in self:
            try:
                if not rec.module_id or not rec.user_id:
                    continue
                if rec.user_id._is_admin() or rec.user_id._is_superuser():
                    continue
                groups = rec._get_module_groups()
                if groups:
                    group_cmds = [(3, g.id) for g in groups if rec.user_id.id in g.user_ids.ids]
                    if group_cmds:
                        rec.user_id.sudo().write({'group_ids': group_cmds})
            except Exception as e:
                _logger.error("PrivilegeManager: Error revoking groups: %s", e)
                continue

    def unlink(self):
        """Revoke module groups when privilege is removed."""
        try:
            self._revoke_module_groups()
        except Exception:
            pass
        return super().unlink()

    def action_load_models(self):
        """Button action to load models for the module."""
        for rec in self:
            rec._load_module_models()
        # Auto-apply after loading models
        self._auto_apply_privileges()
        return True

    @api.model
    def action_add_module_to_role(self, user_id, module_id, role_id):
        """
        Add all models of a module as role.privilege.line entries on the given group.
        Called from the dashboard when the user has groups — instead of creating a
        per-user module.privilege record, we attach the lines directly to the group
        so access is group-based, not user-based.
        """
        role = self.env['privilege.role'].sudo().browse(role_id)
        if not role.exists():
            raise ValueError("Group not found: %s" % role_id)

        module = self.env['ir.module.module'].sudo().browse(module_id)
        if not module.exists():
            raise ValueError("Module not found: %s" % module_id)

        module_name = module.name

        # Find all models registered by this module
        model_data = self.env['ir.model.data'].sudo().search([
            ('model', '=', 'ir.model'),
            ('module', '=', module_name),
        ])
        model_ids = model_data.mapped('res_id')
        models = self.env['ir.model'].sudo().browse(model_ids).filtered(
            lambda m: not m.transient and m.model not in [
                'ir.model', 'ir.model.fields', 'ir.model.access',
                'ir.rule', 'ir.ui.view', 'ir.ui.menu',
                'ir.actions.act_window', 'ir.actions.server',
            ]
        )

        existing_model_ids = role.line_ids.mapped('model_id').ids
        new_lines = []
        for model in models:
            if model.id not in existing_model_ids:
                new_lines.append((0, 0, {
                    'model_id': model.id,
                    'perm_read': True,
                    'perm_create': True,
                    'perm_write': True,
                    'perm_cancel': True,
                    'perm_unlink': True,
                }))

        if new_lines:
            role.write({'line_ids': new_lines})

        return {
            'role_id': role.id,
            'role_name': role.name,
            'module_name': module.shortdesc or module.name,
            'models_added': len(new_lines),
            'line_ids': role.line_ids.ids,
        }

    @api.model
    def get_module_menus(self, module_id, user_id):
        """
        Returns all ir.ui.menu records belonging to a module.
        Used by the dashboard to display menus for hide/show toggling.
        """
        module = self.env['ir.module.module'].sudo().browse(module_id)
        if not module.exists():
            return []

        module_name = module.name

        # Get all ir.ui.menu IDs registered by this module via ir.model.data
        self.env.cr.execute("""
            SELECT imd.res_id
            FROM ir_model_data imd
            WHERE imd.module = %s
              AND imd.model = 'ir.ui.menu'
        """, (module_name,))
        menu_ids = [r[0] for r in self.env.cr.fetchall()]

        if not menu_ids:
            return []

        menus = self.env['ir.ui.menu'].sudo().browse(menu_ids).filtered(
            lambda m: m.active
        )

        result = []
        for m in menus.sorted(key=lambda x: x.complete_name or x.name or ''):
            name = m.complete_name or m.name or ''
            if isinstance(name, dict):
                name = name.get('en_US') or list(name.values())[0] if name else ''
            result.append({'id': m.id, 'name': name})

        return result

    @api.model
    def create_module_menu_privileges(self, module_id, user_id):
        """
        Server-side: create menu.privilege records (is_visible=True) for all
        menus of this module for the given user. Skips duplicates safely.
        Returns count of newly created records.
        Called from the dashboard after adding a module, to populate
        HIDE MENU BUTTON so admin can toggle specific menus off.
        """
        module = self.env['ir.module.module'].sudo().browse(module_id)
        if not module.exists():
            return 0

        module_name = module.name

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

        # Find existing privilege records for this user's menus
        self.env.cr.execute("""
            SELECT menu_id, id, is_visible FROM menu_privilege
            WHERE user_id = %s AND menu_id = ANY(%s)
        """, (user_id, list(menus.ids)))
        existing = {r[0]: {'id': r[1], 'is_visible': r[2]} for r in self.env.cr.fetchall()}

        MenuPriv = self.env['menu.privilege'].sudo()
        created = 0
        updated = 0
        for menu in menus:
            if menu.id not in existing:
                MenuPriv.create({
                    'user_id': user_id,
                    'menu_id': menu.id,
                    'is_visible': True,
                    'source_module_id': module_id,
                })
                created += 1
            elif not existing[menu.id]['is_visible']:
                # Fix stale hidden records — set them back to visible
                MenuPriv.browse(existing[menu.id]['id']).write({'is_visible': True})
                updated += 1

        if updated:
            _logger.info(
                "PrivilegeManager: Fixed %d hidden menu privilege(s) for user %s module %s",
                updated, user_id, module_name
            )

        return created + updated

    @api.model
    def get_user_primary_role(self, user_id):
        """Return the first active group the user belongs to, or False."""
        role = self.env['privilege.role'].sudo().search([
            ('user_ids', 'in', [user_id]),
            ('active', '=', True),
        ], limit=1)
        if role:
            return {'id': role.id, 'name': role.name}
        return False

    @api.model
    def action_sync_all_to_user_privileges(self):
        """
        GLOBAL SYNC: Re-apply ALL module.privilege records for ALL users.
        Call this once after upgrading the module to fix existing data.
        Also called automatically by the dashboard's Sync button.
        """
        all_records = self.sudo().search([('active', '=', True)])
        UserPrivilege = self.env['user.privilege'].sudo()
        count = 0
        for rec in all_records:
            for line in rec.line_ids:
                existing = UserPrivilege.search([
                    ('user_id', '=', rec.user_id.id),
                    ('model_id', '=', line.model_id.id),
                ], limit=1)
                vals = {
                    'user_id': rec.user_id.id,
                    'model_id': line.model_id.id,
                    'perm_read': line.perm_read,
                    'perm_create': line.perm_create,
                    'perm_write': line.perm_write,
                    'perm_cancel': line.perm_cancel,
                    'perm_unlink': line.perm_unlink,
                    'source_module_id': rec.module_id.id,
                    'company_id': rec.company_id.id,
                }
                if existing:
                    existing.write(vals)
                else:
                    UserPrivilege.create(vals)
                count += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Global Sync Complete'),
                'message': _('%(count)s privilege records synced to users.', count=count),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_apply_privileges(self):
        """Apply module privilege lines to individual user.privilege records."""
        UserPrivilege = self.env['user.privilege']
        for rec in self:
            for line in rec.line_ids:
                existing = UserPrivilege.search([
                    ('user_id', '=', rec.user_id.id),
                    ('model_id', '=', line.model_id.id),
                ], limit=1)
                vals = {
                    'user_id': rec.user_id.id,
                    'model_id': line.model_id.id,
                    'perm_read': line.perm_read,
                    'perm_create': line.perm_create,
                    'perm_write': line.perm_write,
                    'perm_cancel': line.perm_cancel,
                    'perm_unlink': line.perm_unlink,
                    'company_id': rec.company_id.id,
                    'source_module_id': rec.module_id.id,
                }
                if existing:
                    existing.write(vals)
                else:
                    UserPrivilege.create(vals)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Success'),
                'message': _('Privileges applied to user-level records successfully.'),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_grant_all_lines(self):
        """Grant all permissions on all lines and update master toggles."""
        for rec in self:
            rec.write({
                'master_read': True,
                'master_create': True,
                'master_write': True,
                'master_cancel': True,
                'master_unlink': True,
            })
        # write() already handles line updates and sync via the override

    def action_revoke_all_lines(self):
        """Revoke all permissions (keep read) on all lines."""
        for rec in self:
            rec.write({
                'master_read': True,
                'master_create': False,
                'master_write': False,
                'master_cancel': False,
                'master_unlink': False,
            })
        # write() already handles line updates and sync via the override

    def action_readonly_all_lines(self):
        """Set all lines to read only."""
        self.action_revoke_all_lines()


class ModulePrivilegeLine(models.Model):
    _name = 'module.privilege.line'
    _description = 'Module Privilege Line'
    _order = 'model_id'

    module_privilege_id = fields.Many2one(
        'module.privilege',
        string='Module Privilege',
        required=True,
        ondelete='cascade',
    )
    user_id = fields.Many2one(
        related='module_privilege_id.user_id',
        string='User',
        store=True,
        readonly=True,
    )
    model_id = fields.Many2one(
        'ir.model',
        string='Model',
        required=True,
        ondelete='cascade',
        domain=[('transient', '=', False)],
    )
    model_name = fields.Char(
        related='model_id.model',
        string='Technical Name',
        store=True,
        readonly=True,
    )
    perm_read = fields.Boolean(string='Read', default=True)
    perm_create = fields.Boolean(string='Create', default=True)
    perm_write = fields.Boolean(string='Edit', default=True)
    perm_cancel = fields.Boolean(string='Cancel', default=True)
    perm_unlink = fields.Boolean(string='Delete', default=True)

    def write(self, vals):
        """When individual line permissions change, sync to user.privilege immediately."""
        res = super().write(vals)
        perm_fields = {'perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'}
        if perm_fields.intersection(vals.keys()):
            # Sync each line directly to user.privilege
            UserPrivilege = self.env['user.privilege'].sudo()
            for line in self:
                if not line.user_id or not line.model_id:
                    continue
                mp = line.module_privilege_id
                existing = UserPrivilege.search([
                    ('user_id', '=', line.user_id.id),
                    ('model_id', '=', line.model_id.id),
                ], limit=1)
                sync_vals = {
                    'user_id': line.user_id.id,
                    'model_id': line.model_id.id,
                    'perm_read': line.perm_read,
                    'perm_create': line.perm_create,
                    'perm_write': line.perm_write,
                    'perm_cancel': line.perm_cancel,
                    'perm_unlink': line.perm_unlink,
                    'source_module_id': mp.module_id.id if mp.module_id else False,
                    'company_id': mp.company_id.id if mp.company_id else self.env.company.id,
                }
                if existing:
                    existing.write(sync_vals)
                else:
                    UserPrivilege.create(sync_vals)
        return res
