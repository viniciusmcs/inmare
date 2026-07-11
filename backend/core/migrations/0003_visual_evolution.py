import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_alter_media_options")]

    operations = [
        migrations.AddField(model_name="property", name="condominium_fee", field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="property", name="iptu", field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="property", name="exclusive", field=models.BooleanField(db_index=True, default=False)),
        migrations.AddField(model_name="sitesettings", name="facebook", field=models.URLField(blank=True)),
        migrations.AddField(model_name="sitesettings", name="linkedin", field=models.URLField(blank=True)),
        migrations.AddField(model_name="sitesettings", name="youtube", field=models.URLField(blank=True)),
        migrations.AddField(model_name="sitesettings", name="tiktok", field=models.URLField(blank=True)),
        migrations.CreateModel(
            name="HeroSlide",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=200)),
                ("subtitle", models.CharField(blank=True, max_length=280)),
                ("image_url", models.URLField(blank=True)),
                ("image", models.ImageField(blank=True, upload_to="content/heroes/%Y/%m/")),
                ("link_url", models.CharField(blank=True, max_length=240)),
                ("link_label", models.CharField(blank=True, max_length=80)),
                ("position", models.PositiveIntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["position", "created_at"]},
        ),
        migrations.CreateModel(
            name="Testimonial",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=160)),
                ("role", models.CharField(blank=True, max_length=160)),
                ("text", models.TextField()),
                ("position", models.PositiveIntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["position", "created_at"]},
        ),
        migrations.CreateModel(
            name="FrequentlyAskedQuestion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("question", models.CharField(max_length=240)),
                ("answer", models.TextField()),
                ("position", models.PositiveIntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["position", "created_at"]},
        ),
    ]
