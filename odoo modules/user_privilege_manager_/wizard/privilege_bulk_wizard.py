from odoo import models, fields, api


class PrivilegeBulkCreateWizard(models.TransientModel):
    _name = 'privilege.bulk.create.wizard'
    _description = 'Bulk Create User Privileges'

    user_ids = fields.Many2many(
        'res.users',
        string='Users',
        domain=[('share', '=', False)],
        required=True,
        help='Select users to create privilege records for.',
    )
    model_id = fields.Many2one(
        'ir.model',
        string='Model',
        required=True,
        domain=[('transient', '=', False)],
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        help='Leave empty for global (all companies). Set a company for company-specific privilege.',
    )
    perm_read = fields.Boolean(string='Read', default=True)
    perm_create = fields.Boolean(string='Create', default=True)
    perm_write = fields.Boolean(string='Edit', default=True)
    perm_cancel = fields.Boolean(string='Cancel', default=True)
    perm_unlink = fields.Boolean(string='Delete', default=True)

    def action_create_privileges(self):
        self.ensure_one()
        UserPrivilege = self.env['user.privilege']
        created = 0
        for user in self.user_ids:
            existing = UserPrivilege.search([
                ('user_id', '=', user.id),
                ('model_id', '=', self.model_id.id),
            ], limit=1)
            vals = {
                'user_id': user.id,
                'model_id': self.model_id.id,
                'perm_read': self.perm_read,
                'perm_create': self.perm_create,
                'perm_write': self.perm_write,
                'perm_cancel': self.perm_cancel,
                'perm_unlink': self.perm_unlink,
            }
            if self.company_id:
                vals['company_id'] = self.company_id.id
            if existing:
                existing.write(vals)
            else:
                UserPrivilege.create(vals)
            created += 1
        return {'type': 'ir.actions.act_window_close'}


class MenuPrivilegeBulkWizard(models.TransientModel):
    _name = 'menu.privilege.bulk.wizard'
    _description = 'Bulk Create Menu Privileges'

    user_ids = fields.Many2many(
        'res.users',
        string='Users',
        domain=[('share', '=', False)],
        required=True,
        help='Select users to set menu visibility for.',
    )
    menu_ids = fields.Many2many(
        'ir.ui.menu',
        string='Menus',
        required=True,
    )
    is_visible = fields.Boolean(
        string='Visible',
        default=False,
        help='If checked, menus will be visible. If unchecked, menus will be hidden.',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        help='Leave empty for global. Set a company for company-specific rule.',
    )

    def action_create_menu_privileges(self):
        self.ensure_one()
        MenuPrivilege = self.env['menu.privilege']
        for user in self.user_ids:
            for menu in self.menu_ids:
                existing = MenuPrivilege.search([
                    ('user_id', '=', user.id),
                    ('menu_id', '=', menu.id),
                ], limit=1)
                vals = {
                    'user_id': user.id,
                    'menu_id': menu.id,
                    'is_visible': self.is_visible,
                }
                if self.company_id:
                    vals['company_id'] = self.company_id.id
                if existing:
                    existing.write(vals)
                else:
                    MenuPrivilege.create(vals)
        return {'type': 'ir.actions.act_window_close'}


class ModuleVisibilityBulkWizard(models.TransientModel):
    _name = 'module.visibility.bulk.wizard'
    _description = 'Bulk Set Module (App) Visibility'

    user_ids = fields.Many2many(
        'res.users',
        string='Users',
        domain=[("share", "=", False)],
        required=True,
        help='Select users to set module visibility for.',
    )
    module_ids = fields.Many2many(
        'ir.module.module',
        string='Modules (Apps)',
        domain=[("state", "=", "installed")],
        required=True,
        help='Select the app(s) to show or hide.',
    )
    is_visible = fields.Boolean(
        string="App Visible",
        default=False,
        help="If unchecked, selected apps will be hidden for selected users.",
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        help='Leave empty for global. Set a company for company-specific rule.',
    )

    def action_apply(self):
        self.ensure_one()
        ModuleVis = self.env['module.visibility']
        for user in self.user_ids:
            for module in self.module_ids:
                existing = ModuleVis.search([
                    ('user_id', '=', user.id),
                    ('module_id', '=', module.id),
                ], limit=1)
                vals = {
                    'user_id': user.id,
                    'module_id': module.id,
                    'is_visible': self.is_visible,
                }
                if self.company_id:
                    vals['company_id'] = self.company_id.id
                if existing:
                    existing.write(vals)
                else:
                    ModuleVis.create(vals)
        return {'type': 'ir.actions.act_window_close'}
