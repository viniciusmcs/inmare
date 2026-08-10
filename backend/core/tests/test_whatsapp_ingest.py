import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from core.models import AuditEvent, Property


pytestmark = pytest.mark.django_db


def payload(message_id="MSG-1", *, group_id="120363199678290294@g.us", marker=True):
    return {
        "accepted": True,
        "normalized": {
            "event": "messages.upsert",
            "remoteJid": group_id,
            "sender": "5511999999999@s.whatsapp.net",
            "messageId": message_id,
            "pushName": "Administrador da comunidade",
            "text": "PRÓXIMO MATERIAL" if marker else "Apartamento com telefone privado 55 11 99999-9999",
            "mediaType": "",
            "fileName": "",
        },
        "batch": {
            "id": f"{group_id}:1786200000000",
            "startMarkerDetected": marker,
            "messageCount": 1,
        },
    }


@override_settings(
    WHATSAPP_INGEST_TOKEN="test-token",
    WHATSAPP_INGEST_GROUP_ID="120363199678290294@g.us",
)
def test_ingest_requires_token_and_expected_group():
    client = APIClient()
    assert client.post("/api/v1/automation/whatsapp/properties/", payload(), format="json").status_code == 401
    response = client.post(
        "/api/v1/automation/whatsapp/properties/",
        payload(group_id="other@g.us"),
        format="json",
        HTTP_X_INMARE_INGEST_TOKEN="test-token",
    )
    assert response.status_code == 403
    assert Property.objects.count() == 0


@override_settings(
    WHATSAPP_INGEST_TOKEN="test-token",
    WHATSAPP_INGEST_GROUP_ID="120363199678290294@g.us",
)
def test_ingest_creates_private_draft_updates_and_deduplicates():
    client = APIClient()
    url = "/api/v1/automation/whatsapp/properties/"
    auth = {"HTTP_X_INMARE_INGEST_TOKEN": "test-token"}

    assert client.post(url, payload(), format="json", **auth).status_code == 201
    prop = Property.objects.get()
    assert prop.source == "whatsapp"
    assert prop.status == Property.Status.DRAFT
    assert prop.published is False

    update = payload("MSG-2", marker=False)
    assert client.post(url, update, format="json", **auth).status_code == 200
    prop.refresh_from_db()
    assert "telefone privado" in prop.internal_notes

    duplicate = client.post(url, update, format="json", **auth)
    assert duplicate.status_code == 200
    assert duplicate.data["duplicate"] is True
    assert Property.objects.count() == 1
    assert AuditEvent.objects.filter(action="property.whatsapp_message_received").count() == 2

    public = client.get("/api/v1/public/properties/")
    assert public.status_code == 200
    assert "telefone privado" not in str(public.data)


@override_settings(
    WHATSAPP_INGEST_TOKEN="test-token",
    WHATSAPP_INGEST_GROUP_ID="120363199678290294@g.us",
)
def test_ingest_ignores_rejected_flow_event():
    response = APIClient().post(
        "/api/v1/automation/whatsapp/properties/",
        {"accepted": False, "reason": "ignored_other_group"},
        format="json",
        HTTP_X_INMARE_INGEST_TOKEN="test-token",
    )
    assert response.status_code == 202
    assert Property.objects.count() == 0
