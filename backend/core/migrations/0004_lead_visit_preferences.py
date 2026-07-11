from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0003_visual_evolution")]

    operations = [
        migrations.AddField(
            model_name="lead",
            name="preferred_visit_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="lead",
            name="preferred_visit_period",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
