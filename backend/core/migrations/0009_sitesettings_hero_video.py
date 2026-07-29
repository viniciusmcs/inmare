from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0008_listing_options")]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="hero_video",
            field=models.FileField(blank=True, upload_to="content/hero-video/%Y/%m/"),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="hero_poster",
            field=models.ImageField(blank=True, upload_to="content/hero-video/%Y/%m/"),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="hero_video_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
