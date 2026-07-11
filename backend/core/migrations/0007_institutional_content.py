import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0006_property_launch")]

    operations = [
        migrations.AddField(model_name="sitesettings", name="about_title", field=models.CharField(default="Sobre a In Mare", max_length=200)),
        migrations.AddField(model_name="sitesettings", name="about_text", field=models.TextField(blank=True, default="Nascemos com o propósito de transformar o mercado imobiliário através de confiança, tranquilidade e experiências memoráveis.")),
        migrations.AddField(model_name="sitesettings", name="team_title", field=models.CharField(default="Nossa Equipe", max_length=200)),
        migrations.AddField(model_name="sitesettings", name="team_text", field=models.TextField(blank=True, default="Profissionais preparados para entender seus objetivos e cuidar de cada detalhe da sua jornada imobiliária.")),
        migrations.CreateModel(
            name="InstitutionalImage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("section", models.CharField(choices=[("company", "A Imobiliária"), ("team", "Nossa Equipe")], db_index=True, max_length=20)),
                ("title", models.CharField(blank=True, max_length=160)),
                ("text", models.CharField(blank=True, max_length=280)),
                ("image", models.ImageField(upload_to="content/institutional/%Y/%m/")),
                ("position", models.PositiveIntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["position", "created_at"]},
        ),
    ]
