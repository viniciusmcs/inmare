from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AdminAuditViewSet, AdminBrokerViewSet, AdminDevelopmentViewSet, AdminFrequentlyAskedQuestionViewSet, AdminHeroSlideViewSet, AdminImportViewSet, AdminInstitutionalImageViewSet, AdminLeadViewSet, AdminPropertyViewSet, AdminSettingsViewSet, AdminTestimonialViewSet, DashboardView, LeadViewSet, LoginView, LogoutView, PublicContentView, PublicDevelopmentViewSet, PublicFilterOptionsView, PublicPropertyViewSet, PublicSettingsView, RefreshCookieView

public = DefaultRouter()
public.register("properties", PublicPropertyViewSet, basename="public-properties")
public.register("developments", PublicDevelopmentViewSet, basename="public-developments")
public.register("leads", LeadViewSet, basename="public-leads")
admin = DefaultRouter()
admin.register("properties", AdminPropertyViewSet)
admin.register("developments", AdminDevelopmentViewSet)
admin.register("leads", AdminLeadViewSet)
admin.register("brokers", AdminBrokerViewSet)
admin.register("content", AdminSettingsViewSet)
admin.register("hero-slides", AdminHeroSlideViewSet)
admin.register("institutional-images", AdminInstitutionalImageViewSet)
admin.register("testimonials", AdminTestimonialViewSet)
admin.register("faqs", AdminFrequentlyAskedQuestionViewSet)
admin.register("imports", AdminImportViewSet)
admin.register("audit", AdminAuditViewSet)
urlpatterns = [
    path("public/settings/", PublicSettingsView.as_view()),
    path("public/content/", PublicContentView.as_view()),
    path("public/filter-options/", PublicFilterOptionsView.as_view()),
    path("public/", include(public.urls)),
    path("admin/auth/login/", LoginView.as_view()),
    path("admin/auth/logout/", LogoutView.as_view()),
    path("admin/auth/refresh/", RefreshCookieView.as_view()),
    path("admin/dashboard/", DashboardView.as_view()),
    path("admin/", include(admin.urls)),
]
