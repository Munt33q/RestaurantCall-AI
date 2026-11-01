from app.main import OrderItem, check_availability, quote_order


def test_quote_order_uses_cents_and_tax():
    quote = quote_order([OrderItem(item_id="burger", quantity=2), OrderItem(item_id="fries", quantity=1)])
    assert quote == {"subtotal_cents": 3097, "tax_cents": 255, "total_cents": 3352}


def test_unavailable_item_offers_same_category_alternative():
    result = check_availability("burger", 999)
    assert result["available"] is False
    assert isinstance(result["alternatives"], list)


def test_tax_rounding_floors_fractional_cents():
    # 499 cents at 8.25% is 41.1675 cents, so the policy returns 41 cents.
    quote = quote_order([OrderItem(item_id="fries", quantity=1)], tax_rate_bps=825)
    assert quote["tax_cents"] == 41  # 499 * .0825 = 41.1675


def test_zero_tax_rate():
    quote = quote_order([OrderItem(item_id="burger", quantity=1)], tax_rate_bps=0)
    assert quote == {"subtotal_cents": 1299, "tax_cents": 0, "total_cents": 1299}


def test_multiple_items_are_taxed_on_combined_subtotal():
    quote = quote_order([OrderItem(item_id="burger", quantity=1), OrderItem(item_id="fries", quantity=1)])
    assert quote == {"subtotal_cents": 1798, "tax_cents": 148, "total_cents": 1946}


def test_duplicate_quantities_match_repeated_lines():
    repeated = quote_order([OrderItem(item_id="fries", quantity=1), OrderItem(item_id="fries", quantity=1)])
    grouped = quote_order([OrderItem(item_id="fries", quantity=2)])
    assert repeated == grouped
