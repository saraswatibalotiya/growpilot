import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def make_settings(**overrides) -> Settings:
    # Tests never read the real storage configuration: memory unless a test asks for something else.
    return Settings(environment="test", **{"storage_backend": "memory", **overrides})


@pytest.fixture
def client() -> TestClient:
    """The app with the five bundled mock profiles loaded."""
    return TestClient(create_app(make_settings(load_mock_data=True)))


@pytest.fixture
def empty_client() -> TestClient:
    return TestClient(create_app(make_settings(load_mock_data=False)))


API = "/api/v1"
BOUTIQUE = "prof_boutique_mumbai"
BEAUTY = "prof_beauty_creator"
FOOD = "prof_food_creator"
RESTAURANT = "prof_restaurant_bengaluru"
TRAVEL = "prof_travel_creator"
# The bundled demo data reads as current on this day.
DEMO_DAY = "2026-10-05"
