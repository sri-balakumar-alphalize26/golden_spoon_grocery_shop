from odoo import models, fields


class PosOrder(models.Model):
    """Tag every POS order with the device's GPS coordinates + a human-
    readable place name captured at receipt time.

    The React Native app fills these via a plain ORM write right after
    `validatePosOrderOdoo` succeeds (see captureAndStoreOrderLocation in
    src/api/services/generalApi.js). Reverse geocoding is done client-side
    via expo-location's reverseGeocodeAsync (free, on-device, no API key).
    Server stores the values; no Python-side geocoding logic.
    """
    _inherit = 'pos.order'

    order_latitude = fields.Float(
        string='Latitude',
        digits=(16, 8),
        help='Device latitude captured when Validate Payment was tapped.',
    )
    order_longitude = fields.Float(
        string='Longitude',
        digits=(16, 8),
        help='Device longitude captured when Validate Payment was tapped.',
    )
    order_location_name = fields.Char(
        string='Location',
        help='Human-readable place name reverse-geocoded on the device, '
             'e.g. "Sultan Qaboos Street, Muscat, Oman".',
    )
