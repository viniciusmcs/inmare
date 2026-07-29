import re
import unicodedata
import uuid

from django.db import migrations, models


def option_key(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()


def seed_and_standardize(apps, schema_editor):
    ListingOption = apps.get_model("core", "ListingOption")
    Property = apps.get_model("core", "Property")

    city_mapping = {
        "Capao da Canoa": "Capão da Canoa",
        "Capao da canoa": "Capão da Canoa",
        "Capão da canoa": "Capão da Canoa",
        "Xangri lá": "Xangri-Lá",
        "Xangri-la": "Xangri-Lá",
        "Xangrila": "Xangri-Lá",
    }
    neighborhood_mapping = {
        "Condominio sunset": "Condomínio Sunset",
        "Condomínio sunset": "Condomínio Sunset",
        "Condominio zen": "Condomínio Zen Concept Resort",
        "Condomínio Zen Concept": "Condomínio Zen Concept Resort",
        "Condomínio Amare  - Atlântida": "Condomínio Amare",
        "Condomínio Capão ilhas Resort": "Condomínio Capão Ilhas Resort",
        "Noiva do mar": "Noiva do Mar",
        "SC - 407": "SC-407",
        "SC -407": "SC-407",
        "Santorini estrada do mar": "Santorini - Estrada do Mar",
        "Xangrila": "Xangri-Lá",
        "Zona norte": "Zona Norte",
        "Zona nova": "Zona Nova",
    }
    for old, new in city_mapping.items():
        Property.objects.filter(city=old).update(city=new)
    for old, new in neighborhood_mapping.items():
        Property.objects.filter(neighborhood=old).update(neighborhood=new)
    Property.objects.filter(property_type="Terrenos").update(property_type="Terreno")

    title_neighborhoods = (
        ("CONDOMÍNIO SUNSET", "Condomínio Sunset"),
        ("CONDOMÍNIO BLUE", "Condomínio Blue"),
        ("CONDOMÍNIO ZEN", "Condomínio Zen Concept Resort"),
        ("CONDOMÍNIO ENSEADA", "Condomínio Enseada Lagos de Xangri-Lá"),
        ("LOS COBOS", "Condomínio Los Cobos"),
        ("CONDOMÍNIO AMARE", "Condomínio Amare"),
    )
    for title_fragment, neighborhood in title_neighborhoods:
        Property.objects.filter(title__icontains=title_fragment).update(neighborhood=neighborhood)
    Property.objects.filter(
        title__icontains="ATLÂNTIDA",
        neighborhood__in=["Xangri-Lá", "Xangrila"],
    ).update(neighborhood="Atlântida")

    options = [
        ("property_type", "Apartamento", ""),
        ("property_type", "Casa", ""),
        ("property_type", "Sobrado", ""),
        ("property_type", "Terreno", ""),
        ("city", "Capão da Canoa", ""),
        ("city", "Xangri-Lá", ""),
        ("neighborhood", "Centro", "Capão da Canoa"),
        ("neighborhood", "Condomínio Capão Ilhas Resort", "Capão da Canoa"),
        ("neighborhood", "Estrada do Mar", "Capão da Canoa"),
        ("neighborhood", "Navegantes", "Capão da Canoa"),
        ("neighborhood", "SC-407", "Capão da Canoa"),
        ("neighborhood", "Zona Norte", "Capão da Canoa"),
        ("neighborhood", "Zona Nova", "Capão da Canoa"),
        ("neighborhood", "Atlântida", "Xangri-Lá"),
        ("neighborhood", "Centro", "Xangri-Lá"),
        ("neighborhood", "Condomínio Amare", "Xangri-Lá"),
        ("neighborhood", "Condomínio Blue", "Xangri-Lá"),
        ("neighborhood", "Condomínio Enseada Lagos de Xangri-Lá", "Xangri-Lá"),
        ("neighborhood", "Condomínio Los Cobos", "Xangri-Lá"),
        ("neighborhood", "Condomínio Sunset", "Xangri-Lá"),
        ("neighborhood", "Condomínio Zen Concept Resort", "Xangri-Lá"),
        ("neighborhood", "Noiva do Mar", "Xangri-Lá"),
        ("neighborhood", "Remanso", "Xangri-Lá"),
        ("neighborhood", "Santorini - Estrada do Mar", "Xangri-Lá"),
        ("neighborhood", "Xangri-Lá", "Xangri-Lá"),
    ]
    for kind, name, city in options:
        ListingOption.objects.get_or_create(
            kind=kind,
            key=option_key(name),
            city_key=option_key(city),
            defaults={"name": name, "city": city, "active": True},
        )


def reverse_seed(apps, schema_editor):
    apps.get_model("core", "ListingOption").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0007_institutional_content")]

    operations = [
        migrations.CreateModel(
            name="ListingOption",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("kind", models.CharField(choices=[("property_type", "Tipo de imóvel"), ("city", "Cidade"), ("neighborhood", "Bairro")], db_index=True, max_length=30)),
                ("name", models.CharField(max_length=120)),
                ("key", models.CharField(editable=False, max_length=120)),
                ("city", models.CharField(blank=True, max_length=120)),
                ("city_key", models.CharField(blank=True, editable=False, max_length=120)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["kind", "city", "name"]},
        ),
        migrations.AddConstraint(
            model_name="listingoption",
            constraint=models.UniqueConstraint(
                fields=("kind", "key", "city_key"),
                name="unique_listing_option",
            ),
        ),
        migrations.RunPython(seed_and_standardize, reverse_seed),
    ]
