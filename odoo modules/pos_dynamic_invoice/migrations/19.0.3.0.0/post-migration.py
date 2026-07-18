# Convert the six hardcoded size_mm_* fields (+ custom_paper_*) into
# pos.invoice.paper.size RECORDS, and repoint default_paper_size (a key) at the
# matching record via the new default_paper_size_id Many2one.
#
# Preserves each company's EDITED mm (reads the live columns, not the factory
# defaults). The old columns still exist here — Odoo leaves a removed field's
# column in place — so we can read them before they go unused.
from odoo import SUPERUSER_ID, api

# key, display name, old mm column, factory mm, band lo, band hi
FACTORY = [
    ('2in', '2 inch', 'size_mm_2in', 50, 40, 65),
    ('3in', '3 inch', 'size_mm_3in', 76, 60, 85),
    ('35in', '3.5 inch', 'size_mm_35in', 80, 70, 95),
    ('4in', '4 inch', 'size_mm_4in', 100, 85, 115),
    ('a5', 'A5', 'size_mm_a5', 148, 140, 160),
    ('a4', 'A4', 'size_mm_a4', 210, 200, 225),
]


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Size = env['pos.invoice.paper.size'].sudo()

    # Only read columns that actually exist (defensive across partial upgrades).
    cr.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'pos_invoice_settings'"
    )
    cols = {r[0] for r in cr.fetchall()}
    mm_cols = [f for (_, _, f, _, _, _) in FACTORY if f in cols]
    read = ['id', 'company_id'] + mm_cols
    for extra in ('default_paper_size', 'custom_paper_width', 'custom_paper_height'):
        if extra in cols:
            read.append(extra)
    idx = {c: i for i, c in enumerate(read)}

    cr.execute("SELECT %s FROM pos_invoice_settings" % ', '.join(read))
    for row in cr.fetchall():
        company_id = row[idx['company_id']]
        if not company_id:
            continue

        existing = {s.key: s for s in Size.search([('company_id', '=', company_id)])}
        by_key = {}
        for i, (key, label, fld, dflt, lo, hi) in enumerate(FACTORY):
            mm = (row[idx[fld]] if fld in idx and row[idx[fld]] else dflt)
            rec = existing.get(key)
            if not rec:
                rec = Size.create({
                    'company_id': company_id, 'key': key, 'name': label,
                    'width_mm': mm, 'height_mm': 0,
                    'min_mm': lo, 'max_mm': hi, 'sequence': (i + 1) * 10,
                })
            by_key[key] = rec

        # The 'custom' size takes the company's stored custom width/height.
        cw = (row[idx['custom_paper_width']] if 'custom_paper_width' in idx and row[idx['custom_paper_width']] else 80)
        ch = (row[idx['custom_paper_height']] if 'custom_paper_height' in idx and row[idx['custom_paper_height']] else 0)
        custom = existing.get('custom')
        if not custom:
            custom = Size.create({
                'company_id': company_id, 'key': 'custom', 'name': 'Custom',
                'width_mm': cw, 'height_mm': ch, 'is_custom': True, 'sequence': 100,
            })
        by_key['custom'] = custom

        # Repoint the default. Old value is already a stable key (2in/…/custom)
        # thanks to the 19.0.2.8.0 migration; fall back to 3.5 inch.
        old_key = row[idx['default_paper_size']] if 'default_paper_size' in idx else None
        target = by_key.get(old_key) or by_key.get('35in')
        if target:
            cr.execute(
                "UPDATE pos_invoice_settings SET default_paper_size_id = %s WHERE id = %s",
                (target.id, row[idx['id']]),
            )
