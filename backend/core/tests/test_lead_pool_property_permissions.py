import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Broker, CRMContact, CRMOpportunity, ListingOption, Property, person_name_search_key


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
