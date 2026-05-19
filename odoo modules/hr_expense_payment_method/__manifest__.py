{
    'name': 'Expense Payment Method',
    'version': '19.0.1.0.0',
    'category': 'Human Resources/Expenses',
    'summary': 'Adds a Payment Method field to Expenses, configurable from Expenses > Configuration > Payment Methods.',
    'description': """
Expense Payment Method
======================
Adds a configurable Payment Method to the built-in HR Expense module.

* New model ``hr.expense.payment.method`` with name, journal (cash/bank),
  default flag and company scoping.
* Adds a required ``payment_method_id`` Many2one on ``hr.expense``.
* Adds ``Expenses > Configuration > Payment Methods`` menu (manager-only).

Display-only in this version - the chosen payment method is stored on the
expense and shown in the form/list, but does not yet drive journal entry or
payment posting.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['hr_expense', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'views/hr_expense_payment_method_views.xml',
        'views/hr_expense_views.xml',
        'views/hr_expense_menus.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
