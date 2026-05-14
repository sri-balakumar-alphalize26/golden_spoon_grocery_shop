from odoo import models, fields, api


class AppFeature(models.Model):
    """Catalog of app-side UI elements that can be hidden per user or role.

    Each record defines one gateable element. The React Native app fetches the
    set of `feature_key` strings hidden for the current user at login and
    renders any matching <FeatureGate> as null.

    Adding a new gateable element is a two-step process:
      1. Create a record here (admin UI: Privilege Manager > App Features).
      2. Wrap the corresponding RN component in <FeatureGate featureKey="...">.
    """
    _name = 'app.feature'
    _description = 'App Feature (gateable from Odoo)'
    _order = 'sequence, name'
    _rec_name = 'name'

    feature_key = fields.Char(
        string='Feature Key',
        required=True,
        index=True,
        help="String identifier the React Native app uses, e.g. 'home.banner'. "
             "Must match the featureKey prop on the corresponding <FeatureGate>.",
    )
    name = fields.Char(
        string='Display Name',
        required=True,
        help='Human-readable label shown to admins in the privilege UI.',
    )
    description = fields.Text(
        string='Description',
        help='Optional notes describing what this feature controls in the app.',
    )
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    parent_id = fields.Many2one(
        'app.feature',
        string='Parent Feature',
        ondelete='set null',
        index=True,
        help="Optional parent in the App Features admin tree. Children render "
             "as indented sub-rows under the parent's expand arrow. Visibility "
             "is independent per row -- hiding the parent does NOT hide children.",
    )

    _sql_constraints = [
        ('feature_key_unique', 'UNIQUE(feature_key)',
         'Feature key must be unique.'),
    ]
