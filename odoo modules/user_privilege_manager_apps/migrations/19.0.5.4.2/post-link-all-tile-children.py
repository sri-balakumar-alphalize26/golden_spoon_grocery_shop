import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


LINKS = {
    'feature_home_tile_pos': (
        'feature_pos_open_register',
        'feature_pos_close_register',
    ),
    'feature_home_tile_orders': (
        'feature_orders_resume_draft',
        'feature_orders_export_pdf',
    ),
    'feature_home_tile_sales_report': (
        'feature_sales_report_export_pdf',
        'feature_sales_report_export_excel',
    ),
    'feature_home_tile_easy_purchase': (
        'feature_easy_purchase_create',
        'feature_easy_purchase_save',
        'feature_easy_purchase_cancel',
    ),
    'feature_home_tile_customers': (
        'feature_customers_add',
        'feature_customers_edit',
    ),
    'feature_home_tile_expenses': (
        'feature_expenses_create',
        'feature_expenses_edit',
        'feature_expenses_approve',
        'feature_expenses_refuse',
    ),
    'feature_home_tile_users': (
        'feature_users_add',
        'feature_users_edit',
        'feature_users_change_password',
    ),
    'feature_home_tile_app_banners': (
        'feature_app_banners_add',
        'feature_app_banners_edit',
        'feature_app_banners_delete',
    ),
}


def migrate(cr, version):
    """Force-set parent_id on every child app.feature row."""
    env = api.Environment(cr, SUPERUSER_ID, {})
    for parent_xmlid, child_xmlids in LINKS.items():
        parent = env.ref(
            'user_privilege_manager_apps.%s' % parent_xmlid,
            raise_if_not_found=False,
        )
        if not parent:
            _logger.warning(
                '[FeatureAdmin migration] parent %s not found; skipping %d children',
                parent_xmlid, len(child_xmlids),
            )
            continue
        for child_xmlid in child_xmlids:
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
