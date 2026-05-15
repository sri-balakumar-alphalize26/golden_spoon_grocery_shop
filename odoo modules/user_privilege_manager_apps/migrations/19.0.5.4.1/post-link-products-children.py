import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    """Force-set parent_id on the two products.* child app.feature rows."""
    env = api.Environment(cr, SUPERUSER_ID, {})
    parent = env.ref(
        'user_privilege_manager_apps.feature_home_tile_products',
        raise_if_not_found=False,
    )
    if not parent:
        _logger.warning(
            '[FeatureAdmin migration] parent feature_home_tile_products '
            'not found; skipping'
        )
        return

    for child_xmlid in ('feature_products_add', 'feature_products_edit'):
        child = env.ref(
            'user_privilege_manager_apps.%s' % child_xmlid,
            raise_if_not_found=False,
        )
        if not child:
            _logger.warning(
                '[FeatureAdmin migration] child %s not found; skipping',
                child_xmlid,
            )
            continue
        if child.parent_id and child.parent_id.id == parent.id:
            _logger.info(
                '[FeatureAdmin migration] %s already linked', child_xmlid,
            )
            continue
        child.write({'parent_id': parent.id})
        _logger.info(
            '[FeatureAdmin migration] linked %s -> parent id=%s (%s)',
            child_xmlid, parent.id, parent.name,
        )
