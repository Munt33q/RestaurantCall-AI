"""Regression coverage for process-local order validation (not DB concurrency)."""
import copy
import unittest

from app import main


class OrderAtomicityTests(unittest.TestCase):
    def setUp(self):
        self.menu = copy.deepcopy(main.MENU)
        self.orders = copy.deepcopy(main.ORDERS)
        main.ORDERS.clear()

    def tearDown(self):
        main.MENU[:] = self.menu
        main.ORDERS[:] = self.orders

    def assert_rejected_without_mutation(self, items):
        before = copy.deepcopy(main.MENU)
        with self.assertRaises(ValueError):
            main.place_order(main.OrderCreate(items=items))
        self.assertEqual(main.MENU, before)
        self.assertEqual(main.ORDERS, [])

    def test_later_unavailable_line_does_not_consume_first_item(self):
        main.MENU[1]["is_available"] = False
        self.assert_rejected_without_mutation([
            main.OrderItem(item_id=main.MENU[0]["id"], quantity=1),
            main.OrderItem(item_id=main.MENU[1]["id"], quantity=1),
        ])

    def test_duplicate_lines_cannot_exceed_combined_stock(self):
        main.MENU[0]["stock_qty"] = 3
        self.assert_rejected_without_mutation([
            main.OrderItem(item_id=main.MENU[0]["id"], quantity=2),
            main.OrderItem(item_id=main.MENU[0]["id"], quantity=2),
        ])

    def test_empty_basket_is_rejected(self):
        self.assert_rejected_without_mutation([])

    def test_unknown_item_does_not_consume_stock(self):
        self.assert_rejected_without_mutation([
            main.OrderItem(item_id=main.MENU[0]["id"], quantity=1),
            main.OrderItem(item_id="missing-item", quantity=1),
        ])

    def test_valid_duplicate_lines_decrement_exact_total(self):
        item = main.MENU[0]
        item["stock_qty"] = 3
        order = main.place_order(main.OrderCreate(items=[
            main.OrderItem(item_id=item["id"], quantity=1),
            main.OrderItem(item_id=item["id"], quantity=2),
        ]))
        self.assertEqual(item["stock_qty"], 0)
        self.assertEqual(order["subtotal_cents"], item["price_cents"] * 3)
        self.assertEqual(len(main.ORDERS), 1)

    def test_unlimited_stock_remains_unlimited(self):
        item = main.MENU[0]
        item["stock_qty"] = None
        main.place_order(main.OrderCreate(items=[
            main.OrderItem(item_id=item["id"], quantity=100),
        ]))
        self.assertIsNone(item["stock_qty"])


if __name__ == "__main__":
    unittest.main()
