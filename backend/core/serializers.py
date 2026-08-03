import os
import re
from django.contrib.auth import get_user_model
from rest_framework import serializers
from .media_utils import normalize_uploaded_image
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from .models import AuditEvent, Broker, CRMActivity, CRMContact, CRMImportBatch, CRMImportRow, CRMNotification, CRMOpportunity, CRMProposal, CRMPropertyLink, CRMTask, Development, FrequentlyAskedQuestion, HeroSlide, ImportJob, InstitutionalImage, Lead, ListingOption, Media, Property, SiteSettings, Testimonial, catalog_key, normalize_document, normalize_email, normalize_phone

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
        property_type = attrs.get("property_type", getattr(self.instance, "property_type", "Casa"))
        city = attrs.get("city", getattr(self.instance, "city", ""))
        neighborhood = attrs.get("neighborhood", getattr(self.instance, "neighborhood", ""))
        if self.instance is None or "property_type" in attrs:
            attrs["property_type"] = self._canonical_option(ListingOption.Kind.PROPERTY_TYPE, property_type)
        if self.instance is None or "city" in attrs:
            attrs["city"] = self._canonical_option(ListingOption.Kind.CITY, city)
            city = attrs["city"]
        if self.instance is None or "city" in attrs or "neighborhood" in attrs:
            attrs["neighborhood"] = self._canonical_option(
                ListingOption.Kind.NEIGHBORHOOD,
                neighborhood,
                city=city,
            )
        return attrs
    def _canonical_option(self, kind, value, city=""):
        filters = {
            "kind": kind,
            "key": catalog_key(value),
            "active": True,
        }
        if kind == ListingOption.Kind.NEIGHBORHOOD:
            filters["city_key"] = catalog_key(city)
        option = ListingOption.objects.filter(**filters).first()
        if option:
            return option.name
        label = dict(ListingOption.Kind.choices)[kind]
        raise serializers.ValidationError({
            {
                ListingOption.Kind.PROPERTY_TYPE: "property_type",
                ListingOption.Kind.CITY: "city",
                ListingOption.Kind.NEIGHBORHOOD: "neighborhood",
            }[kind]: f"{label} não cadastrado. Use o botão + para criar a opção.",
        })
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


class ListingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingOption
        fields = ("id", "kind", "name", "city", "active")
        read_only_fields = ("id", "active")

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", ""))
        if self.instance and attrs.get("kind", kind) != self.instance.kind:
            raise serializers.ValidationError({"kind": "O tipo da opção não pode ser alterado."})
        name = " ".join(attrs.get("name", getattr(self.instance, "name", "")).split())
        if not name:
            raise serializers.ValidationError({"name": "Informe um nome."})
        city = ""
        if kind == ListingOption.Kind.NEIGHBORHOOD:
            requested_city = attrs.get("city", getattr(self.instance, "city", ""))
            city_option = ListingOption.objects.filter(
                kind=ListingOption.Kind.CITY,
                key=catalog_key(requested_city),
                active=True,
            ).first()
            if not city_option:
                raise serializers.ValidationError({"city": "Selecione uma cidade cadastrada."})
            city = city_option.name
        duplicate = ListingOption.objects.filter(
            kind=kind,
            key=catalog_key(name),
            city_key=catalog_key(city),
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        duplicate = duplicate.first()
        if duplicate:
            raise serializers.ValidationError({"name": f'Opção já cadastrada como “{duplicate.name}”.'})
        attrs["name"] = name
        attrs["city"] = city
        return attrs

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
    def create(self, validated_data):
        lead = super().create(validated_data)
        from .crm_services import sync_lead_to_crm
        sync_lead_to_crm(lead)
        return lead

class AdminLeadSerializer(LeadSerializer):
    class Meta(LeadSerializer.Meta):
        read_only_fields = ("id", "created_at", "property_title", "property")


class CRMPropertyLinkSerializer(serializers.ModelSerializer):
    property_title = serializers.CharField(source="property.title", read_only=True)
    contact_name = serializers.CharField(source="contact.name", read_only=True)

    class Meta:
        model = CRMPropertyLink
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "property_title", "contact_name")

    def validate(self, attrs):
        prop = attrs.get("property", getattr(self.instance, "property", None))
        unit_reference = attrs.get("unit_reference", getattr(self.instance, "unit_reference", ""))
        if not prop and not unit_reference.strip():
            raise serializers.ValidationError({"unit_reference": "Informe um imóvel cadastrado ou uma referência de unidade."})
        return attrs


class CRMContactSerializer(serializers.ModelSerializer):
    property_links = CRMPropertyLinkSerializer(many=True, read_only=True)
    opportunity_count = serializers.IntegerField(read_only=True)
    pending_task_count = serializers.IntegerField(read_only=True)
    broker_name = serializers.CharField(source="assigned_broker.name", read_only=True)

    class Meta:
        model = CRMContact
        fields = "__all__"
        read_only_fields = (
            "id", "created_at", "updated_at", "normalized_phone", "normalized_email",
            "property_links", "opportunity_count", "pending_task_count", "broker_name",
        )

    def validate_document(self, value):
        document = normalize_document(value)
        if document and len(document) not in (11, 14):
            raise serializers.ValidationError("Informe um CPF ou CNPJ com a quantidade correta de dígitos.")
        return document

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if phone and len(phone) < 10:
            raise serializers.ValidationError("Informe um telefone com DDD.")
        return phone

    def validate_email(self, value):
        return normalize_email(value)

    def validate(self, attrs):
        document = attrs.get("document", getattr(self.instance, "document", None))
        phone = normalize_phone(attrs.get("phone", getattr(self.instance, "phone", "")))
        email = normalize_email(attrs.get("email", getattr(self.instance, "email", "")))
        duplicate = CRMContact.objects.all()
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        duplicate_filters = Q()
        if document:
            duplicate_filters |= Q(document=document)
        if phone:
            duplicate_filters |= Q(normalized_phone=phone)
        if email:
            duplicate_filters |= Q(normalized_email=email)
        match = duplicate.filter(duplicate_filters).first() if duplicate_filters else None
        if match:
            raise serializers.ValidationError({"detail": f"Possível duplicidade com o contato {match.name}."})
        if attrs.get("marketing_consent") and not attrs.get("consent_at", getattr(self.instance, "consent_at", None)):
            attrs["consent_at"] = timezone.now()
        return attrs


class CRMOpportunitySerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    broker_name = serializers.CharField(source="broker.name", read_only=True)
    proposal_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CRMOpportunity
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "contact_name", "property_title", "broker_name", "proposal_count", "closed_at")

    def validate(self, attrs):
        stage = attrs.get("stage", getattr(self.instance, "stage", CRMOpportunity.Stage.NEW))
        loss_reason = attrs.get("loss_reason", getattr(self.instance, "loss_reason", ""))
        if stage == CRMOpportunity.Stage.LOST and not loss_reason.strip():
            raise serializers.ValidationError({"loss_reason": "Informe o motivo da perda."})
        return attrs

    def update(self, instance, validated_data):
        old_stage = instance.stage
        new_stage = validated_data.get("stage", old_stage)
        if new_stage in {CRMOpportunity.Stage.WON, CRMOpportunity.Stage.LOST} and old_stage != new_stage:
            validated_data["closed_at"] = timezone.now()
        elif new_stage not in {CRMOpportunity.Stage.WON, CRMOpportunity.Stage.LOST}:
            validated_data["closed_at"] = None
        opportunity = super().update(instance, validated_data)
        if old_stage != opportunity.stage:
            CRMActivity.objects.create(
                contact=opportunity.contact,
                opportunity=opportunity,
                actor=self.context["request"].user,
                kind=CRMActivity.Kind.STAGE_CHANGE,
                description=f"Etapa alterada de {old_stage} para {opportunity.stage}.",
            )
        return opportunity


class CRMTaskSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    broker_name = serializers.CharField(source="broker.name", read_only=True)

    class Meta:
        model = CRMTask
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "completed_at", "contact_name", "property_title", "broker_name")

    def validate(self, attrs):
        contact = attrs.get("contact", getattr(self.instance, "contact", None))
        opportunity = attrs.get("opportunity", getattr(self.instance, "opportunity", None))
        if opportunity and opportunity.contact_id != contact.id:
            raise serializers.ValidationError({"opportunity": "A oportunidade pertence a outro contato."})
        return attrs

    def update(self, instance, validated_data):
        new_status = validated_data.get("status", instance.status)
        if new_status == CRMTask.Status.COMPLETED and instance.status != CRMTask.Status.COMPLETED:
            validated_data["completed_at"] = timezone.now()
        elif new_status != CRMTask.Status.COMPLETED:
            validated_data["completed_at"] = None
        return super().update(instance, validated_data)


class CRMActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = CRMActivity
        fields = "__all__"
        read_only_fields = ("id", "actor", "actor_name", "created_at", "updated_at")

    def validate(self, attrs):
        contact = attrs.get("contact", getattr(self.instance, "contact", None))
        opportunity = attrs.get("opportunity", getattr(self.instance, "opportunity", None))
        if opportunity and opportunity.contact_id != contact.id:
            raise serializers.ValidationError({"opportunity": "A oportunidade pertence a outro contato."})
        return attrs


class CRMProposalSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="opportunity.contact.name", read_only=True)
    property_title = serializers.CharField(source="opportunity.property.title", read_only=True)

    class Meta:
        model = CRMProposal
        fields = "__all__"
        read_only_fields = ("id", "version", "contact_name", "property_title", "created_at", "updated_at")

    def validate(self, attrs):
        total = attrs.get("total_value", getattr(self.instance, "total_value", 0))
        down = attrs.get("down_payment", getattr(self.instance, "down_payment", 0))
        financing = attrs.get("financing_value", getattr(self.instance, "financing_value", 0))
        if down + financing > total:
            raise serializers.ValidationError("Entrada e financiamento não podem superar o valor total.")
        for field in ("installments", "annual_reinforcements", "exchanges"):
            value = attrs.get(field, getattr(self.instance, field, []))
            if not isinstance(value, list):
                raise serializers.ValidationError({field: "Informe uma lista de condições."})
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            opportunity = CRMOpportunity.objects.select_for_update().select_related("contact").get(pk=validated_data["opportunity"].pk)
            validated_data["opportunity"] = opportunity
            latest = opportunity.proposals.order_by("-version").first()
            validated_data["version"] = (latest.version if latest else 0) + 1
            proposal = super().create(validated_data)
            CRMActivity.objects.create(
                contact=opportunity.contact,
                opportunity=opportunity,
                actor=self.context["request"].user,
                kind=CRMActivity.Kind.PROPOSAL,
                description=f"Proposta v{proposal.version} criada no valor de R$ {proposal.total_value}.",
            )
        return proposal


class CRMImportRowSerializer(serializers.ModelSerializer):
    matched_contact_name = serializers.CharField(source="matched_contact.name", read_only=True)
    matched_property_title = serializers.CharField(source="matched_property.title", read_only=True)

    class Meta:
        model = CRMImportRow
        fields = "__all__"
        read_only_fields = ("id", "batch", "row_number", "raw_data", "created_at", "updated_at", "matched_contact_name", "matched_property_title")


class CRMImportBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMImportBatch
        fields = "__all__"
        read_only_fields = (
            "id", "original_name", "source_hash", "status", "total_rows", "valid_rows",
            "duplicate_rows", "error_rows", "imported_rows", "errors", "created_by", "created_at", "updated_at",
        )
        extra_kwargs = {"file": {"write_only": True}}

class BrokerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Broker
        fields = "__all__"
        read_only_fields = ("id", "user", "user_username", "created_at", "updated_at")

    def validate_username(self, value):
        username = value.strip()
        if not username:
            return ""
        users = get_user_model().objects.all()
        if self.instance and self.instance.user_id:
            users = users.exclude(pk=self.instance.user_id)
        if users.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Este usuário já está em uso.")
        return username

    def create(self, validated_data):
        username = validated_data.pop("username", "")
        password = validated_data.pop("password", "")
        if bool(username) != bool(password):
            raise serializers.ValidationError("Informe usuário e senha para liberar o acesso do corretor.")
        if username:
            validated_data["user"] = get_user_model().objects.create_user(username=username, password=password)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        username = validated_data.pop("username", None)
        password = validated_data.pop("password", "")
        if username is not None:
            if username and not instance.user:
                if not password:
                    raise serializers.ValidationError({"password": "Informe uma senha para criar o acesso."})
                instance.user = get_user_model().objects.create_user(username=username, password=password)
            elif instance.user and username:
                instance.user.username = username
        if instance.user and password:
            instance.user.set_password(password)
        if instance.user:
            instance.user.is_active = validated_data.get("active", instance.active)
            instance.user.save()
        return super().update(instance, validated_data)


class CRMNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMNotification
        fields = "__all__"
        read_only_fields = ("id", "recipient", "broker", "source_task", "kind", "priority", "title", "message", "link", "unique_key", "created_at", "updated_at")
class ImportJobSerializer(serializers.ModelSerializer):
    class Meta: model = ImportJob; fields = "__all__"
class SiteSettingsSerializer(serializers.ModelSerializer):
    hero_video_src = serializers.SerializerMethodField()
    hero_poster_src = serializers.SerializerMethodField()
    class Meta:
        model = SiteSettings
        fields = "__all__"
        extra_kwargs = {
            "hero_video": {"write_only": True, "required": False},
            "hero_poster": {"write_only": True, "required": False},
        }
    def get_hero_video_src(self, obj): return obj.hero_video.url if obj.hero_video else ""
    def get_hero_poster_src(self, obj): return obj.hero_poster.url if obj.hero_poster else ""
    def validate_hero_video(self, video):
        if not video:
            return video
        if video.size > 100 * 1024 * 1024:
            raise serializers.ValidationError("O vídeo de fundo deve ter no máximo 100 MB.")
        extension = os.path.splitext(video.name)[1].lower()
        if extension != ".mp4":
            raise serializers.ValidationError("Envie o vídeo de fundo no formato MP4.")
        mime_type = (video.content_type or "").lower()
        if mime_type != "video/mp4":
            raise serializers.ValidationError("O tipo do arquivo não corresponde a um vídeo MP4.")
        signature = video.read(16)
        video.seek(0)
        if len(signature) < 12 or signature[4:8] != b"ftyp":
            raise serializers.ValidationError("O arquivo MP4 é inválido ou está corrompido.")
        return video
    def validate_hero_poster(self, image):
        return normalize_uploaded_image(image, max_bytes=12 * 1024 * 1024)
class HeroSlideSerializer(serializers.ModelSerializer):
    image_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = HeroSlide; fields = "__all__"
    def get_image_src(self, obj): return obj.image.url if obj.image else obj.image_url
    def validate(self, attrs):
        if self.instance is None and HeroSlide.objects.count() >= 12:
            raise serializers.ValidationError("O Header permite no máximo 12 imagens no total.")
        active = attrs.get("active", self.instance.active if self.instance else True)
        if active:
            active_slides = HeroSlide.objects.filter(active=True)
            if self.instance:
                active_slides = active_slides.exclude(pk=self.instance.pk)
            if active_slides.count() >= 12:
                raise serializers.ValidationError({"active": "O Header permite no máximo 12 imagens ativas."})
        return attrs
    def validate_image(self, image):
        if image and image.size > 12 * 1024 * 1024:
            raise serializers.ValidationError("A imagem deve ter no máximo 12 MB.")
        return normalize_uploaded_image(image, max_bytes=12 * 1024 * 1024)
class InstitutionalImageSerializer(serializers.ModelSerializer):
    image_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = InstitutionalImage; fields = "__all__"
    def get_image_src(self, obj): return obj.image.url
    def validate_image(self, image):
        if image and image.size > 12 * 1024 * 1024:
            raise serializers.ValidationError("A imagem deve ter no máximo 12 MB.")
        return normalize_uploaded_image(image, max_bytes=12 * 1024 * 1024)
class TestimonialSerializer(serializers.ModelSerializer):
    photo_src = serializers.SerializerMethodField()
    active = serializers.BooleanField(default=True)
    class Meta: model = Testimonial; fields = "__all__"
    def get_photo_src(self, obj): return obj.photo.url if obj.photo else ""
    def validate_photo(self, photo):
        if photo and photo.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("A foto deve ter no máximo 5 MB.")
        return normalize_uploaded_image(photo, max_bytes=5 * 1024 * 1024)
class FrequentlyAskedQuestionSerializer(serializers.ModelSerializer):
    class Meta: model = FrequentlyAskedQuestion; fields = "__all__"
class AuditSerializer(serializers.ModelSerializer):
    class Meta: model = AuditEvent; fields = "__all__"
