# Remap default_paper_size from the old mm-string values to the new stable
# preset keys, so existing settings records keep rendering at the same size
# after the Selection switched from mm-values to keys.
def migrate(cr, version):
    mapping = {
        '50': '2in',
        '76': '3in',
        '80': '35in',
        '100': '4in',
        '148': 'a5',
        '210': 'a4',
    }
    for old, new in mapping.items():
        cr.execute(
            "UPDATE pos_invoice_settings SET default_paper_size = %s "
            "WHERE default_paper_size = %s",
            (new, old),
        )
    # 'custom' is unchanged; the new size_mm_* columns take their field defaults.
