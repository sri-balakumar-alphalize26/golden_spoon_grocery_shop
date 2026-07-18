from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})

    # P1.1 — ensure every real paper size has its own layout (2", 10", etc.).
    Layout = env['pos.invoice.layout'].sudo()
    for size in env['pos.invoice.paper.size'].sudo().search([('is_custom', '=', False)]):
        if size.company_id:
            Layout.resolve_for(size.company_id, size)

    # P1.3 — insert Company Name (Arabic) + (English) blocks into existing layouts,
    # placed right before the Company Header, so the names become movable sections.
    Block = env['pos.invoice.layout.block'].sudo()
    for layout in Layout.search([]):
        blocks = layout.block_ids.sorted(lambda b: (b.row, b.col, b.id))
        types = blocks.mapped('block_type')
        if 'company_name_en' in types or 'company_name_ar' in types:
            continue  # already migrated
        ar = Block.create({
            'layout_id': layout.id, 'block_type': 'company_name_ar',
            'col': 0, 'width_pct': 100, 'visible': True,
        })
        en = Block.create({
            'layout_id': layout.id, 'block_type': 'company_name_en',
            'col': 0, 'width_pct': 100, 'visible': True,
        })
        ordered = list(blocks)
        idx = next((k for k, b in enumerate(ordered) if b.block_type == 'header_info'), 0)
        ordered = ordered[:idx] + [ar, en] + ordered[idx:]
        for k, b in enumerate(ordered):
            b.row = k

    # P1.4 — seed the default header-field rows per company (from branding values).
    for settings in env['pos.invoice.settings'].sudo().search([]):
        settings._seed_header_fields()
