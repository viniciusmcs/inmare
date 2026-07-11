from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0005_testimonial_photo")]

    operations = [
        migrations.AddField(
            model_name="property",
            name="launch",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
