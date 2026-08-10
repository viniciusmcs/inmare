import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Property


pytestmark = pytest.mark.django_db


def make_property(index, **overrides):
    values = {
        "title": f"Imóvel {index}",
        "slug": f"imovel-{index}",
        "public_description": "Descrição de teste",
        "property_type": "Sobrado",
        "purpose": Property.Purpose.SALE,
        "status": Property.Status.DRAFT,
        "city": "Xangri-Lá",
        "neighborhood": "Centro",
        "source": "manual",
        "published": False,
    }
    values.update(overrides)
    return Property.objects.create(**values)


def test_pending_whatsapp_drafts_are_first_on_admin_first_page():
    user = get_user_model().objects.create_superuser(
        username="ordering-admin",
        email="ordering@example.com",
        password="Strong-test-password-2620",
    )
    client = APIClient()
    client.force_authenticate(user)

    older_pending = make_property(1, source="whatsapp")
    newer_pending = make_property(2, source="whatsapp")
    for index in range(3, 18):
        make_property(index)
    published_whatsapp = make_property(
        18,
        source="whatsapp",
        status=Property.Status.AVAILABLE,
        published=True,
    )

    response = client.get("/api/v1/admin/properties/")

    assert response.status_code == 200
    first_page_ids = [item["id"] for item in response.data["results"]]
    assert first_page_ids[:2] == [str(newer_pending.id), str(older_pending.id)]
    assert str(published_whatsapp.id) not in first_page_ids[:2]
