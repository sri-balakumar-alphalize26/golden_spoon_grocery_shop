from . import models


def _post_init_hook(env):
    """Auto-configure pos_discount settings when this module is installed."""
    env['pos.config']._auto_enable_total_discount()
