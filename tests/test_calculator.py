"""Tests for the calculator module."""


def test_add():
    from src.calculator import add
    assert add(2, 3) == 5
    assert add(-1, 1) == 0


def test_subtract():
    from src.calculator import subtract
    assert subtract(5, 3) == 2
    assert subtract(0, 5) == -5
