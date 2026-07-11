from django.contrib import admin
from .models import AuditEvent, Broker, Development, FrequentlyAskedQuestion, HeroSlide, ImportJob, InstitutionalImage, Lead, Media, Property, SiteSettings, Testimonial
admin.site.register([Property, Media, Development, Broker, Lead, ImportJob, AuditEvent, SiteSettings, HeroSlide, InstitutionalImage, Testimonial, FrequentlyAskedQuestion])
