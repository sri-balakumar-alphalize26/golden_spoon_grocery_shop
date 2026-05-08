from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class UserPrivilege(models.Model):
    _name = 'user.privilege'
    _description = 'User Privilege'
    _rec_name = 'display_name'
    _order = 'user_id, model_id'
    _sql_constraints = [
        ('user_model_unique', 'UNIQUE(user_id, model_id, company_id)',
         'A privilege record already exists for this user and model!'),
    ]


    user_id = fields.Many2one(
        'res.users',
        string='User',
        required=True,
        ondelete='cascade',
        index=True,
    )
    model_id = fields.Many2one(
        'ir.model',
        string='Model',
        required=True,
        ondelete='cascade',
        domain=[('transient', '=', False)],
        index=True,
    )
    model_name = fields.Char(
        related='model_id.model',
        string='Model Technical Name',
        store=True,
        readonly=True,
    )
    perm_read = fields.Boolean(
        string='Read',
        default=True,
        help='Allow user to read/view records of this model.',
    )
    perm_create = fields.Boolean(
        string='Create',
        default=True,
        help='Allow user to create new records of this model.',
    )
    perm_write = fields.Boolean(
        string='Edit',
        default=True,
        help='Allow user to edit/modify existing records of this model.',
    )
    perm_cancel = fields.Boolean(
        string='Cancel',
        default=True,
        help='Allow user to cancel records (state-based models).',
    )
    perm_unlink = fields.Boolean(
        string='Delete',
        default=True,
        help='Allow user to delete records of this model.',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )
    display_name = fields.Char(
        string='Display Name',
        compute='_compute_display_name',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    notes = fields.Text(
        string='Notes',
        help='Optional notes about this privilege configuration.',
    )
    source_module_id = fields.Many2one(
        'ir.module.module',
        string='Module',
        ondelete='set null',
        index=True,
        help='The module this privilege belongs to (auto-set from Module Privileges).',
    )
    source_module_name = fields.Char(
        related='source_module_id.shortdesc',
        string='Module Name',
        readonly=True,
    )
    @api.depends('user_id', 'model_id')
    def _compute_display_name(self):
        for rec in self:
            user_name = rec.user_id.name or ''
            model_name = rec.model_id.name or ''
            rec.display_name = f"{user_name} - {model_name}"

    @api.model
    def get_user_privilege(self, model_name, user_id=None):
        """Get privilege record for a user on a specific model.

        Returns a dict with permission flags.
        If no privilege record exists, returns None (standard Odoo access applies).
        """
        if user_id is None:
            user_id = self.env.uid

        # Superuser bypasses all privilege checks
        if user_id == 1:  # superuser uid is always 1
            return None

        # Admin users with privilege manager group bypass checks
        user = self.env['res.users'].sudo().browse(user_id)
        if user.has_group('user_privilege_manager.group_privilege_manager'):
            return None

        # Step 1: Check MANUALLY set user-level privilege only.
        # Records auto-synced from module.privilege have source_module_id set —
        # those must NOT override group assignments, so we exclude them here.
        user_privilege = self.sudo().search([
            ('user_id', '=', user_id),
            ('model_name', '=', model_name),
            ('active', '=', True),
            ('source_module_id', '=', False),   # manually set records only
        ], limit=1)

        if user_privilege:
            return {
                'perm_read': user_privilege.perm_read,
                'perm_create': user_privilege.perm_create,
                'perm_write': user_privilege.perm_write,
                'perm_cancel': user_privilege.perm_cancel,
                'perm_unlink': user_privilege.perm_unlink,
            }

        # Step 2: Group-level privileges — PRIMARY access control mechanism.
        # Checked BEFORE module-synced records so groups are always authoritative.
        # Most permissive wins across all groups the user belongs to.
        role_privs = self.env['privilege.role'].get_role_privileges(model_name, user_id)
        if role_privs:
            return role_privs

        # Step 3: Module-level user-specific config — only applies when user has
        # NO group covering this model. Checks module.privilege.line directly.
        try:
            model_rec = self.env['ir.model'].sudo().search(
                [('model', '=', model_name)], limit=1)
            if model_rec:
                mp_line = self.env['module.privilege.line'].sudo().search([
                    ('user_id', '=', user_id),
                    ('model_id', '=', model_rec.id),
                ], limit=1)
                if mp_line:
                    return {
                        'perm_read': mp_line.perm_read,
                        'perm_create': mp_line.perm_create,
                        'perm_write': mp_line.perm_write,
                        'perm_cancel': mp_line.perm_cancel,
                        'perm_unlink': mp_line.perm_unlink,
                    }
        except Exception:
            pass

        # Step 4: No restriction defined — standard Odoo access applies.
        return None

    @api.model
    def check_privilege(self, model_name, operation, user_id=None):
        """Check if user has privilege for the given operation.

        Args:
            model_name: Technical model name (e.g., 'sale.order')
            operation: One of 'read', 'create', 'write', 'cancel', 'unlink'
            user_id: User ID (defaults to current user)

        Returns:
            True if allowed, False if blocked.
            None if no privilege record exists (standard access applies).
        """
        privs = self.get_user_privilege(model_name, user_id)
        if privs is None:
            return None  # No restriction
        perm_key = f'perm_{operation}'
        return privs.get(perm_key, True)

    def action_grant_all(self):
        """Quick action to grant all permissions."""
        self.write({
            'perm_read': True,
            'perm_create': True,
            'perm_write': True,
            'perm_cancel': True,
            'perm_unlink': True,
        })

    def action_revoke_all(self):
        """Quick action to revoke all permissions (except read)."""
        self.write({
            'perm_read': True,  # Keep read to avoid locking out
            'perm_create': False,
            'perm_write': False,
            'perm_cancel': False,
            'perm_unlink': False,
        })

    def action_readonly(self):
        """Quick action to set read-only access."""
        self.write({
            'perm_read': True,
            'perm_create': False,
            'perm_write': False,
            'perm_cancel': False,
            'perm_unlink': False,
        })
