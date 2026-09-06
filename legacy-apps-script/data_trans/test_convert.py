import copy
from datetime import datetime
import hashlib
from pathlib import Path
import unittest

from convert import SCHEMAS, convert, read_tables, timestamp


def fixture():
    tables = {key: [headers.copy()] for key, headers in SCHEMAS.items()}
    tables['Products'].append(['P1', '原味餅', '伴手禮', 50, '啟用', '2025-08-19 12:00:00', '', '是', 0, ''])
    tables['Customers'].append(['C1', '測試客戶', '0912-345-678', '', '2025-08-19 12:00:00', '2025-08-19 12:00:00'])
    tables['Orders'].append(['O1', '測試客戶', '0912-345-678', '', '外送', '2025-09-12', '已付清',
                             '2025-08-19 12:00:00', 100, 100, 0, '', 0, '', '', '', '', '否'])
    tables['OrderDetails'].append(['D1', 'O1', 'P1', '原味餅', 2, 50, 100, '否', '', 0, '否'])
    return tables


class ConversionTests(unittest.TestCase):
    def test_zero_and_types_are_preserved(self):
        data, report = convert(fixture())
        self.assertEqual(report['errors'], [])
        self.assertEqual(data['orders'][0]['remainingAmount'], 0)
        self.assertEqual(data['orders'][0]['items'][0]['originalPrice'], 0)
        self.assertEqual(data['products'][0]['specialPrice'], 0)
        self.assertEqual(data['customers'][0]['documentId'], '0912345678')
        self.assertTrue(data['orders'][0]['createTime'].endswith('+08:00'))

    def test_blank_balance_is_total_less_deposit(self):
        tables = fixture()
        tables['Orders'][1][9:11] = [30, None]
        data, report = convert(tables)
        self.assertEqual(data['orders'][0]['remainingAmount'], 70)
        self.assertEqual(report['warningCounts']['remaining_derived'], 1)

    def test_header_aliases_blank_tail_and_reordering(self):
        tables = fixture()
        tables['Orders'][0][3] = 'Address'
        tables['Orders'][0][4] = 'DeliverType'
        tables['Orders'][0][16] = 'ReceivedAddress'
        tables['Orders'][0][17] = None
        tables['Orders'][1][16] = '0987654321'
        for row in tables['Products']:
            row[0], row[1] = row[1], row[0]
        data, report = convert(tables)
        self.assertEqual(report['errors'], [])
        self.assertEqual(data['orders'][0]['recipientPhone'], '0987654321')
        self.assertEqual(data['products'][0]['productId'], 'P1')

    def test_line_placeholder_matches_application_customer_identity(self):
        tables = fixture()
        tables['Customers'][1][2] = 'LINE'
        second = copy.deepcopy(tables['Customers'][1])
        second[:2] = ['C2', '另一位客戶']
        tables['Customers'].append(second)
        data, report = convert(tables)
        self.assertEqual(report['errors'], [])
        self.assertEqual(len(data['customers']), 2)
        expected = 'line_' + hashlib.sha256('line:測試客戶'.encode()).hexdigest()[:32]
        self.assertEqual(data['customers'][0]['documentId'], expected)

    def test_malformed_giftbox_duplicate_and_orphan_fail(self):
        for kind in ['json', 'duplicate', 'orphan']:
            with self.subTest(kind=kind):
                tables = fixture()
                if kind == 'json':
                    tables['OrderDetails'][1][7:9] = ['是', '{bad']
                elif kind == 'duplicate':
                    tables['Orders'].append(tables['Orders'][1].copy())
                else:
                    tables['OrderDetails'][1][1] = 'missing'
                self.assertTrue(convert(tables)[1]['errors'])

    def test_numeric_phone_fails_instead_of_guessing_leading_zero(self):
        tables = fixture()
        tables['Customers'][1][2] = 912345678
        self.assertTrue(convert(tables)[1]['errors'])

    def test_unknown_nonempty_columns_are_not_dropped(self):
        tables = fixture()
        tables['Products'][0].append('Unknown')
        tables['Products'][1].append('keep me')
        with self.assertRaisesRegex(ValueError, '未映射'):
            convert(tables)

    def test_taipei_date_and_native_excel_datetime(self):
        self.assertEqual(timestamp(datetime(2025, 1, 1, 8)), '2025-01-01T08:00:00+08:00')

    def test_supplied_workbook_reconciles_without_modification(self):
        source = Path(__file__).resolve().parent.parent / 'database.xlsx'
        if not source.exists():
            self.skipTest('Optional local workbook is not present')
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        tables = read_tables(source)
        data, report = convert(tables)
        self.assertEqual(report['errors'], [])
        self.assertEqual(len(data['orders']), len(tables['Orders']) - 1)
        self.assertEqual(sum(len(o['items']) for o in data['orders']), len(tables['OrderDetails']) - 1)
        self.assertEqual(report['totals']['totalAmount'], sum(float(r[8]) for r in tables['Orders'][1:]))
        self.assertEqual(before, hashlib.sha256(source.read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main()
