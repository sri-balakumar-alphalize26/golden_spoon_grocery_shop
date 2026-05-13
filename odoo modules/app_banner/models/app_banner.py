from odoo import _, models, fields


class AppBanner(models.Model):
    _name = 'app.banner'
    _description = 'App Banner Image'
    # mail.thread powers the chatter on the form view so admins can audit
    # who changed which banner (image swap, archive, name edit).
    _inherit = ['mail.thread']
    # Newest-first — `sequence` is no longer surfaced in the UI (the mobile
    # app always sends 10), so ordering by it is meaningless. Keep the
    # field on the model to preserve the existing column + accept the
    # app's payload without errors.
    _order = 'id desc'
    _rec_name = 'name'

    name = fields.Char(string='Title', tracking=True)
    image = fields.Binary(
        string='Image',
        required=True,
        attachment=True,
        tracking=True,
    )
    image_filename = fields.Char(string='Filename')
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True, tracking=True)

    def name_get(self):
        # Keep the picker / breadcrumb readable even when admin hasn't
        # named the banner yet. Mirrors the mobile app's fallback at
        # BannersScreen.js (`Banner #${item.id}`).
        return [(rec.id, rec.name or _('Banner #%s') % rec.id) for rec in self]

    # --- Header-button actions -------------------------------------------------

    def action_archive_banner(self):
        for rec in self:
            rec.active = False
        return True

    def action_unarchive_banner(self):
        for rec in self:
            rec.active = True
        return True

    def action_delete_banner(self):
        # The XML button uses confirm="..." so the Odoo client has already
        # asked the user to confirm by the time we get here. Drop the
        # record(s) and close the form.
        self.unlink()
        return {'type': 'ir.actions.act_window_close'}
