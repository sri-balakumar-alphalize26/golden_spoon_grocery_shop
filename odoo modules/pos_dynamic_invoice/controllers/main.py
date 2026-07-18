from odoo import http
from odoo.http import request, content_disposition


class PosInvoiceUserManual(http.Controller):
    """Serve the POS Dynamic Invoice user manual as a PDF, for the in-app viewer.

    /pos_dynamic_invoice/user_manual        -> inline (rendered in the iframe viewer)
    /pos_dynamic_invoice/user_manual?download=1 -> forced download
    """

    @http.route('/pos_dynamic_invoice/user_manual', type='http', auth='user')
    def user_manual(self, download=None, **kw):
        company = request.env.company
        pdf_content, _ = request.env['ir.actions.report'].sudo()._render_qweb_pdf(
            'pos_dynamic_invoice.action_report_user_manual', res_ids=company.ids)
        filename = 'POS_Dynamic_Invoice_User_Manual.pdf'
        headers = [
            ('Content-Type', 'application/pdf'),
            ('Content-Length', len(pdf_content)),
        ]
        if download:
            headers.append(('Content-Disposition', content_disposition(filename)))
        else:
            headers.append(('Content-Disposition', 'inline; filename="%s"' % filename))
        return request.make_response(pdf_content, headers=headers)
