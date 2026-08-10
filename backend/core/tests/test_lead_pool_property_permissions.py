import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent, Broker, CRMContact, CRMOpportunity, CRMTask, ListingOption, Property, person_name_search_key


def make_broker(username, *, can_manage_properties=False, role=Broker.Role.BROKER):
    user = get_user_model().objects.create_user(username, password="secret")
    broker = Broker.objects.create(
        name=username,
        user=user,
        role=role,
        can_manage_properties=can_manage_properties,
    )
    client = APIClient()
    client.force_authenticate(user)
    return broker, client


@pytest.mark.django_db
def test_name_search_normalizes_y_i_and_c_k_variants():
    assert person_name_search_key("Yuri") == person_name_search_key("Iury") == "iuri"
    assert person_name_search_key("Carlos") == person_name_search_key("Karlos") == "karlos"
    contact = CRMContact.objects.create(name="Yuri Almeida")
    assert contact.search_name == "iuri almeida"


@pytest.mark.django_db
def test_broker_searches_and_atomically_claims_an_available_contact():
    first, first_client = make_broker("primeiro")
    _, second_client = make_broker("segundo")
    contact = CRMContact.objects.create(name="Yuri da Costa", city="Xangri-Lá")
    CRMContact.objects.create(name="Maria Silva")

    available = first_client.get("/api/v1/admin/crm/contacts/available/?search=iury")
    assert available.status_code == 200
    assert [item["name"] for item in available.data["results"]] == ["Yuri da Costa"]
    assert "phone" not in available.data["results"][0]

    claimed = first_client.post(f"/api/v1/admin/crm/contacts/{contact.id}/claim/")
    assert claimed.status_code == 200
    contact.refresh_from_db()
    assert contact.assigned_broker == first
    opportunity = CRMOpportunity.objects.get(contact=contact)
    assert opportunity.broker == first
    assert opportunity.stage == CRMOpportunity.Stage.NEW

    conflict = second_client.post(f"/api/v1/admin/crm/contacts/{contact.id}/claim/")
    assert conflict.status_code == 400
    remaining_ids = {item["id"] for item in second_client.get("/api/v1/admin/crm/contacts/available/").data["results"]}
    assert str(contact.id) not in remaining_ids


@pytest.mark.django_db
def test_server_search_finds_small_typing_errors_and_paginates_contacts():
    admin = get_user_model().objects.create_superuser("admin-search", "admin-search@example.com", "secret")
    client = APIClient()
    client.force_authenticate(admin)
    CRMContact.objects.create(name="Beatriz Almeida", phone="51999990000")
    for index in range(35):
        CRMContact.objects.create(name=f"Contato {index:02d}")

    contacts = client.get("/api/v1/admin/crm/contacts/?search=biatriz")
    choices = client.get("/api/v1/admin/crm/contacts/choices/?search=biatriz")
    first_page = client.get("/api/v1/admin/crm/contacts/")

    assert contacts.status_code == choices.status_code == first_page.status_code == 200
    assert [item["name"] for item in contacts.data["results"]] == ["Beatriz Almeida"]
    assert [item["name"] for item in choices.data["results"]] == ["Beatriz Almeida"]
    assert first_page.data["count"] == 36
    assert len(first_page.data["results"]) == 30
    assert first_page.data["next"]


@pytest.mark.django_db
def test_admin_releases_accidental_claim_without_erasing_history():
    broker, broker_client = make_broker("teste")
    _, other_client = make_broker("teste2")
    admin = get_user_model().objects.create_superuser("admin-release", "admin-release@example.com", "secret")
    admin_client = APIClient()
    admin_client.force_authenticate(admin)
    contact = CRMContact.objects.create(name="Lead pego por engano", assigned_broker=broker)
    open_opportunity = CRMOpportunity.objects.create(contact=contact, broker=broker, title="Em andamento")
    closed_opportunity = CRMOpportunity.objects.create(
        contact=contact, broker=broker, title="Historico", stage=CRMOpportunity.Stage.WON,
    )
    pending_task = CRMTask.objects.create(
        contact=contact, broker=broker, title="Retornar", due_at=timezone.now(),
    )
    completed_task = CRMTask.objects.create(
        contact=contact, broker=broker, title="Concluida", due_at=timezone.now(),
        status=CRMTask.Status.COMPLETED,
    )

    assert broker_client.post(f"/api/v1/admin/crm/contacts/{contact.id}/release/").status_code == 403
    released = admin_client.post(f"/api/v1/admin/crm/contacts/{contact.id}/release/")
    assert released.status_code == 200

    contact.refresh_from_db()
    open_opportunity.refresh_from_db()
    closed_opportunity.refresh_from_db()
    pending_task.refresh_from_db()
    completed_task.refresh_from_db()
    assert contact.assigned_broker is None
    assert open_opportunity.broker is None
    assert pending_task.broker is None
    assert closed_opportunity.broker == broker
    assert completed_task.broker == broker
    assert broker_client.get("/api/v1/admin/crm/contacts/").data["count"] == 0
    assert str(contact.id) in {
        item["id"] for item in other_client.get("/api/v1/admin/crm/contacts/available/").data["results"]
    }
    assert AuditEvent.objects.filter(action="crm.contact.released", entity_id=str(contact.id)).exists()


@pytest.mark.django_db
def test_admin_can_release_legacy_contact_held_only_by_open_opportunity():
    broker, _ = make_broker("teste-legado")
    admin = get_user_model().objects.create_superuser("admin-legacy", "admin-legacy@example.com", "secret")
    client = APIClient()
    client.force_authenticate(admin)
    contact = CRMContact.objects.create(name="Lead legado sem responsavel")
    opportunity = CRMOpportunity.objects.create(contact=contact, broker=broker, title="Atendimento antigo")

    holders = client.get(f"/api/v1/admin/crm/contacts/{contact.id}/holders/")
    released = client.post(
        f"/api/v1/admin/crm/contacts/{contact.id}/release/",
        {"broker": str(broker.id)},
        format="json",
    )

    assert holders.status_code == 200
    assert holders.data == [{"id": str(broker.id), "name": broker.name, "username": "teste-legado"}]
    assert released.status_code == 200
    assert released.data["returned_to_pool"] is True
    opportunity.refresh_from_db()
    assert opportunity.broker is None


@pytest.mark.django_db
def test_broker_cannot_claim_duplicate_identity_already_in_own_wallet():
    broker, client = make_broker("teste-duplicado")
    original = CRMContact.objects.create(name="Beatriz Original", phone="(51) 99999-0000")
    CRMOpportunity.objects.create(contact=original, broker=broker, title="Atendimento existente")
    duplicate = CRMContact.objects.create(name="Biatriz Duplicada", phone="51 99999-0000")

    response = client.post(f"/api/v1/admin/crm/contacts/{duplicate.id}/claim/")

    assert response.status_code == 400
    duplicate.refresh_from_db()
    assert duplicate.assigned_broker is None


@pytest.mark.django_db
def test_property_permission_creates_only_own_drafts_and_keeps_publication_admin_only():
    broker, client = make_broker("captador", can_manage_properties=True)
    other, _ = make_broker("outro", can_manage_properties=True)
    ListingOption.objects.get_or_create(kind=ListingOption.Kind.PROPERTY_TYPE, key="casa", city_key="", defaults={"name": "Casa"})
    ListingOption.objects.get_or_create(kind=ListingOption.Kind.CITY, key="xangri la", city_key="", defaults={"name": "Xangri-Lá"})
    ListingOption.objects.get_or_create(kind=ListingOption.Kind.NEIGHBORHOOD, key="centro", city_key="xangri la", defaults={"name": "Centro", "city": "Xangri-Lá"})
    other_property = Property.objects.create(
        title="Imóvel alheio", slug="imovel-alheio", property_type="Casa",
        city="Xangri-Lá", neighborhood="Centro", broker=other,
    )

    session = client.get("/api/v1/admin/auth/me/")
    assert session.data["can_manage_properties"] is True
    assert client.get("/api/v1/admin/listing-options/").status_code == 200
    assert client.post("/api/v1/admin/listing-options/", {"kind": "city", "name": "Capão"}).status_code == 403
    assert client.get(f"/api/v1/admin/properties/{other_property.id}/").status_code == 404

    created = client.post("/api/v1/admin/properties/", {
        "title": "Casa do corretor",
        "public_description": "Imóvel para revisão.",
        "property_type": "Casa",
        "purpose": "sale",
        "status": "available",
        "published": True,
        "featured": True,
        "city": "Xangri-Lá",
        "neighborhood": "Centro",
    }, format="json")
    assert created.status_code == 201, created.data
    prop = Property.objects.get(pk=created.data["id"])
    assert prop.broker == broker
    assert prop.status == Property.Status.DRAFT
    assert prop.published is False
    assert prop.featured is False
    assert prop.source == "broker"
    assert client.post(f"/api/v1/admin/properties/{prop.id}/publish/").status_code == 403
    assert client.delete(f"/api/v1/admin/properties/{prop.id}/").status_code == 403


@pytest.mark.django_db
def test_broker_without_property_permission_remains_blocked():
    _, client = make_broker("sem-permissao")
    session = client.get("/api/v1/admin/auth/me/")
    assert session.data["can_manage_properties"] is False
    assert client.get("/api/v1/admin/properties/").status_code == 403
