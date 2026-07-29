from django.contrib import admin
from .models import AuditEvent, Broker, Development, FrequentlyAskedQuestion, HeroSlide, ImportJob, InstitutionalImage, Lead, ListingOption, Media, Property, SiteSettings, Testimonial
admin.site.register([Property, ListingOption, Media, Development, Broker, Lead, ImportJob, AuditEvent, SiteSettings, HeroSlide, InstitutionalImage, Testimonial, FrequentlyAskedQuestion])
