import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def admin_user(db):
    return get_user_model().objects.create_superuser(
        username="principal", password="SenhaSegura123!", first_name="Marina", email="marina@example.com"
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    return client


def test_current_user_includes_display_name(admin_client):
    response = admin_client.get("/api/v1/admin/auth/me/")
    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response.data["display_name"] == "Marina"
    assert response.data["email"] == "marina@example.com"


def test_admin_can_create_another_admin(admin_client):
    response = admin_client.post("/api/v1/admin/users/", {
        "username": "novo.admin",
        "first_name": "Novo",
        "last_name": "Administrador",
        "email": "novo@example.com",
        "password": "Temporaria123!",
        "is_active": True,
    }, format="json")
    assert response.status_code == 201
    created = get_user_model().objects.get(username="novo.admin")
    assert created.is_staff is True
    assert created.is_superuser is False
    assert created.check_password("Temporaria123!")
    assert "password" not in response.data


def test_admin_cannot_disable_own_access(admin_client, admin_user):
    response = admin_client.patch(f"/api/v1/admin/users/{admin_user.pk}/", {"is_active": False}, format="json")
    assert response.status_code == 400
    admin_user.refresh_from_db()
    assert admin_user.is_active is True


@pytest.mark.parametrize(("export_format", "content_type", "signature"), [
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b"PK"),
    ("pdf", "application/pdf", b"%PDF"),
])
def test_crm_report_exports(admin_client, export_format, content_type, signature):
    response = admin_client.get(f"/api/v1/admin/crm/reports/?export={export_format}")
    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response["Content-Type"] == content_type
    assert response.content.startswith(signature)
    assert "attachment" in response["Content-Disposition"]
