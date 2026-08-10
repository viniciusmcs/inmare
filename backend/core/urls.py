from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AdminAuditViewSet, AdminBrokerViewSet, AdminUserViewSet, AdminCRMActivityViewSet, AdminCRMContactViewSet, AdminCRMImportBatchViewSet, AdminCRMImportRowViewSet, AdminCRMOpportunityViewSet, AdminCRMProposalViewSet, AdminCRMPropertyLinkViewSet, AdminCRMTaskViewSet, AdminDevelopmentViewSet, AdminFrequentlyAskedQuestionViewSet, AdminHeroSlideViewSet, AdminImportViewSet, AdminInstitutionalImageViewSet, AdminLeadViewSet, AdminListingOptionViewSet, AdminPropertyViewSet, AdminSettingsViewSet, AdminTestimonialViewSet, CRMNotificationViewSet, CRMPropertyReferenceView, CRMReportView, CRMTeamReferenceView, CurrentUserView, DashboardView, LeadViewSet, LoginView, LogoutView, PublicContentView, PublicDevelopmentViewSet, PublicFilterOptionsView, PublicPropertyViewSet, PublicSettingsView, RefreshCookieView, WhatsAppPropertyIngestView

public = DefaultRouter()
public.register("properties", PublicPropertyViewSet, basename="public-properties")
public.register("developments", PublicDevelopmentViewSet, basename="public-developments")
public.register("leads", LeadViewSet, basename="public-leads")
admin = DefaultRouter()
admin.register("properties", AdminPropertyViewSet)
admin.register("listing-options", AdminListingOptionViewSet, basename="listing-options")
admin.register("developments", AdminDevelopmentViewSet)
admin.register("leads", AdminLeadViewSet)
admin.register("crm/contacts", AdminCRMContactViewSet, basename="crm-contacts")
admin.register("crm/property-links", AdminCRMPropertyLinkViewSet, basename="crm-property-links")
admin.register("crm/opportunities", AdminCRMOpportunityViewSet, basename="crm-opportunities")
admin.register("crm/tasks", AdminCRMTaskViewSet, basename="crm-tasks")
admin.register("crm/activities", AdminCRMActivityViewSet, basename="crm-activities")
admin.register("crm/proposals", AdminCRMProposalViewSet, basename="crm-proposals")
admin.register("crm/imports", AdminCRMImportBatchViewSet, basename="crm-imports")
admin.register("crm/import-rows", AdminCRMImportRowViewSet, basename="crm-import-rows")
admin.register("crm/notifications", CRMNotificationViewSet, basename="crm-notifications")
admin.register("brokers", AdminBrokerViewSet)
admin.register("users", AdminUserViewSet, basename="admin-users")
admin.register("content", AdminSettingsViewSet)
admin.register("hero-slides", AdminHeroSlideViewSet)
admin.register("institutional-images", AdminInstitutionalImageViewSet)
admin.register("testimonials", AdminTestimonialViewSet)
admin.register("faqs", AdminFrequentlyAskedQuestionViewSet)
admin.register("imports", AdminImportViewSet)
admin.register("audit", AdminAuditViewSet)
urlpatterns = [
    path("automation/whatsapp/properties/", WhatsAppPropertyIngestView.as_view()),
    path("public/settings/", PublicSettingsView.as_view()),
    path("public/content/", PublicContentView.as_view()),
    path("public/filter-options/", PublicFilterOptionsView.as_view()),
    path("public/", include(public.urls)),
    path("admin/auth/login/", LoginView.as_view()),
    path("admin/auth/logout/", LogoutView.as_view()),
    path("admin/auth/refresh/", RefreshCookieView.as_view()),
    path("admin/auth/me/", CurrentUserView.as_view()),
    path("admin/dashboard/", DashboardView.as_view()),
    path("admin/crm/reports/", CRMReportView.as_view()),
    path("admin/crm/reference-properties/", CRMPropertyReferenceView.as_view()),
    path("admin/crm/reference-team/", CRMTeamReferenceView.as_view()),
    path("admin/", include(admin.urls)),
]
