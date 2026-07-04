from . import models


def post_init_hook(env):
    """Ensure the built-in Dozens unit is active.

    Odoo 19 ships ``uom.product_uom_dozen`` archived (active=False), and
    reactivating an already-archived record through plain XML data is
    unreliable (the ORM data loader filters archived rows), so we force it
    on here at install time.
    """
    dozen = env.ref('uom.product_uom_dozen', raise_if_not_found=False)
    if dozen and not dozen.active:
        dozen.active = True
