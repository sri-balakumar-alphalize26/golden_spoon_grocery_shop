from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    """Force the clean nested Invoice-Settings menu on every upgrade, so a database
    that was last upgraded before the v20 reorg (which showed the 3 items as flat
    top-level menus) self-heals: the parent becomes a pure heading (no action) and
    the three screens sit under it."""
    env = api.Environment(cr, SUPERUSER_ID, {})
    parent = env.ref('pos_dynamic_invoice.menu_pos_invoice_settings', raise_if_not_found=False)
    if not parent:
        return
    # The parent is a heading only — clicking it must NOT open the settings list.
    if parent.action:
        parent.action = False
    # Re-assert the children live under the parent, in order.
    for xmlid, seq in [
        ('pos_dynamic_invoice.menu_pos_invoice_settings_general', 1),
        ('pos_dynamic_invoice.menu_pos_invoice_paper_size', 2),
        ('pos_dynamic_invoice.menu_pos_invoice_layout', 3),
        ('pos_dynamic_invoice.menu_pos_invoice_user_manual', 4),
    ]:
        child = env.ref(xmlid, raise_if_not_found=False)
        if child and (child.parent_id.id != parent.id or child.sequence != seq):
            child.parent_id = parent.id
            child.sequence = seq
