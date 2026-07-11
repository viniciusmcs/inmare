from celery import shared_task
from django.core.mail import send_mail
from .models import Property
from .services import import_property_folder

@shared_task
def import_property_folder_task(path):
    return str(import_property_folder(path).id)

@shared_task
def send_review_digest():
    count = sum(p.review_color != "green" for p in Property.objects.all())
    if count: send_mail("Revisões comerciais pendentes", f"Existem {count} imóveis que precisam de revisão.", "no-reply@inmare.local", ["admin@inmare.local"])
    return count
