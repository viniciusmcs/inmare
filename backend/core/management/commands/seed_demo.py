import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from core.models import SiteSettings
from core.services import import_property_folder

class Command(BaseCommand):
    help = "Cria configuração inicial e importa o imóvel demonstrativo de forma idempotente."
    def handle(self, *args, **options):
        SiteSettings.objects.get_or_create(
            company_name="In Mare Negócios Imobiliários",
            defaults={"whatsapp": "5551999866089", "phone": "(51) 99986-6089"},
        )
        user, created = get_user_model().objects.get_or_create(username="admin", defaults={"is_staff": True, "is_superuser": True, "email": "admin@inmare.local"})
        user.is_staff = True
        user.is_superuser = True
        user.set_password("admin")
        user.save(update_fields=["is_staff", "is_superuser", "password"])
        if created:
            self.stdout.write(self.style.WARNING("Administrador local criado com senha temporária admin."))
        path = os.getenv("DEMO_PROPERTY_PATH")
        if path and os.path.isdir(path):
            job = import_property_folder(path)
            self.stdout.write(self.style.SUCCESS(f"Importação pronta para revisão: {job.property.title}"))
