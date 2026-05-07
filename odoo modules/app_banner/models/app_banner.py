from odoo import models, fields


class AppBanner(models.Model):
    _name = 'app.banner'
    _description = 'App Banner Image'
    _order = 'sequence, id'

    name = fields.Char(string='Title')
    image = fields.Binary(string='Image', required=True, attachment=True)
    image_filename = fields.Char(string='Filename')
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
