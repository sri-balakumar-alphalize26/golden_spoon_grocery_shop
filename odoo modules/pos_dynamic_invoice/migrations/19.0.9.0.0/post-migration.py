# Dedupe pos.invoice.layout: keep ONE per (company, paper_size), delete extras.
# The unique _sql_constraint was silently unenforced in Odoo 19, so duplicates
# were created (the editor/renderer then picked different copies of a size). Keep
# the most-edited one (grid mode / most grid-set blocks / most blocks), fix names.
from odoo import SUPERUSER_ID, api


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Layout = env['pos.invoice.layout'].sudo()

    groups = {}
    for lay in Layout.search([], order='id'):
        key = (lay.company_id.id, lay.paper_size_id.id)
        groups.setdefault(key, []).append(lay)

    def score(l):
        grid_blocks = sum(1 for b in l.block_ids if (b.grid_w or 0) > 0)
        return (
            1 if l.positioning == 'grid' else 0,
            grid_blocks,
            len(l.block_ids),
            l.id,
        )

    for key, group in groups.items():
        keeper = group[0]
        if len(group) > 1:
            group.sort(key=score, reverse=True)
            keeper = group[0]
            for extra in group[1:]:
                extra.unlink()
        # Keep the name in sync with the paper size (fixes "4 inch = 210mm" labels).
        if keeper.paper_size_id and keeper.name != keeper.paper_size_id.name:
            keeper.name = keeper.paper_size_id.name
