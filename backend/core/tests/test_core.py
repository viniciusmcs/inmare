import tempfile
import zipfile
import base64
from datetime import timedelta
from pathlib import Path
import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from core.models import AuditEvent, FrequentlyAskedQuestion, HeroSlide, InstitutionalImage, Lead, Media, Property, SiteSettings, Testimonial as CustomerTestimonial
from core.services import extract_property_description, import_property_folder, validate_and_extract_zip

pytestmark = pytest.mark.django_db

def test_parser_extracts_without_inventing():
    result = extract_property_description("Casa\n03 dormitórios, 01 Suíte\nR$ 780.000,00\nBairro: Marina\nNão aceita imóveis")
    assert result["price"]["value"] == "780000.00"
    assert result["bedrooms"]["value"] == 3
    assert result["accepts_exchange"]["value"] is False
    assert "bathrooms" not in result

def test_parser_extracts_resort_listing_models():
    result = extract_property_description(
        "*CAPÃO ILHAS A10*\n*Sobrado MOBILIADO e DECORADO*\n"
        "✅ 04 suítes (01 térrea)\n✅ piscina de concreto\n✅ elevador\n"
        "✅ abrigo para dois carros\n✅ 295,78m2\n*R$4.200.000 + 4%*"
    )
    assert result["title"]["value"] == "Capão Ilhas A10"
    assert result["property_type"]["value"] == "Sobrado"
    assert result["suites"]["value"] == 4
    assert result["private_area"]["value"] == "295.78"
    assert result["price"]["value"] == "4200000.00"
    assert result["parking_spaces"]["value"] == 2
    assert result["private_commission"]["value"] == "4%"
    assert "piscina" in result["features"]["value"]

def test_private_fields_never_public():
    prop = Property.objects.create(title="Casa", slug="casa", city="X", neighborhood="Y", private_address="Segredo", private_commission="6%", internal_notes="Privado")
    client = APIClient()
    response = client.get("/api/v1/public/properties/")
    assert response.status_code == 200
    assert "Segredo" not in str(response.data)

def test_publish_requires_review_and_image():
    prop = Property.objects.create(title="Casa", slug="casa", city="X", neighborhood="Y", public_description="Boa", price=100, status=Property.Status.AVAILABLE)
    with pytest.raises(ValidationError): prop.publish()
    prop.reviewed_at = timezone.now(); prop.save()
    Media.objects.create(property=prop, kind="image", is_primary=True, sha256="a"*64, mime_type="image/jpeg", status="ready")
    prop.publish()
    assert prop.is_public

def test_import_is_idempotent():
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp) / "CASA"; root.mkdir()
        (root / "DESCRICAO.txt").write_text("03 dormitórios\nR$ 780.000,00\nXangri-Lá\nBairro: Marina", encoding="utf-8")
        first = import_property_folder(root); second = import_property_folder(root)
        assert first.id == second.id
        assert Property.objects.count() == 1

def test_zip_path_traversal_is_rejected():
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / "bad.zip"
        with zipfile.ZipFile(archive, "w") as output: output.writestr("../escape.txt", "bad")
        with pytest.raises(ValueError, match="Caminho inseguro"): validate_and_extract_zip(archive, Path(temp) / "out")

def test_admin_can_create_property_and_receives_absolute_media_url():
    admin = get_user_model().objects.create_superuser("admin-test", "admin@example.com", "secret")
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post("/api/v1/admin/properties/", {"title": "Nova Casa", "city": "Xangri-Lá", "neighborhood": "Centro", "property_type": "Casa", "purpose": "sale", "status": "draft"}, format="json")
    assert response.status_code == 201
    prop = Property.objects.get(title="Nova Casa")
    Media.objects.create(property=prop, kind="image", is_primary=True, sha256="b"*64, mime_type="image/jpeg", status="ready", file="media/test.jpg")
    detail = client.get(f"/api/v1/admin/properties/{prop.id}/")
    assert detail.data["media"][0]["url"].startswith("/media/")

def test_admin_can_create_property_with_empty_form_defaults():
    admin = get_user_model().objects.create_superuser("empty-form-admin", "empty@example.com", "secret")
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(
        "/api/v1/admin/properties/",
        {
            "title": "Casa Formulário",
            "city": "Xangri-Lá",
            "neighborhood": "Centro",
            "property_type": "Casa",
            "purpose": "",
            "status": "",
            "featured": "",
            "price_on_request": "",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["purpose"] == Property.Purpose.SALE
    assert response.data["status"] == Property.Status.DRAFT
    assert response.data["featured"] is False
    assert response.data["price_on_request"] is False

def test_admin_can_preview_txt_import():
    admin = get_user_model().objects.create_superuser("txt-admin", "txt@example.com", "secret")
    client = APIClient()
    client.force_authenticate(admin)
    upload = SimpleUploadedFile(
        "imovel.txt",
        "ZEN CONCEPT RESORT\n05 Suítes\n260 m2\nValor R$ 3.290.000,00\nXangri-lá".encode("utf-8"),
        content_type="text/plain",
    )
    response = client.post("/api/v1/admin/properties/txt-preview/", {"file": upload}, format="multipart")
    assert response.status_code == 200
    assert response.data["values"]["title"] == "Zen Concept Resort"
    assert response.data["values"]["suites"] == 5
    assert response.data["values"]["private_area"] == "260"
    assert response.data["values"]["price"] == "3290000.00"

def test_admin_can_upload_property_media():
    admin = get_user_model().objects.create_superuser("upload-admin", "upload@example.com", "secret")
    prop = Property.objects.create(title="Casa Upload", slug="casa-upload", city="X", neighborhood="Y")
    client = APIClient()
    client.force_authenticate(admin)
    upload = SimpleUploadedFile("foto.jpg", b"\xff\xd8\xff\xe0test-image", content_type="image/jpeg")
    response = client.post(f"/api/v1/admin/properties/{prop.id}/media/", {"file": upload}, format="multipart")
    assert response.status_code == 201
    assert response.data["kind"] == "image"
    assert response.data["url"].startswith("/media/")

def test_admin_rejects_image_with_invalid_signature():
    admin = get_user_model().objects.create_superuser("invalid-upload-admin", "invalid-upload@example.com", "secret")
    prop = Property.objects.create(title="Casa Upload Inválido", slug="casa-upload-invalido", city="X", neighborhood="Y")
    client = APIClient()
    client.force_authenticate(admin)
    upload = SimpleUploadedFile("foto.jpg", b"not-a-real-jpeg", content_type="image/jpeg")

    response = client.post(f"/api/v1/admin/properties/{prop.id}/media/", {"file": upload}, format="multipart")

    assert response.status_code == 400
    assert not prop.media.exists()

def test_admin_can_reorder_media_and_set_primary_image():
    admin = get_user_model().objects.create_superuser("media-admin", "media@example.com", "secret")
    prop = Property.objects.create(title="Casa Mídias", slug="casa-midias", city="X", neighborhood="Y")
    first = Media.objects.create(property=prop, kind="image", is_primary=True, position=0, sha256="d"*64, mime_type="image/jpeg", status="ready", file="media/first.jpg")
    video = Media.objects.create(property=prop, kind="video", position=1, sha256="e"*64, mime_type="video/mp4", status="ready", file="media/video.mp4")
    last = Media.objects.create(property=prop, kind="image", position=2, sha256="f"*64, mime_type="image/jpeg", status="ready", file="media/last.jpg")
    client = APIClient()
    client.force_authenticate(admin)

    reordered = client.post(
        f"/api/v1/admin/properties/{prop.id}/media-order/",
        {"media_ids": [str(first.id), str(last.id), str(video.id)]},
        format="json",
    )
    assert reordered.status_code == 200
    assert [item["id"] for item in reordered.data["media"]] == [str(first.id), str(last.id), str(video.id)]

    primary = client.post(f"/api/v1/admin/properties/{prop.id}/media/{last.id}/primary/")
    assert primary.status_code == 200
    assert next(item for item in primary.data["media"] if item["id"] == str(last.id))["is_primary"] is True

def test_admin_can_delete_media_and_next_image_becomes_primary():
    admin = get_user_model().objects.create_superuser("delete-media-admin", "delete-media@example.com", "secret")
    prop = Property.objects.create(title="Casa Exclusão", slug="casa-exclusao", city="X", neighborhood="Y")
    primary = Media.objects.create(property=prop, kind="image", is_primary=True, position=0, sha256="1"*64, mime_type="image/jpeg", status="ready")
    next_image = Media.objects.create(property=prop, kind="image", position=2, sha256="2"*64, mime_type="image/jpeg", status="ready")
    video = Media.objects.create(property=prop, kind="video", position=4, sha256="3"*64, mime_type="video/mp4", status="ready")
    client = APIClient()
    client.force_authenticate(admin)

    response = client.delete(f"/api/v1/admin/properties/{prop.id}/media/{primary.id}/")

    assert response.status_code == 200
    assert not Media.objects.filter(pk=primary.id).exists()
    next_image.refresh_from_db()
    video.refresh_from_db()
    assert next_image.is_primary is True
    assert [next_image.position, video.position] == [0, 1]
    assert [item["id"] for item in response.data["media"]] == [str(next_image.id), str(video.id)]

def test_admin_cannot_delete_media_from_another_property():
    admin = get_user_model().objects.create_superuser("scoped-media-admin", "scoped-media@example.com", "secret")
    prop = Property.objects.create(title="Casa A", slug="casa-a", city="X", neighborhood="Y")
    another = Property.objects.create(title="Casa B", slug="casa-b", city="X", neighborhood="Y")
    media = Media.objects.create(property=another, kind="image", is_primary=True, position=0, sha256="4"*64, mime_type="image/jpeg", status="ready")
    client = APIClient()
    client.force_authenticate(admin)

    response = client.delete(f"/api/v1/admin/properties/{prop.id}/media/{media.id}/")

    assert response.status_code == 404
    assert Media.objects.filter(pk=media.id).exists()

def test_admin_can_delete_property_and_its_media():
    admin = get_user_model().objects.create_superuser("delete-property-admin", "delete-property@example.com", "secret")
    prop = Property.objects.create(title="Casa para excluir", slug="casa-para-excluir", city="X", neighborhood="Y")
    media = Media.objects.create(property=prop, kind="image", is_primary=True, position=0, sha256="5"*64, mime_type="image/jpeg", status="ready")
    property_id = prop.id
    media_id = media.id
    client = APIClient()
    client.force_authenticate(admin)

    response = client.delete(f"/api/v1/admin/properties/{property_id}/")

    assert response.status_code == 204
    assert not Property.objects.filter(pk=property_id).exists()
    assert not Media.objects.filter(pk=media_id).exists()
    assert AuditEvent.objects.filter(action="property.deleted", entity_id=str(property_id)).exists()

def test_non_admin_cannot_delete_property():
    user = get_user_model().objects.create_user("regular-user", "regular@example.com", "secret")
    prop = Property.objects.create(title="Casa protegida", slug="casa-protegida", city="X", neighborhood="Y")
    client = APIClient()
    client.force_authenticate(user)

    response = client.delete(f"/api/v1/admin/properties/{prop.id}/")

    assert response.status_code == 403
    assert Property.objects.filter(pk=prop.id).exists()

def test_login_ignores_stale_access_cookie():
    get_user_model().objects.create_superuser("cookie-admin", "cookie@example.com", "admin")
    client = APIClient()
    client.cookies["access_token"] = "stale-invalid-token"
    response = client.post("/api/v1/admin/auth/login/", {"username": "cookie-admin", "password": "admin"}, format="json")
    assert response.status_code == 200
    assert "access_token" in response.cookies

def test_public_properties_ignore_stale_access_cookie():
    client = APIClient()
    client.cookies["access_token"] = "stale-invalid-token"
    response = client.get("/api/v1/public/properties/")
    assert response.status_code == 200

def test_cors_allows_admin_cookie_credentials(settings):
    settings.CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:5173"]
    client = APIClient(HTTP_ORIGIN="http://127.0.0.1:5173")
    response = client.options("/api/v1/admin/auth/login/", HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
    assert response.status_code == 200
    assert response["access-control-allow-credentials"] == "true"

def test_sitemap_lists_only_public_pages():
    Property.objects.create(title="Rascunho", slug="rascunho", city="X", neighborhood="Y")
    Property.objects.create(
        title="Casa Publica",
        slug="casa-publica",
        city="X",
        neighborhood="Y",
        public_description="Boa",
        status=Property.Status.AVAILABLE,
        published=True,
    )
    client = APIClient(HTTP_HOST="example.com")
    response = client.get("/sitemap.xml")
    body = response.content.decode()
    assert response.status_code == 200
    assert "https://example.com/imoveis/casa-publica" not in body
    assert "http://example.com/imoveis/casa-publica" in body
    assert "rascunho" not in body

def test_admin_can_validate_property_media():
    admin = get_user_model().objects.create_superuser("validator", "validator@example.com", "secret")
    prop = Property.objects.create(title="Casa", slug="casa-validar", city="X", neighborhood="Y")
    Media.objects.create(property=prop, kind="image", is_primary=True, sha256="c"*64, mime_type="image/jpeg", status="quarantine", file="media/test.jpg")
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(f"/api/v1/admin/properties/{prop.id}/validate-media/")
    assert response.status_code == 200
    assert response.data["validated"] == 1
    assert response.data["property"]["media"][0]["status"] == "ready"

def test_admin_property_commercial_actions():
    admin = get_user_model().objects.create_superuser("commercial", "commercial@example.com", "secret")
    prop = Property.objects.create(
        title="Casa Comercial",
        slug="casa-comercial",
        city="X",
        neighborhood="Y",
        public_description="Boa",
        price=100,
        status=Property.Status.AVAILABLE,
        published=True,
        reviewed_at=timezone.now(),
    )
    client = APIClient()
    client.force_authenticate(admin)

    featured = client.post(f"/api/v1/admin/properties/{prop.id}/toggle-featured/")
    assert featured.status_code == 200
    assert featured.data["featured"] is True

    launch = client.post(f"/api/v1/admin/properties/{prop.id}/toggle-launch/")
    assert launch.status_code == 200
    assert launch.data["launch"] is True
    assert launch.data["is_launch"] is True

    launch_removed = client.post(f"/api/v1/admin/properties/{prop.id}/toggle-launch/")
    assert launch_removed.status_code == 200
    assert launch_removed.data["launch"] is False

    in_service = client.post(f"/api/v1/admin/properties/{prop.id}/mark-in-service/")
    assert in_service.status_code == 200
    assert in_service.data["status"] == Property.Status.NEGOTIATING
    assert client.get("/api/v1/public/properties/").data["count"] == 1

    removed_service = client.post(f"/api/v1/admin/properties/{prop.id}/remove-in-service/")
    assert removed_service.status_code == 200
    assert removed_service.data["status"] == Property.Status.AVAILABLE

    client.post(f"/api/v1/admin/properties/{prop.id}/mark-in-service/")
    sold = client.post(f"/api/v1/admin/properties/{prop.id}/mark-sold/")
    assert sold.status_code == 200
    assert sold.data["status"] == Property.Status.SOLD
    assert sold.data["published"] is False
    assert sold.data["featured"] is False
    assert client.get("/api/v1/public/properties/").data["count"] == 0

    restored = client.post(f"/api/v1/admin/properties/{prop.id}/restore-sale/")
    assert restored.status_code == 200
    assert restored.data["status"] == Property.Status.AVAILABLE
    assert restored.data["published"] is True
    assert restored.data["featured"] is False
    assert client.get("/api/v1/public/properties/").data["count"] == 1

def test_public_property_exposes_created_at():
    prop = Property.objects.create(
        title="Casa Data",
        slug="casa-data",
        city="X",
        neighborhood="Y",
        status=Property.Status.AVAILABLE,
        published=True,
    )
    response = APIClient().get(f"/api/v1/public/properties/{prop.slug}/")
    assert response.status_code == 200
    assert response.data["created_at"]
    assert response.data["is_launch"] is True


def test_manual_launch_includes_old_property_in_launches():
    prop = Property.objects.create(
        title="Casa Antiga",
        slug="casa-antiga",
        city="X",
        neighborhood="Y",
        status=Property.Status.AVAILABLE,
        published=True,
        launch=True,
    )
    Property.objects.filter(pk=prop.pk).update(
        created_at=timezone.now() - timedelta(days=30)
    )

    response = APIClient().get("/api/v1/public/properties/?launches=true")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["is_launch"] is True

def test_lead_selects_property_and_normalizes_whatsapp():
    prop = Property.objects.create(
        title="Casa Lead",
        slug="casa-lead",
        city="X",
        neighborhood="Y",
        status=Property.Status.AVAILABLE,
        published=True,
    )
    response = APIClient().post(
        "/api/v1/public/leads/",
        {
            "name": "Cliente",
            "phone": "(51) 99999-9999",
            "email": "cliente@example.com",
            "message": "Tenho interesse.",
            "property_public_id": prop.public_id,
            "consent": True,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["phone"] == "5551999999999"
    assert response.data["property_title"] == "Casa Lead"

def test_admin_can_mark_lead_in_progress_and_delete_it():
    admin = get_user_model().objects.create_superuser(
        "lead-admin", "lead-admin@example.com", "secret"
    )
    lead = Lead.objects.create(
        name="Cliente",
        email="cliente@example.com",
        message="Tenho interesse.",
        consent=True,
    )
    client = APIClient()
    client.force_authenticate(admin)

    updated = client.patch(
        f"/api/v1/admin/leads/{lead.id}/",
        {"status": Lead.Status.IN_PROGRESS},
        format="json",
    )
    assert updated.status_code == 200
    assert updated.data["status"] == Lead.Status.IN_PROGRESS

    deleted = client.delete(f"/api/v1/admin/leads/{lead.id}/")
    assert deleted.status_code == 204
    assert not Lead.objects.filter(id=lead.id).exists()

def test_admin_can_archive_and_restore_property():
    admin = get_user_model().objects.create_superuser(
        "archive-admin", "archive-admin@example.com", "secret"
    )
    prop = Property.objects.create(
        title="Casa em reforma",
        slug="casa-em-reforma",
        city="X",
        neighborhood="Y",
        status=Property.Status.AVAILABLE,
        published=True,
        featured=True,
    )
    client = APIClient()
    client.force_authenticate(admin)

    archived = client.post(f"/api/v1/admin/properties/{prop.id}/archive/")
    assert archived.status_code == 200
    assert archived.data["status"] == Property.Status.ARCHIVED
    assert archived.data["published"] is False
    assert archived.data["featured"] is False
    assert APIClient().get("/api/v1/public/properties/").data["count"] == 0

    restored = client.post(f"/api/v1/admin/properties/{prop.id}/restore-archive/")
    assert restored.status_code == 200
    assert restored.data["status"] == Property.Status.AVAILABLE
    assert restored.data["published"] is True
    assert restored.data["archived_at"] is None
    assert APIClient().get("/api/v1/public/properties/").data["count"] == 1

def test_public_settings_expose_institutional_contact():
    SiteSettings.objects.create(
        company_name="In Mare",
        whatsapp="5551999999999",
        email="contato@inmare.example",
    )
    response = APIClient().get("/api/v1/public/settings/")
    assert response.status_code == 200
    assert response.data["whatsapp"] == "5551999999999"

def test_public_properties_paginate_twenty_and_filter_options_cover_catalog():
    for index in range(25):
        Property.objects.create(
            title=f"Casa {index}",
            slug=f"casa-{index}",
            city="Xangri-Lá",
            neighborhood="Centro",
            bedrooms=5 if index == 24 else 3,
            price=5000000 if index == 24 else 1000000,
            status=Property.Status.AVAILABLE,
            published=True,
        )
    client = APIClient()
    response = client.get("/api/v1/public/properties/")
    assert response.status_code == 200
    assert response.data["count"] == 25
    assert len(response.data["results"]) == 20
    favorite = client.get(f"/api/v1/public/properties/?public_id={Property.objects.first().public_id}")
    assert favorite.data["count"] == 1
    options = client.get("/api/v1/public/filter-options/")
    assert options.data["bedrooms"] == [3, 5]
    assert str(options.data["max_price"]) in {"5000000", "5000000.00"}

def test_public_content_only_exposes_active_items():
    HeroSlide.objects.create(title="Ativo", image_url="https://example.com/hero.jpg")
    HeroSlide.objects.create(title="Oculto", image_url="https://example.com/hidden.jpg", active=False)
    CustomerTestimonial.objects.create(name="Cliente", text="Excelente atendimento")
    FrequentlyAskedQuestion.objects.create(question="Como anunciar?", answer="Envie seus dados.")
    response = APIClient().get("/api/v1/public/content/")
    assert response.status_code == 200
    assert [item["title"] for item in response.data["hero_slides"]] == ["Ativo"]
    assert response.data["testimonials"][0]["name"] == "Cliente"
    assert response.data["faqs"][0]["question"] == "Como anunciar?"

def test_public_content_limits_header_to_twelve():
    for index in range(13):
        HeroSlide.objects.create(
            title=f"Slide {index}",
            image_url=f"https://example.com/hero-{index}.jpg",
            position=index,
        )
    response = APIClient().get("/api/v1/public/content/")
    assert response.status_code == 200
    assert len(response.data["hero_slides"]) == 12
    assert [item["title"] for item in response.data["hero_slides"]] == [f"Slide {index}" for index in range(12)]


def test_admin_cannot_create_thirteenth_active_header_slide():
    admin = get_user_model().objects.create_superuser("header-admin", "header@example.com", "secret")
    for index in range(12):
        HeroSlide.objects.create(title=f"Slide {index}", image_url=f"https://example.com/hero-{index}.jpg")
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(
        "/api/v1/admin/hero-slides/",
        {"title": "Slide excedente", "image_url": "https://example.com/excess.jpg", "active": True},
        format="json",
    )
    assert response.status_code == 400
    assert "máximo 12" in str(response.data["non_field_errors"][0])

def test_admin_can_upload_testimonial_photo_and_public_content_exposes_it():
    admin = get_user_model().objects.create_superuser("content-admin", "content@example.com", "secret")
    image = SimpleUploadedFile(
        "cliente.png",
        base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
        content_type="image/png",
    )
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(
        "/api/v1/admin/testimonials/",
        {"name": "Cliente com foto", "role": "Comprou com a In Mare", "text": "Excelente.", "photo": image},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.data["photo_src"]
    public = APIClient().get("/api/v1/public/content/")
    assert public.data["testimonials"][0]["photo_src"]

def test_admin_can_upload_header_image_and_public_content_exposes_it():
    admin = get_user_model().objects.create_superuser("header-admin", "header@example.com", "secret")
    image = SimpleUploadedFile(
        "header.png",
        base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
        content_type="image/png",
    )
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(
        "/api/v1/admin/hero-slides/",
        {"title": "Novo Header", "subtitle": "Texto", "image": image},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.data["image_src"]
    public = APIClient().get("/api/v1/public/content/")
    assert public.data["hero_slides"][0]["image_src"]

def test_admin_can_manage_institutional_images_and_public_only_exposes_active():
    admin = get_user_model().objects.create_superuser("institutional-admin", "institutional@example.com", "secret")
    client = APIClient(); client.force_authenticate(admin)
    image_data = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    created = client.post("/api/v1/admin/institutional-images/", {"section": "team", "title": "Equipe In Mare", "text": "Atendimento especializado", "image": SimpleUploadedFile("equipe.png", image_data, content_type="image/png")}, format="multipart")
    assert created.status_code == 201
    hidden = InstitutionalImage.objects.create(section="company", image=SimpleUploadedFile("empresa.png", image_data, content_type="image/png"), active=False)
    public = APIClient().get("/api/v1/public/content/")
    assert [item["title"] for item in public.data["institutional_images"]] == ["Equipe In Mare"]
    assert str(hidden.id) not in str(public.data)

def test_public_property_exposes_approximate_map_but_not_private_address():
    prop = Property.objects.create(
        title="Casa Mapa",
        slug="casa-mapa",
        city="X",
        neighborhood="Y",
        private_address="Rua secreta, 123",
        approximate_latitude="-29.000000",
        approximate_longitude="-50.000000",
        status=Property.Status.AVAILABLE,
        published=True,
    )
    response = APIClient().get(f"/api/v1/public/properties/{prop.slug}/")
    assert response.data["approximate_latitude"] == "-29.000000"
    assert "private_address" not in response.data
    assert "Rua secreta" not in str(response.data)

def test_public_properties_support_complete_filters_and_ordering():
    first = Property.objects.create(
        title="Casa ampla", slug="casa-ampla", city="X", neighborhood="Y",
        price=2000000, private_area=300, bathrooms=4, parking_spaces=3,
        bedrooms=5, features=["Piscina", "Lareira"], accepts_financing=True,
        status=Property.Status.AVAILABLE, published=True,
    )
    Property.objects.create(
        title="Casa compacta", slug="casa-compacta", city="X", neighborhood="Y",
        price=800000, private_area=120, bathrooms=2, parking_spaces=1,
        bedrooms=2, features=["Churrasqueira"],
        status=Property.Status.AVAILABLE, published=True,
    )
    client = APIClient()
    response = client.get("/api/v1/public/properties/?min_price=1000000&min_area=200&bathrooms=3&parking_spaces=2&feature=Piscina&accepts_financing=true")
    assert response.data["count"] == 1
    assert response.data["results"][0]["public_id"] == first.public_id
    ordered = client.get("/api/v1/public/properties/?ordering=-private_area")
    assert ordered.data["results"][0]["public_id"] == first.public_id
    options = client.get("/api/v1/public/filter-options/")
    assert "Piscina" in options.data["features"]
    assert options.data["bathrooms"] == [2, 4]

def test_visit_request_requires_future_date_and_records_preference():
    prop = Property.objects.create(
        title="Casa Visita", slug="casa-visita", city="X", neighborhood="Y",
        status=Property.Status.AVAILABLE, published=True,
    )
    client = APIClient()
    payload = {
        "name": "Cliente", "phone": "51999999999", "message": "Visita",
        "origin": "visit", "property_public_id": prop.public_id,
        "preferred_visit_period": "Tarde", "consent": True,
    }
    invalid = client.post("/api/v1/public/leads/", {**payload, "preferred_visit_date": timezone.localdate()}, format="json")
    assert invalid.status_code == 400
    future = timezone.localdate() + timedelta(days=2)
    created = client.post("/api/v1/public/leads/", {**payload, "preferred_visit_date": future}, format="json")
    assert created.status_code == 201
    assert created.data["preferred_visit_period"] == "Tarde"
    assert created.data["property_title"] == "Casa Visita"
