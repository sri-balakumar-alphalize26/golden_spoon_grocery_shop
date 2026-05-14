from . import models
from . import wizard


def post_init_hook(env):
    """
    Run after installation or upgrade:
    1. Remove stale module.privilege records for users who have roles
       (roles are now the primary access mechanism — module.privilege
       records for role-users were created by the old logic and silently
       override roles).
    2. Also clean up user.privilege records that were auto-synced FROM
       those module.privilege records (identified by source_module_id set).
    3. Sync any remaining module.privilege records (users with no roles).
    """
    try:
        ModPriv = env['module.privilege'].sudo()
        UserPriv = env['user.privilege'].sudo()
        PrivRole = env['privilege.role'].sudo()

        # Find all users who belong to at least one active role
        role_user_ids = set()
        roles = PrivRole.search([('active', '=', True)])
        for role in roles:
            role_user_ids.update(role.user_ids.ids)

        if role_user_ids:
            # 1. Remove module.privilege records for role-users
            stale_mp = ModPriv.search([
                ('user_id', 'in', list(role_user_ids)),
                ('active', '=', True),
            ])
            if stale_mp:
                stale_mp.unlink()

            # 2. Remove user.privilege records that were auto-synced from
            #    module.privilege (source_module_id is set) for role-users
            stale_up = UserPriv.search([
                ('user_id', 'in', list(role_user_ids)),
                ('source_module_id', '!=', False),
            ])
            if stale_up:
                stale_up.unlink()

    except Exception:
        pass

    # 3. Sync remaining module.privilege records (users with no roles)
    try:
        env['module.privilege'].sudo().action_sync_all_to_user_privileges()
    except Exception:
        pass

    # 4. Create auto Odoo groups for any existing roles that don't have one yet
    # Also re-sync auto-detected module groups for ALL active roles with users
    try:
        all_roles = env['privilege.role'].sudo().search([('active', '=', True)])
        for role in all_roles:
            # Ensure auto group exists
            role._ensure_auto_group()
            # Re-apply all groups (auto + manual + auto-detected from model lines)
            if role.user_ids:
                role._apply_odoo_groups_to_users(role.user_ids.ids)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("post_init_hook group sync error: %s", e)
