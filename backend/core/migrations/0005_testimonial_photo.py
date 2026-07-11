from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0004_lead_visit_preferences")]

    operations = [
        migrations.AddField(
            model_name="testimonial",
            name="photo",
            field=models.ImageField(blank=True, upload_to="content/testimonials/%Y/%m/"),
        ),
    ]
