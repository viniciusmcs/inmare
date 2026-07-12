import os
import tempfile
import hashlib
import mimetypes
from xml.sax.saxutils import escape
from django.conf import settings as django_settings
from django.db import connection, transaction
from django.db.models import Max, Min, Q
from django.http import HttpResponse
from datetime import timedelta
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import AuditEvent, Broker, Development, FrequentlyAskedQuestion, HeroSlide, ImportJob, InstitutionalImage, Lead, Media, Property, SiteSettings, Testimonial
from .serializers import AdminLeadSerializer, AuditSerializer, AdminPropertySerializer, BrokerSerializer, DevelopmentSerializer, FrequentlyAskedQuestionSerializer, HeroSlideSerializer, ImportJobSerializer, InstitutionalImageSerializer, LeadSerializer, PublicPropertySerializer, SiteSettingsSerializer, TestimonialSerializer
from .services import extract_property_description, import_property_folder, import_property_zip

class LeadThrottle(AnonRateThrottle): scope = "lead"
class LoginThrottle(AnonRateThrottle): scope = "login"
class PublicPropertyPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 20

class HealthView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        try:
            with connection.cursor() as cursor: cursor.execute("SELECT 1")
            return Response({"status": "ok", "database": "ok"})
        except Exception:
            return Response({"status": "error", "database": "error"}, status=503)

def absolute_public_url(request, path):
    configured = os.getenv("SITE_URL", "").rstrip("/")
    base = configured or request.build_absolute_uri("/").rstrip("/")
    return f"{base}{path}"

def robots_txt(request):
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin/",
        "Disallow: /django-admin/",
        "Disallow: /api/v1/admin/",
        f"Sitemap: {absolute_public_url(request, '/sitemap.xml')}",
        "",
    ]
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")

def sitemap_xml(request):
    static_paths = ["/", "/imoveis", "/imobiliaria", "/empreendimentos", "/encontrar-imovel", "/anuncie-seu-imovel", "/contato"]
    urls = [(path, timezone.now(), "weekly", "0.8") for path in static_paths]
    properties = Property.objects.filter(
        published=True,
        hidden=False,
        archived_at__isnull=True,
        status__in=[Property.Status.AVAILABLE, Property.Status.RESERVED, Property.Status.NEGOTIATING],
    ).only("slug", "updated_at")
    developments = Development.objects.filter(published=True, hidden=False).only("slug", "updated_at")
    urls += [(f"/imoveis/{item.slug}", item.updated_at, "daily", "0.9") for item in properties]
    urls += [(f"/empreendimentos/{item.slug}", item.updated_at, "weekly", "0.7") for item in developments]
    body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, updated_at, changefreq, priority in urls:
        body.extend([
            "  <url>",
            f"    <loc>{escape(absolute_public_url(request, path))}</loc>",
            f"    <lastmod>{updated_at.date().isoformat()}</lastmod>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ])
    body.append("</urlset>")
    return HttpResponse("\n".join(body), content_type="application/xml; charset=utf-8")

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [] if django_settings.DEBUG else [LoginThrottle]
    def post(self, request):
        from django.contrib.auth import authenticate
        user = authenticate(username=request.data.get("username"), password=request.data.get("password"))
        if not user or not user.is_staff: return Response({"detail": "Credenciais inválidas."}, status=401)
        refresh = RefreshToken.for_user(user)
        response = Response({"user": {"username": user.username}})
        response.set_cookie("access_token", str(refresh.access_token), httponly=True, secure=not django_settings.DEBUG, samesite="Lax")
        response.set_cookie("refresh_token", str(refresh), httponly=True, secure=not django_settings.DEBUG, samesite="Lax")
        AuditEvent.objects.create(actor=user, action="auth.login", entity_type="User", entity_id=str(user.id))
        return response

class LogoutView(APIView):
    def post(self, request):
        raw_refresh = request.COOKIES.get("refresh_token")
        if raw_refresh:
            try: RefreshToken(raw_refresh).blacklist()
            except Exception: pass
        response = Response(status=204)
        response.delete_cookie("access_token"); response.delete_cookie("refresh_token")
        AuditEvent.objects.create(actor=request.user, action="auth.logout", entity_type="User", entity_id=str(request.user.id))
        return response

class RefreshCookieView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    def post(self, request):
        raw_refresh = request.COOKIES.get("refresh_token")
        if not raw_refresh: return Response({"detail": "Refresh token ausente."}, status=401)
        try:
            refresh = RefreshToken(raw_refresh)
            response = Response({"detail": "Token renovado."})
            response.set_cookie("access_token", str(refresh.access_token), httponly=True, secure=not django_settings.DEBUG, samesite="Lax")
            return response
        except Exception:
            return Response({"detail": "Refresh token inválido."}, status=401)

class PublicPropertyViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = PublicPropertySerializer
    lookup_field = "slug"
    pagination_class = PublicPropertyPagination
    filterset_fields = ("public_id", "property_type", "purpose", "city", "neighborhood", "bedrooms", "suites", "featured", "launch", "exclusive")
    search_fields = ("title", "public_description", "city", "neighborhood")
    ordering_fields = ("price", "created_at", "title", "private_area", "bedrooms", "suites", "featured")
    def get_queryset(self):
        queryset = Property.objects.filter(
            published=True,
            hidden=False,
            archived_at__isnull=True,
            status__in=[
                Property.Status.AVAILABLE,
                Property.Status.RESERVED,
                Property.Status.NEGOTIATING,
            ],
        ).prefetch_related("media").order_by("-featured", "-created_at")
        if self.request.query_params.get("launches") == "true":
            queryset = queryset.filter(
                Q(launch=True) | Q(created_at__gte=timezone.now() - timedelta(days=7))
            ).order_by("-launch", "-created_at")
        max_price = self.request.query_params.get("max_price")
        min_price = self.request.query_params.get("min_price")
        min_area = self.request.query_params.get("min_area")
        max_area = self.request.query_params.get("max_area")
        bathrooms = self.request.query_params.get("bathrooms")
        parking_spaces = self.request.query_params.get("parking_spaces")
        features = self.request.query_params.getlist("feature")
        if max_price:
            queryset = queryset.filter(price__lte=max_price)
        if min_price:
            queryset = queryset.filter(price__gte=min_price)
        if min_area:
            queryset = queryset.filter(private_area__gte=min_area)
        if max_area:
            queryset = queryset.filter(private_area__lte=max_area)
        if bathrooms:
            queryset = queryset.filter(bathrooms__gte=bathrooms)
        if parking_spaces:
            queryset = queryset.filter(parking_spaces__gte=parking_spaces)
        if self.request.query_params.get("has_video") == "true":
            queryset = queryset.filter(media__kind=Media.Kind.VIDEO, media__status=Media.Status.READY)
        for feature in features:
            queryset = queryset.filter(features__icontains=feature)
        if self.request.query_params.get("accepts_financing") == "true":
            queryset = queryset.filter(accepts_financing=True)
        if self.request.query_params.get("accepts_exchange") == "true":
            queryset = queryset.filter(accepts_exchange=True)
        return queryset.distinct()

class PublicDevelopmentViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = DevelopmentSerializer
    lookup_field = "slug"
    def get_queryset(self): return Development.objects.filter(published=True, hidden=False).prefetch_related("media")

class PublicSettingsView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    def get(self, request):
        settings = SiteSettings.objects.first()
        return Response(SiteSettingsSerializer(settings).data if settings else {})

class PublicContentView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    def get(self, request):
        return Response({
            "hero_slides": HeroSlideSerializer(HeroSlide.objects.filter(active=True), many=True).data,
            "testimonials": TestimonialSerializer(Testimonial.objects.filter(active=True), many=True).data,
            "faqs": FrequentlyAskedQuestionSerializer(FrequentlyAskedQuestion.objects.filter(active=True), many=True).data,
            "institutional_images": InstitutionalImageSerializer(InstitutionalImage.objects.filter(active=True), many=True).data,
        })

class PublicFilterOptionsView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    def get(self, request):
        queryset = Property.objects.filter(
            published=True, hidden=False, archived_at__isnull=True,
            status__in=[Property.Status.AVAILABLE, Property.Status.RESERVED, Property.Status.NEGOTIATING],
        )
        def values(field, text=False):
            result = queryset.exclude(**{f"{field}__isnull": True})
            if text:
                result = result.exclude(**{field: ""})
            return list(result.values_list(field, flat=True).distinct().order_by(field))
        return Response({
            "property_types": values("property_type", True),
            "cities": values("city", True),
            "neighborhoods": values("neighborhood", True),
            "bedrooms": values("bedrooms"),
            "suites": values("suites"),
            "bathrooms": values("bathrooms"),
            "parking_spaces": values("parking_spaces"),
            "features": sorted({feature for items in queryset.values_list("features", flat=True) for feature in (items or [])}),
            "min_price": queryset.aggregate(value=Min("price"))["value"] or 0,
            "max_price": queryset.aggregate(value=Max("price"))["value"] or 0,
            "max_area": queryset.aggregate(value=Max("private_area"))["value"] or 0,
        })

class LeadViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LeadThrottle]
    serializer_class = LeadSerializer
    queryset = Lead.objects.all()

class AdminPropertyViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = AdminPropertySerializer
    queryset = Property.objects.all().select_related("broker").prefetch_related("media")
    filterset_fields = ("status", "published", "hidden", "featured", "launch", "city")
    search_fields = ("title", "public_id", "city", "neighborhood")
    def perform_create(self, serializer):
        prop = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action="property.created", entity_type="Property", entity_id=str(prop.id))
    def perform_update(self, serializer):
        prop = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action="property.updated", entity_type="Property", entity_id=str(prop.id))
    @action(detail=False, methods=["post"], url_path="txt-preview")
    def txt_preview(self, request):
        upload = request.FILES.get("file")
        if not upload: raise ValidationError({"file": "Selecione um arquivo TXT."})
        if not upload.name.lower().endswith(".txt"): raise ValidationError({"file": "Envie um arquivo TXT."})
        if upload.size > 2 * 1024 * 1024: raise ValidationError({"file": "O TXT excede 2 MB."})
        raw = upload.read()
        try: text = raw.decode("utf-8")
        except UnicodeDecodeError: text = raw.decode("cp1252", errors="replace")
        suggestions = extract_property_description(text)
        values = {field: suggestion["value"] for field, suggestion in suggestions.items()}
        return Response({"values": values, "suggestions": suggestions})
    @action(detail=True, methods=["post"], url_path="media")
    def upload_media(self, request, pk=None):
        prop = self.get_object()
        upload = request.FILES.get("file")
        if not upload: raise ValidationError({"file": "Selecione um arquivo."})
        extension = os.path.splitext(upload.name)[1].lower()
        kinds = {".jpg": Media.Kind.IMAGE, ".jpeg": Media.Kind.IMAGE, ".png": Media.Kind.IMAGE, ".webp": Media.Kind.IMAGE, ".mp4": Media.Kind.VIDEO, ".pdf": Media.Kind.DOCUMENT}
        if extension not in kinds: raise ValidationError({"file": "Formato não permitido."})
        if upload.size > 300 * 1024 * 1024: raise ValidationError({"file": "Arquivo excede 300 MB."})
        digest = hashlib.sha256()
        for chunk in upload.chunks(): digest.update(chunk)
        upload.seek(0)
        if prop.media.filter(sha256=digest.hexdigest()).exists(): raise ValidationError({"file": "Arquivo duplicado."})
        kind = kinds[extension]
        primary = kind == Media.Kind.IMAGE and not prop.media.filter(kind=Media.Kind.IMAGE, is_primary=True).exists()
        media = Media.objects.create(property=prop, kind=kind, file=upload, is_primary=primary, sha256=digest.hexdigest(), mime_type=upload.content_type or mimetypes.guess_type(upload.name)[0] or "application/octet-stream", size=upload.size, status=Media.Status.READY, position=prop.media.count())
        AuditEvent.objects.create(actor=request.user, action="property.media_uploaded", entity_type="Property", entity_id=str(prop.id), metadata={"kind": kind})
        from .serializers import MediaSerializer
        return Response(MediaSerializer(media, context={"request": request}).data, status=status.HTTP_201_CREATED)
    @action(detail=True, methods=["post"], url_path="media/(?P<media_id>[^/.]+)/primary")
    def set_primary_media(self, request, pk=None, media_id=None):
        prop = self.get_object()
        media = prop.media.get(pk=media_id, kind=Media.Kind.IMAGE)
        with transaction.atomic():
            prop.media.filter(kind=Media.Kind.IMAGE, is_primary=True).update(is_primary=False)
            media.is_primary = True; media.save(update_fields=["is_primary", "updated_at"])
        prop._prefetched_objects_cache = {}
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="media-order")
    def media_order(self, request, pk=None):
        prop = self.get_object()
        ordered_ids = request.data.get("media_ids")
        if not isinstance(ordered_ids, list):
            raise ValidationError({"media_ids": "Informe a ordem das mídias."})
        current_ids = {str(media_id) for media_id in prop.media.values_list("id", flat=True)}
        if set(map(str, ordered_ids)) != current_ids:
            raise ValidationError({"media_ids": "A lista deve conter todas as mídias do imóvel."})
        with transaction.atomic():
            for position, media_id in enumerate(ordered_ids):
                prop.media.filter(pk=media_id).update(position=position)
        prop._prefetched_objects_cache = {}
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="validate-media")
    def validate_media(self, request, pk=None):
        prop = self.get_object()
        validated = 0
        rejected = 0
        for media in prop.media.all():
            valid = bool(media.file or media.external_url) and media.kind in {
                Media.Kind.IMAGE, Media.Kind.VIDEO, Media.Kind.DOCUMENT
            }
            media.status = Media.Status.READY if valid else Media.Status.REJECTED
            media.save(update_fields=["status", "updated_at"])
            validated += int(valid)
            rejected += int(not valid)
        AuditEvent.objects.create(
            actor=request.user,
            action="property.media_validated",
            entity_type="Property",
            entity_id=str(prop.id),
            metadata={"validated": validated, "rejected": rejected},
        )
        return Response({
            "detail": f"{validated} mídia(s) validada(s).",
            "validated": validated,
            "rejected": rejected,
            "property": self.get_serializer(prop).data,
        })
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        prop = self.get_object()
        try:
            with transaction.atomic(): prop.publish()
        except Exception as exc:
            raise ValidationError(getattr(exc, "message_dict", {"detail": str(exc)}))
        AuditEvent.objects.create(actor=request.user, action="property.published", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="toggle-featured")
    def toggle_featured(self, request, pk=None):
        prop = self.get_object()
        if not prop.is_public and not prop.featured:
            raise ValidationError({"featured": "Publique o imóvel antes de destacá-lo."})
        prop.featured = not prop.featured
        prop.save(update_fields=["featured", "updated_at"])
        AuditEvent.objects.create(actor=request.user, action="property.featured" if prop.featured else "property.unfeatured", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="toggle-launch")
    def toggle_launch(self, request, pk=None):
        prop = self.get_object()
        prop.launch = not prop.launch
        prop.save(update_fields=["launch", "updated_at"])
        AuditEvent.objects.create(
            actor=request.user,
            action="property.launch_featured" if prop.launch else "property.launch_unfeatured",
            entity_type="Property",
            entity_id=str(prop.id),
        )
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="mark-in-service")
    def mark_in_service(self, request, pk=None):
        prop = self.get_object()
        prop.status = Property.Status.NEGOTIATING
        prop.save(update_fields=["status", "updated_at"])
        AuditEvent.objects.create(actor=request.user, action="property.in_service", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="remove-in-service")
    def remove_in_service(self, request, pk=None):
        prop = self.get_object()
        if prop.status != Property.Status.NEGOTIATING:
            raise ValidationError({"status": "Este imóvel não está em atendimento."})
        prop.status = Property.Status.AVAILABLE
        prop.save(update_fields=["status", "updated_at"])
        AuditEvent.objects.create(actor=request.user, action="property.in_service_removed", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="mark-sold")
    def mark_sold(self, request, pk=None):
        prop = self.get_object()
        prop.status = Property.Status.SOLD
        prop.published = False
        prop.featured = False
        prop.save(update_fields=["status", "published", "featured", "updated_at"])
        AuditEvent.objects.create(actor=request.user, action="property.sold", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="restore-sale")
    def restore_sale(self, request, pk=None):
        prop = self.get_object()
        if prop.status != Property.Status.SOLD:
            raise ValidationError({"status": "Este imóvel não está marcado como vendido."})
        prop.status = Property.Status.AVAILABLE
        prop.published = True
        prop.featured = False
        prop.save(update_fields=["status", "published", "featured", "updated_at"])
        AuditEvent.objects.create(actor=request.user, action="property.sale_restored", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="confirm-review")
    def confirm_review(self, request, pk=None):
        prop = self.get_object(); prop.reviewed_at = timezone.now(); prop.save(update_fields=["reviewed_at", "updated_at"])
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        prop = self.get_object()
        prop.archive()
        AuditEvent.objects.create(actor=request.user, action="property.archived", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)
    @action(detail=True, methods=["post"], url_path="restore-archive")
    def restore_archive(self, request, pk=None):
        prop = self.get_object()
        if prop.status != Property.Status.ARCHIVED or not prop.archived_at:
            raise ValidationError({"status": "Este imóvel não está arquivado."})
        prop.restore_archive()
        AuditEvent.objects.create(actor=request.user, action="property.archive_restored", entity_type="Property", entity_id=str(prop.id))
        return Response(self.get_serializer(prop).data)

class AdminDevelopmentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = DevelopmentSerializer; queryset = Development.objects.all()
class AdminLeadViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = AdminLeadSerializer; queryset = Lead.objects.all().select_related("property", "development", "broker")
class AdminBrokerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = BrokerSerializer; queryset = Broker.objects.all()
class AdminSettingsViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = SiteSettingsSerializer; queryset = SiteSettings.objects.all()
class AdminHeroSlideViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = HeroSlideSerializer; queryset = HeroSlide.objects.all()
class AdminInstitutionalImageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = InstitutionalImageSerializer; queryset = InstitutionalImage.objects.all()
class AdminTestimonialViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = TestimonialSerializer; queryset = Testimonial.objects.all()
class AdminFrequentlyAskedQuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = FrequentlyAskedQuestionSerializer; queryset = FrequentlyAskedQuestion.objects.all()
class AdminAuditViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = AuditSerializer; queryset = AuditEvent.objects.all().select_related("actor").order_by("-created_at")
class AdminImportViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAdminUser]; serializer_class = ImportJobSerializer; queryset = ImportJob.objects.all().select_related("property").order_by("-created_at")
    def create(self, request):
        upload = request.FILES.get("file")
        if upload:
            if not upload.name.lower().endswith(".zip"): raise ValidationError({"file": "Envie um arquivo ZIP."})
            with tempfile.NamedTemporaryFile(suffix=".zip") as temporary:
                for chunk in upload.chunks(): temporary.write(chunk)
                temporary.flush()
                job = import_property_zip(temporary.name)
            return Response(self.get_serializer(job).data, status=status.HTTP_201_CREATED)
        path = request.data.get("path")
        if not path: raise ValidationError({"path": "Informe uma pasta disponível no servidor."})
        return Response(self.get_serializer(import_property_folder(path)).data, status=status.HTTP_201_CREATED)

class DashboardView(APIView):
    permission_classes = [permissions.IsAdminUser]
    def get(self, request):
        properties = Property.objects.all()
        return Response({"properties": properties.count(), "published": properties.filter(published=True).count(), "featured": properties.filter(featured=True).count(), "needs_review": sum(p.review_color != "green" for p in properties), "leads": Lead.objects.count(), "imports": ImportJob.objects.count()})
