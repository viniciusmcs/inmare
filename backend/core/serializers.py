import re
from rest_framework import serializers
from django.utils import timezone
from django.utils.text import slugify
from .models import AuditEvent, Broker, Development, FrequentlyAskedQuestion, HeroSlide, ImportJob, InstitutionalImage, Lead, Media, Property, SiteSettings, Testimonial

class MediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    class Meta: model = Media; fields = ("id", "kind", "caption", "position", "is_primary", "url", "status")
    def get_url(self, obj):
        if not obj.file: return obj.external_url
        return obj.file.url

class PublicPropertySerializer(serializers.ModelSerializer):
    media = MediaSerializer(many=True, read_only=True)
    review_color = serializers.CharField(read_only=True)
    is_launch = serializers.BooleanField(read_only=True)
    class Meta:
        model = Property
        fields = ("public_id", "title", "slug", "public_description", "property_type", "purpose", "status", "price", "condominium_fee", "iptu", "price_on_request", "city", "neighborhood", "public_reference", "approximate_latitude", "approximate_longitude", "bedrooms", "suites", "bathrooms", "parking_spaces", "private_area", "total_area", "land_dimensions", "solar_orientation", "features", "accepts_financing", "accepts_exchange", "featured", "launch", "is_launch", "exclusive", "review_color", "created_at", "media")

class AdminPropertySerializer(serializers.ModelSerializer):
    media = MediaSerializer(many=True, read_only=True)
    review_color = serializers.CharField(read_only=True)
    review_label = serializers.CharField(read_only=True)
    is_launch = serializers.BooleanField(read_only=True)
    slug = serializers.SlugField(required=False, allow_blank=True)
    class Meta: model = Property; fields = "__all__"; read_only_fields = ("public_id", "archived_at")
    def to_internal_value(self, data):
        normalized = data.copy()
        normalized["purpose"] = normalized.get("purpose") or Property.Purpose.SALE
        normalized["status"] = normalized.get("status") or Property.Status.DRAFT
        for field in ("featured", "price_on_request"):
            if normalized.get(field) in ("", None):
                normalized[field] = False
        return super().to_internal_value(normalized)
    def validate(self, attrs):
        if attrs.get("featured") and not attrs.get("published", getattr(self.instance, "published", False)):
            raise serializers.ValidationError({"featured": "Publique o imóvel antes de destacá-lo."})
        return attrs
    def create(self, validated_data):
        validated_data["slug"] = self._unique_slug(validated_data.get("slug") or validated_data["title"])
        return super().create(validated_data)
    def update(self, instance, validated_data):
        if "slug" in validated_data or "title" in validated_data:
            validated_data["slug"] = self._unique_slug(validated_data.get("slug") or validated_data.get("title", instance.title), instance)
        return super().update(instance, validated_data)
    def _unique_slug(self, value, instance=None):
        base = slugify(value) or "imovel"
        slug, counter = base, 2
        queryset = Property.objects.exclude(pk=instance.pk) if instance else Property.objects.all()
        while queryset.filter(slug=slug).exists():
            slug = f"{base}-{counter}"; counter += 1
        return slug

class DevelopmentSerializer(serializers.ModelSerializer):
    media = MediaSerializer(many=True, read_only=True)
    class Meta: model = Development; fields = "__all__"

class LeadSerializer(serializers.ModelSerializer):
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    property_public_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    class Meta: model = Lead; fields = ("id", "name", "phone", "email", "message", "origin", "property", "property_public_id", "property_title", "development", "consent", "status", "preferred_visit_date", "preferred_visit_period", "created_at", "website"); read_only_fields = ("id", "status", "created_at", "property_title", "property")
    def validate(self, data):
        if data.pop("website", ""): raise serializers.ValidationError("Envio inválido.")
        property_public_id = data.pop("property_public_id", "")
        if property_public_id:
            try: data["property"] = Property.objects.get(public_id=property_public_id, archived_at__isnull=True)
            except Property.DoesNotExist: raise serializers.ValidationError({"property_public_id": "O imóvel escolhido não está mais disponível."})
        phone = data.get("phone", getattr(self.instance, "phone", ""))
        email = data.get("email", getattr(self.instance, "email", ""))
        if not phone and not email: raise serializers.ValidationError("Informe telefone ou e-mail.")
        if data.get("phone"):
            digits = re.sub(r"\D", "", data["phone"])
            if len(digits) in (10, 11): digits = f"55{digits}"
            if len(digits) < 12 or len(digits) > 13: raise serializers.ValidationError({"phone": "Informe um WhatsApp válido com DDD."})
            data["phone"] = digits
        if data.get("origin") == "visit":
            if not data.get("property"): raise serializers.ValidationError({"property_public_id": "Escolha o imóvel da visita."})
            if not data.get("preferred_visit_date"): raise serializers.ValidationError({"preferred_visit_date": "Escolha uma data para a visita."})
            if data["preferred_visit_date"] <= timezone.localdate(): raise serializers.ValidationError({"preferred_visit_date": "Escolha uma data futura."})
            if not data.get("preferred_visit_period"): raise serializers.ValidationError({"preferred_visit_period": "Escolha um período."})
        return data

class AdminLeadSerializer(LeadSerializer):
    class Meta(LeadSerializer.Meta):
        read_only_fields = ("id", "created_at", "property_title", "property")

class BrokerSerializer(serializers.ModelSerializer):
    class Meta: model = Broker; fields = "__all__"
class ImportJobSerializer(serializers.ModelSerializer):
    class Meta: model = ImportJob; fields = "__all__"
class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta: model = SiteSettings; fields = "__all__"
class HeroSlideSerializer(serializers.ModelSerializer):
    image_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = HeroSlide; fields = "__all__"
    def get_image_src(self, obj): return obj.image.url if obj.image else obj.image_url
    def validate_image(self, image):
        if image and image.size > 12 * 1024 * 1024:
            raise serializers.ValidationError("A imagem deve ter no máximo 12 MB.")
        return image
class InstitutionalImageSerializer(serializers.ModelSerializer):
    image_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = InstitutionalImage; fields = "__all__"
    def get_image_src(self, obj): return obj.image.url
    def validate_image(self, image):
        if image and image.size > 12 * 1024 * 1024:
            raise serializers.ValidationError("A imagem deve ter no máximo 12 MB.")
        return image
class TestimonialSerializer(serializers.ModelSerializer):
    photo_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = Testimonial; fields = "__all__"
    def get_photo_src(self, obj): return obj.photo.url if obj.photo else ""
    def validate_photo(self, photo):
        if photo and photo.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("A foto deve ter no máximo 5 MB.")
        return photo
class FrequentlyAskedQuestionSerializer(serializers.ModelSerializer):
    class Meta: model = FrequentlyAskedQuestion; fields = "__all__"
class AuditSerializer(serializers.ModelSerializer):
    class Meta: model = AuditEvent; fields = "__all__"
