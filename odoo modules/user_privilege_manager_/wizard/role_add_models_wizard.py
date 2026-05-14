from odoo import models, fields, api


class RoleAddModelsWizard(models.TransientModel):
    _name = 'role.add.models.wizard'
    _description = 'Add Multiple Models to Group'

    role_id = fields.Many2one(
        'privilege.role',
        string='Group',
        required=True,
    )
    model_ids = fields.Many2many(
        'ir.model',
        string='Models',
        domain=[('transient', '=', False)],
        help='Select multiple models to add privilege lines for.',
    )
    perm_read = fields.Boolean(string='Read', default=True)
    perm_create = fields.Boolean(string='Create', default=True)
    perm_write = fields.Boolean(string='Edit', default=True)
    perm_cancel = fields.Boolean(string='Cancel', default=True)
    perm_unlink = fields.Boolean(string='Delete', default=True)

    def action_add_models(self):
        self.ensure_one()
        existing_model_ids = self.role_id.line_ids.mapped('model_id').ids
        new_lines = []
        for model in self.model_ids:
            if model.id not in existing_model_ids:
                new_lines.append((0, 0, {
                    'model_id': model.id,
                    'perm_read': self.perm_read,
                    'perm_create': self.perm_create,
                    'perm_write': self.perm_write,
                    'perm_cancel': self.perm_cancel,
                    'perm_unlink': self.perm_unlink,
                }))
        if new_lines:
            self.role_id.sudo().write({'line_ids': new_lines})
        # Reload the role form, opening on the Model Privileges tab
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'privilege.role',
            'res_id': self.role_id.id,
            'view_mode': 'form',
            'target': 'current',
            'context': {'active_tab': 'privileges'},
        }
