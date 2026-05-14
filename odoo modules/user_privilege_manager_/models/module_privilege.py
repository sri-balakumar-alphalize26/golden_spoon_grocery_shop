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
        This includes groups from menus, model access, module registration,
        AND the 'basic user' tier groups of direct dependencies — so a user
        added to Easy Sales also gets sales_team.group_sale_salesman
        transitively, which unlocks reads on sale.order.line etc.

        Wrapped in savepoint so errors don't break the main transaction.
        """
        for rec in self:
            if not rec.module_id or not rec.user_id:
                continue

            cr = self.env.cr
            cr.execute("SAVEPOINT grant_module_groups")
            try:
                groups = rec._get_module_groups()

                # Also pull in the "user" tier group from each direct dependency.
                # We deliberately pick the USER (not Manager) tier by default —
                # admins can upgrade to Manager later via the Access Level chips.
                dep_user_groups = rec._get_dependency_user_groups()
                if dep_user_groups:
                    groups = groups | dep_user_groups

                # ── CRITICAL SAFETY FILTER ──
                # Strip any group that would silently escalate the user to
                # administrator. We never auto-grant erp_manager, group_system,
                # or anything that implies them. We also skip admin-tier
                # named groups (Manager/Administrator/Advisor/etc.) — those
                # appear as chips in the picker for manual opt-in only.
                if groups:
                    safe_groups = self.env['res.groups'].sudo()
                    for g in groups:
                        if self._is_admin_bypass_group(g):
                            _logger.info(
                                "  -> Refusing to auto-grant bypass group '%s'",
                                g.name
                            )
                            continue
                        if self._is_admin_tier_by_name(g):
                            _logger.info(
                                "  -> Skipping admin-tier group '%s' (user must tick manually)",
                                g.name
                            )
                            continue
                        safe_groups |= g
                    groups = safe_groups

                _logger.info(
                    "PrivilegeManager: Granting %d safe groups to user '%s' for module '%s'",
                    len(groups), rec.user_id.login, rec.module_id.name,
                )

                if groups:
                    group_cmds = [(4, g.id) for g in groups if rec.user_id.id not in g.user_ids.ids]
                    if group_cmds:
                        _logger.info("  -> Adding %d groups to user %s",
                                     len(group_cmds), rec.user_id.login)
                        rec.user_id.sudo().write({'group_ids': group_cmds})
                    else:
                        _logger.info("  -> User already has all safe groups.")

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

    def _get_dependency_user_groups(self):
        """
        Return a recordset of the 'basic user' tier groups from this module's
        direct dependencies. For Easy Sales → looks at sale, account,
        stock etc. and picks sales_team.group_sale_salesman and similar.

        Heuristic: a group is considered the 'user' tier if:
        - It has no implied_ids (manager/admin groups IMPLY the user group,
          so the user group itself has none), AND
        - Its name contains 'user', 'employee', 'salesman', 'salesperson',
          or 'officer' (common Odoo naming).

        If no clear user-tier group is found for a dependency, we skip it —
        better to let admin explicitly tick than to over-grant.
        """
        self.ensure_one()
        result = self.env['res.groups'].sudo()
        if not self.module_id:
            return result

        skip = self._GROUP_PICKER_SKIP_MODULES
        user_keywords = ('user', 'employee', 'salesman', 'salesperson', 'officer')

        for dep in self.module_id.dependencies_id:
            dep_module = dep.depend_id
            if not dep_module or dep_module.state not in ('installed', 'to upgrade'):
                continue
            if dep_module.name in skip:
                continue
            dep_groups = self._collect_groups_for_module(dep_module)
            if not dep_groups:
                continue
            # Find the user-tier group among them
            for g in dep_groups:
                short = g.name or ''
                if isinstance(short, dict):
                    short = short.get('en_US') or ''
                short_lower = (short or '').lower()
                # Double-safety: skip if this is an admin-tier group, even if
                # its name contains "user" somewhere weird
                if self._is_admin_bypass_group(g):
                    continue
                if self._is_admin_tier_by_name(g):
                    continue
                if len(g.implied_ids) == 0 and any(k in short_lower for k in user_keywords):
                    result |= g
                    break   # one user-tier group per dependency is enough
        return result

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

    # ============================================================
    # Access Groups — show and manage the res.groups defined by a
    # module so a non-technical admin can simply tick the groups
    # they want the user to have (e.g. "Sales Manager", "Technician")
    # and the corresponding menus/features become visible.
    # This is the Odoo-native way to expose Configuration-level menus
    # etc. — we don't fight the framework, we work with it.
    # ============================================================

    # Modules whose groups we never suggest (framework plumbing that
    # every user already has implicitly). Prevents noise in the picker.
    _GROUP_PICKER_SKIP_MODULES = {
        'base', 'web', 'bus', 'mail', 'portal', 'auth_signup',
        'iap', 'web_editor', 'resource',
    }

    # Categories whose groups we hide from the picker (too dangerous
    # or irrelevant for non-technical admins). These are the "system"
    # / "extra rights" buckets.
    _GROUP_PICKER_SKIP_CATEGORY_XMLIDS = {
        'base.module_category_hidden',
        'base.module_category_usability',
    }

    # =================================================================
    # CRITICAL SAFETY — groups we NEVER grant automatically
    # These are admin-bypass groups. Granting them silently escalates
    # a normal user into an administrator who bypasses this whole module.
    # If an admin wants to grant them, they must do it manually in
    # Settings → Users & Companies, never through my code.
    # =================================================================
    _NEVER_AUTO_GRANT_XMLIDS = {
        'base.group_system',          # full admin bypass
        'base.group_erp_manager',     # Access Rights — edits other users' permissions
        'base.group_no_one',          # Technical Features — shows dev-only items
        'base.group_multi_company',   # Multi-company toggle
        'base.group_multi_currency',  # Multi-currency toggle
    }

    # Name patterns that indicate a group is "manager" / "admin" tier and
    # should NEVER be auto-granted. The picker shows them so admin can
    # choose manually, but _grant_module_groups skips them.
    _ADMIN_TIER_NAME_PATTERNS = (
        'manager', 'administrator', 'admin', 'advisor',
        'supervisor', 'chief', 'director',
    )

    def _is_admin_bypass_group(self, group):
        """
        Return True if this group is a known admin-bypass group we must
        NEVER auto-grant. Checks by xml_id and also by walking implied_ids
        to catch groups that grant erp_manager/system transitively.
        """
        if not group or not group.exists():
            return False
        try:
            # Resolve never-grant xml_ids to IDs once
            blocked_ids = set()
            for xmlid in self._NEVER_AUTO_GRANT_XMLIDS:
                try:
                    rec = self.env.ref(xmlid, raise_if_not_found=False)
                    if rec:
                        blocked_ids.add(rec.id)
                except Exception:
                    pass
            if group.id in blocked_ids:
                return True
            # Check transitive implied_ids — a group that IMPLIES erp_manager
            # makes the user an erp_manager, so treat it as a bypass group too
            try:
                for implied in (group.implied_ids or []):
                    if implied.id in blocked_ids:
                        return True
            except Exception:
                pass
        except Exception:
            pass
        return False

    def _is_admin_tier_by_name(self, group):
        """
        Heuristic: does this group's name/short_name contain a word
        that indicates it's a manager/admin tier we shouldn't auto-grant?
        """
        try:
            short = group.name or ''
            if isinstance(short, dict):
                short = short.get('en_US') or ''
            short_lower = (short or '').lower()
            for pat in self._ADMIN_TIER_NAME_PATTERNS:
                if pat in short_lower:
                    return True
        except Exception:
            pass
        return False

    def _collect_groups_for_module(self, module):
        """
        Return a recordset of res.groups belonging to a single module.

        Odoo 19 schema note: res.groups no longer has category_id directly —
        it has privilege_id (M2O to res.groups.privilege) which has category_id.
        We access category through the privilege chain, but wrap in try/except
        so we degrade gracefully on older Odoo versions that still have direct
        category_id.
        """
        if not module or not module.exists():
            return self.env['res.groups'].sudo()
        if module.name in self._GROUP_PICKER_SKIP_MODULES:
            return self.env['res.groups'].sudo()

        imd = self.env['ir.model.data'].sudo().search([
            ('model', '=', 'res.groups'),
            ('module', '=', module.name),
        ])
        group_ids = set(imd.mapped('res_id'))
        if not group_ids:
            return self.env['res.groups'].sudo()

        groups = self.env['res.groups'].sudo().browse(list(group_ids)).exists()

        # Resolve skip-category IDs from xml_ids, defensively
        skip_cat_ids = set()
        for xmlid in self._GROUP_PICKER_SKIP_CATEGORY_XMLIDS:
            try:
                cat = self.env.ref(xmlid, raise_if_not_found=False)
                if cat:
                    skip_cat_ids.add(cat.id)
            except Exception:
                pass

        if skip_cat_ids:
            def _in_skip_category(g):
                """
                Check if a group's category is in the skip set.
                Try Odoo 19's privilege_id.category_id chain first,
                fall back to category_id for older versions.
                """
                try:
                    # Odoo 19: privilege_id → category_id
                    if 'privilege_id' in g._fields and g.privilege_id:
                        cat = g.privilege_id.category_id
                        if cat and cat.id in skip_cat_ids:
                            return True
                except Exception:
                    pass
                try:
                    # Pre-19 fallback
                    if 'category_id' in g._fields and g.category_id:
                        if g.category_id.id in skip_cat_ids:
                            return True
                except Exception:
                    pass
                return False

            groups = groups.filtered(lambda g: not _in_skip_category(g))
        return groups

    def _serialize_group(self, g, user_group_ids, source_module_label=None):
        """Turn a res.groups record into the dashboard JSON shape.

        Odoo 19 compatible: builds the 'full_name' manually from
        privilege_id.name + group.name since full_name attribute may be gone.
        """
        short = g.name or ''
        if isinstance(short, dict):
            short = short.get('en_US') or (
                list(short.values())[0] if short else ''
            )

        # Build "Category / Group" label using Odoo 19's privilege_id chain.
        # Falls back to just short name if we can't resolve the prefix.
        prefix = ''
        try:
            if 'privilege_id' in g._fields and g.privilege_id:
                priv_name = g.privilege_id.name or ''
                if isinstance(priv_name, dict):
                    priv_name = priv_name.get('en_US') or (
                        list(priv_name.values())[0] if priv_name else ''
                    )
                prefix = priv_name or ''
        except Exception:
            pass
        if not prefix:
            try:
                # Pre-19 fallback — old full_name attribute
                fn = getattr(g, 'full_name', None)
                if fn:
                    if isinstance(fn, dict):
                        fn = fn.get('en_US') or (list(fn.values())[0] if fn else '')
                    # full_name is usually "Category / Short"
                    label = fn
                    comment = g.comment or ''
                    if isinstance(comment, dict):
                        comment = comment.get('en_US') or ''
                    is_user_group = (
                        len(g.implied_ids) == 0
                        and ('user' in (short or '').lower() or 'employee' in (short or '').lower())
                    )
                    data = {
                        'id': g.id, 'name': label, 'short_name': short,
                        'comment': comment, 'is_member': g.id in user_group_ids,
                        'is_user_group': is_user_group,
                    }
                    if source_module_label:
                        data['source_label'] = source_module_label
                    return data
            except Exception:
                pass

        label = f"{prefix} / {short}" if prefix else short
        comment = g.comment or ''
        if isinstance(comment, dict):
            comment = comment.get('en_US') or ''
        is_user_group = (
            len(g.implied_ids) == 0
            and ('user' in (short or '').lower() or 'employee' in (short or '').lower())
        )
        data = {
            'id': g.id,
            'name': label,
            'short_name': short,
            'comment': comment,
            'is_member': g.id in user_group_ids,
            'is_user_group': is_user_group,
        }
        if source_module_label:
            data['source_label'] = source_module_label
        return data

    @api.model
    def get_module_access_groups(self, module_id, user_id):
        """
        Return the security groups a given module exposes to the dashboard.

        Strategy (Option C — "own groups, or fallback to dependency groups"):
        1. If the module defines its OWN groups → return those.
        2. Otherwise, walk the module's DIRECT dependencies (one level deep)
           and collect their groups — this handles modules like Easy Sales
           that lazily reuse Sales / Account groups without declaring any
           of their own.

        Output:
        [
            {
                'id': int, 'name': str, 'short_name': str, 'comment': str,
                'is_member': bool, 'is_user_group': bool,
                'source_label': str  # "(from Sales)" for fallback groups
            },
            ...
        ]
        """
        module = self.env['ir.module.module'].sudo().browse(module_id)
        if not module.exists():
            return []

        user = self.env['res.users'].sudo().browse(user_id)
        if not user.exists():
            return []

        user_group_ids = set(user.group_ids.ids)

        # Step 1: this module's own groups
        own = self._collect_groups_for_module(module)
        if own:
            result = [self._serialize_group(g, user_group_ids) for g in own]
        else:
            # Step 2: fallback to direct dependencies
            result = []
            seen_group_ids = set()
            for dep in module.dependencies_id:
                dep_module = dep.depend_id
                if not dep_module or dep_module.state not in ('installed', 'to upgrade'):
                    continue
                dep_groups = self._collect_groups_for_module(dep_module)
                if not dep_groups:
                    continue
                dep_label = dep_module.shortdesc or dep_module.name
                for g in dep_groups:
                    if g.id in seen_group_ids:
                        continue
                    seen_group_ids.add(g.id)
                    result.append(
                        self._serialize_group(g, user_group_ids, source_module_label=dep_label)
                    )

        # Sort: basic user first, then managers, then the rest alphabetically
        def sort_key(item):
            sn = (item['short_name'] or '').lower()
            if item['is_user_group']:
                return (0, sn)
            if 'manager' in sn:
                return (1, sn)
            return (2, sn)
        result.sort(key=sort_key)
        return result

    @api.model
    @api.model
    def toggle_user_group(self, user_id, group_id, checked):
        """
        Add or remove a user from a specific res.groups.
        Called from the dashboard when admin ticks/unticks a group checkbox.
        Returns the new membership state (True/False) so the UI can confirm.

        Even in manual toggle mode we refuse to auto-grant the admin-bypass
        groups (group_system, group_erp_manager, etc). If an admin genuinely
        needs to escalate a user to administrator, they should do it via
        Settings → Users, not via this module.
        """
        user = self.env['res.users'].sudo().browse(user_id)
        group = self.env['res.groups'].sudo().browse(group_id)
        if not user.exists() or not group.exists():
            return False
        # Safety: never touch superuser
        if user.id == 1:
            return False
        # Never grant admin-bypass groups through this endpoint
        if checked and self._is_admin_bypass_group(group):
            _logger.warning(
                "PrivilegeManager: blocked attempt to grant bypass group "
                "'%s' to user '%s' via dashboard",
                group.name, user.login
            )
            return False
        if checked:
            if user.id not in group.user_ids.ids:
                group.sudo().write({'user_ids': [(4, user.id)]})
            return True
        else:
            if user.id in group.user_ids.ids:
                group.sudo().write({'user_ids': [(3, user.id)]})
            return False

    @api.model
    def grant_all_module_groups(self, module_id, user_id):
        """
        Grant ALL discoverable groups of this module to the user in one call.
        Returns the count of groups newly added.
        """
        groups_info = self.get_module_access_groups(module_id, user_id)
        count = 0
        for g in groups_info:
            if not g['is_member']:
                self.toggle_user_group(user_id, g['id'], True)
                count += 1
        return count

    @api.model
    def check_user_admin_status(self, user_id):
        """
        Inspect a user's current group memberships and return a dict
        describing whether they have admin-bypass groups. Used by the
        dashboard to display a warning banner so the admin knows
        privilege restrictions will not apply to this user.

        Return shape:
        {
            'is_admin': bool,          # overall: has any bypass group
            'has_group_system': bool,
            'has_erp_manager': bool,
            'has_privilege_manager': bool,  # our own admin group
            'bypass_group_names': [str, ...],
        }
        """
        user = self.env['res.users'].sudo().browse(user_id)
        if not user.exists():
            return {
                'is_admin': False,
                'has_group_system': False,
                'has_erp_manager': False,
                'has_privilege_manager': False,
                'bypass_group_names': [],
            }

        user_group_ids = set(user.group_ids.ids)
        checks = {
            'has_group_system': 'base.group_system',
            'has_erp_manager': 'base.group_erp_manager',
            'has_privilege_manager': 'user_privilege_manager.group_privilege_manager',
        }
        result = {
            'is_admin': False,
            'bypass_group_names': [],
        }
        for key, xmlid in checks.items():
            try:
                g = self.env.ref(xmlid, raise_if_not_found=False)
                if g and g.id in user_group_ids:
                    result[key] = True
                    name = g.name
                    if isinstance(name, dict):
                        name = name.get('en_US') or ''
                    result['bypass_group_names'].append(name or xmlid)
                else:
                    result[key] = False
            except Exception:
                result[key] = False
        # superuser check
        if user.id == 1:
            result['is_admin'] = True
            if 'Superuser (uid=1)' not in result['bypass_group_names']:
                result['bypass_group_names'].append('Superuser (uid=1)')
        # Overall admin = has system OR erp_manager (privilege_manager is ours
        # and legitimate — we shouldn't warn just because they're set up to
        # manage privileges)
        if result.get('has_group_system') or result.get('has_erp_manager'):
            result['is_admin'] = True
        return result

    @api.model
    def cleanup_admin_groups(self, user_id):
        """
        Emergency revert: remove admin-bypass + manager-tier groups from a
        user that was accidentally over-granted by older versions of this
        module. This is a one-click fix for users whose Role got bumped to
        Administrator by the module.

        Removes:
          - base.group_erp_manager (Access Rights)
          - base.group_system (Administration / Settings) — ONLY if admin
            confirms explicitly (we surface a separate warning for this)
          - Any *.group_*_manager that user has
          - Any group whose name matches admin-tier patterns

        KEEPS:
          - base.group_user (internal user)
          - *.group_*_user / group_*_salesman etc (basic user tier)
          - Our own group_privilege_manager (if they had it)

        Returns dict: {'removed': [group_name, ...], 'kept_critical': [...]}
        """
        user = self.env['res.users'].sudo().browse(user_id)
        if not user.exists() or user.id == 1:
            return {'removed': [], 'kept_critical': []}

        removed = []
        to_remove_ids = []

        # 1. base.group_erp_manager — always remove on cleanup
        try:
            erp_mgr = self.env.ref('base.group_erp_manager', raise_if_not_found=False)
            if erp_mgr and erp_mgr.id in user.group_ids.ids:
                to_remove_ids.append(erp_mgr.id)
                removed.append('Access Rights (base.group_erp_manager)')
        except Exception:
            pass

        # 2. Any *.group_*_manager / Administrator-named group
        for g in user.group_ids:
            try:
                short = g.name or ''
                if isinstance(short, dict):
                    short = short.get('en_US') or ''
                short_lower = (short or '').lower()
                # Skip if not admin-tier by name
                if not any(p in short_lower for p in self._ADMIN_TIER_NAME_PATTERNS):
                    continue
                # Skip our own privilege manager group — that's legit
                try:
                    our_group = self.env.ref(
                        'user_privilege_manager.group_privilege_manager',
                        raise_if_not_found=False
                    )
                    if our_group and g.id == our_group.id:
                        continue
                except Exception:
                    pass
                if g.id not in to_remove_ids:
                    to_remove_ids.append(g.id)
                    # Use module_privilege_full_label if we can resolve it
                    prefix = ''
                    try:
                        if 'privilege_id' in g._fields and g.privilege_id:
                            pn = g.privilege_id.name
                            if isinstance(pn, dict):
                                pn = pn.get('en_US') or ''
                            prefix = pn or ''
                    except Exception:
                        pass
                    label = f"{prefix} / {short}" if prefix else short
                    removed.append(label)
            except Exception:
                continue

        # Do the removal
        if to_remove_ids:
            cmd = [(3, gid) for gid in to_remove_ids]
            user.sudo().write({'group_ids': cmd})

        kept_critical = []
        # Warn about group_system — we did NOT remove it automatically since
        # it's too destructive; admin must do it manually
        try:
            sys_g = self.env.ref('base.group_system', raise_if_not_found=False)
            if sys_g and sys_g.id in user.group_ids.ids:
                kept_critical.append(
                    'Administration: Settings (base.group_system) — not removed '
                    'automatically. To remove, go to Settings → Users → '
                    + user.login + ' → Access Rights and change Role from '
                    'Administrator to User.'
                )
        except Exception:
            pass

        return {'removed': removed, 'kept_critical': kept_critical}

    @api.model
    def get_module_dependencies_info(self, module_id, user_id):
        """
        Return info about module dependencies for the dependency-prompt modal.
        Used before Add Module — admin picks whether to co-add missing deps.
        """
        module = self.env['ir.module.module'].sudo().browse(module_id)
        if not module.exists():
            return {'module_id': module_id, 'module_name': '', 'missing_deps': []}

        # BFS dep walk
        visited = set()
        to_visit = [module]
        all_deps = self.env['ir.module.module'].sudo()
        skip = {
            'base', 'web', 'web_editor', 'bus', 'mail', 'resource',
            'base_setup', 'base_import', 'base_automation',
            'portal', 'digest', 'barcodes', 'iap', 'uom',
            'phone_validation', 'auth_signup', 'auth_totp',
        }
        while to_visit:
            current = to_visit.pop(0)
            if current.id in visited:
                continue
            visited.add(current.id)
            for dep in current.dependencies_id:
                dep_module = dep.depend_id
                if not dep_module or dep_module.id in visited:
                    continue
                if dep_module.state not in ('installed', 'to upgrade'):
                    continue
                if dep_module.name in skip:
                    continue
                all_deps |= dep_module
                to_visit.append(dep_module)

        if not all_deps:
            return {
                'module_id': module_id,
                'module_name': module.shortdesc or module.name,
                'missing_deps': [],
            }

        existing = self.sudo().search([
            ('user_id', '=', user_id),
            ('module_id', 'in', all_deps.ids),
            ('active', '=', True),
        ])
        existing_ids = set(existing.mapped('module_id').ids)

        missing = []
        for dep in all_deps.sorted(key=lambda m: m.shortdesc or m.name):
            if dep.id in existing_ids:
                continue
            missing.append({
                'id': dep.id,
                'name': dep.name,
                'shortdesc': dep.shortdesc or dep.name,
            })
        return {
            'module_id': module_id,
            'module_name': module.shortdesc or module.name,
            'missing_deps': missing,
        }

    @api.model
    def classify_user_modules(self, user_id):
        """
        For the UI: figure out which of this user's module.privilege records
        are "primary" (explicitly added by admin) vs "dependency" (pulled in
        because a primary module depends on them). Lets the dashboard
        collapse dependency cards by default for a cleaner view.

        Returns a dict: { module_privilege_id: {
            'is_dependency': bool,
            'parent_module_names': [str, ...],   # modules that required this as dep
        } }

        Algorithm: walk each primary's full dep tree. Any of the user's
        module.privilege whose module is a dep of another is tagged as
        dependency. If a module.privilege doesn't appear in anyone's dep
        tree, it's primary.
        """
        all_mps = self.sudo().search([
            ('user_id', '=', user_id),
            ('active', '=', True),
        ])
        if not all_mps:
            return {}

        # Map module_id → module.privilege record id (for quick lookup)
        mod_to_mp = {mp.module_id.id: mp.id for mp in all_mps if mp.module_id}
        mod_names_by_id = {mp.module_id.id: (mp.module_id.shortdesc or mp.module_id.name)
                           for mp in all_mps if mp.module_id}

        # For each user module, compute its full (transitive) dependency set
        # so we know which other user-modules it drags in.
        skip = {
            'base', 'web', 'web_editor', 'bus', 'mail', 'resource',
            'base_setup', 'base_import', 'base_automation',
            'portal', 'digest', 'barcodes', 'iap', 'uom',
            'phone_validation', 'auth_signup', 'auth_totp',
        }

        def _full_dep_set(module):
            seen = set()
            stack = [module]
            result = set()
            while stack:
                m = stack.pop()
                if m.id in seen:
                    continue
                seen.add(m.id)
                for d in m.dependencies_id:
                    dm = d.depend_id
                    if not dm or dm.state not in ('installed', 'to upgrade'):
                        continue
                    if dm.name in skip:
                        continue
                    result.add(dm.id)
                    stack.append(dm)
            return result

        # Compute who-depends-on-whom within the user's module set
        depended_on_by = {}  # mp_id → [parent_module_short_name, ...]
        for mp in all_mps:
            if not mp.module_id:
                continue
            deps = _full_dep_set(mp.module_id)
            parent_name = mod_names_by_id.get(mp.module_id.id, mp.module_id.name)
            for dep_mod_id in deps:
                if dep_mod_id in mod_to_mp:  # this dep is also in user's module list
                    child_mp_id = mod_to_mp[dep_mod_id]
                    if child_mp_id == mp.id:
                        continue
                    depended_on_by.setdefault(child_mp_id, []).append(parent_name)

        classification = {}
        for mp in all_mps:
            parents = depended_on_by.get(mp.id, [])
            classification[mp.id] = {
                'is_dependency': len(parents) > 0,
                'parent_module_names': sorted(set(parents)),
            }
        return classification

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
