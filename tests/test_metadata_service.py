import json
import os
import requests
import pytest

BASE_URL = "http://localhost:8181/lookup"

# Paths to your data
COUNTRY_FILE = os.path.join("..", "frontend", "itasc", "data", "countryPrefixes.json")
AREA_FILE = os.path.join("..", "frontend", "itasc", "data", "usAreaCodes.json")


@pytest.fixture(scope="module")
def load_data():
    with open(COUNTRY_FILE, "r") as f:
        country_data = json.load(f)
    with open(AREA_FILE, "r") as f:
        area_data = json.load(f)
    return country_data, area_data


def test_valid_country_codes(load_data):
    country_data, _ = load_data
    # We'll just test one number per country code
    for code in list(country_data.keys())[:30]:  # limit to 30 for speed
        number = f"+{code}5551234567"
        response = requests.get(BASE_URL, params={"number": number})
        assert response.status_code == 200, f"{number} failed with {response.status_code}"
        data = response.json()
        assert "isValid" in data, f"No 'isValid' in response for {number}"


def test_valid_us_area_codes(load_data):
    _, area_data = load_data
    for area in list(area_data.keys())[:30]:  # limit to 30 for now
        number = f"+1{area}5551234"
        response = requests.get(BASE_URL, params={"number": number})
        assert response.status_code == 200, f"{number} failed with {response.status_code}"
        data = response.json()
        assert "isValid" in data, f"No 'isValid' in response for {number}"


def test_invalid_number():
    response = requests.get(BASE_URL, params={"number": "+1999"})
    assert response.status_code == 400 or not response.json().get("isValid", True)


def test_missing_param():
    response = requests.get(BASE_URL)
    assert response.status_code == 400
