import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from core.models import SiteSettings
from core.services import import_property_folder

class Command(BaseCommand):
    help = "Cria configuração inicial e importa o imóvel demonstrativo de forma idempotente."
    def handle(self, *args, **options):
        SiteSettings.objects.get_or_create(
            company_name="In Mare Negócios Imobiliários",
            defaults={"whatsapp": "5551999866089", "phone": "(51) 99986-6089"},
        )
        admin_username = os.getenv("DJANGO_SUPERUSER_USERNAME")
        admin_password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
        if admin_username or admin_password:
            if not admin_username or not admin_password:
                raise CommandError(
                    "DJANGO_SUPERUSER_USERNAME e DJANGO_SUPERUSER_PASSWORD devem ser definidos juntos."
                )
            user, created = get_user_model().objects.get_or_create(
                username=admin_username,
                defaults={"email": os.getenv("DJANGO_SUPERUSER_EMAIL", "")},
            )
            user.is_active = True
            user.is_staff = True
            user.is_superuser = True
            update_fields = ["is_active", "is_staff", "is_superuser"]
            reset_password = os.getenv("DJANGO_SUPERUSER_RESET_PASSWORD", "").lower() in {
                "1",
                "true",
                "yes",
            }
            if created or reset_password:
                user.set_password(admin_password)
                update_fields.append("password")
            user.save(update_fields=update_fields)
            if created:
                self.stdout.write(self.style.SUCCESS("Administrador configurado por variáveis de ambiente."))
        path = os.getenv("DEMO_PROPERTY_PATH")
        if path and os.path.isdir(path):
            job = import_property_folder(path)
            self.stdout.write(self.style.SUCCESS(f"Importação pronta para revisão: {job.property.title}"))
