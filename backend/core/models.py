import secrets
import uuid
from datetime import timedelta
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


def public_code():
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10].upper()


class TimeStamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True


class Broker(TimeStamped):
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    active = models.BooleanField(default=True)
    def __str__(self): return self.name


class Property(TimeStamped):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        AVAILABLE = "available", "Disponível"
        RESERVED = "reserved", "Reservado"
        NEGOTIATING = "negotiating", "Em negociação"
        SOLD = "sold", "Vendido"
        RENTED = "rented", "Alugado"
        ARCHIVED = "archived", "Arquivado"
    class Purpose(models.TextChoices):
        SALE = "sale", "Venda"
        RENT = "rent", "Aluguel"
        SEASON = "season", "Temporada"
    public_id = models.CharField(max_length=12, unique=True, default=public_code, editable=False)
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    public_description = models.TextField(blank=True)
    property_type = models.CharField(max_length=80, default="Casa")
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.SALE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    condominium_fee = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    iptu = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    price_on_request = models.BooleanField(default=False)
    city = models.CharField(max_length=120, db_index=True)
    neighborhood = models.CharField(max_length=120, db_index=True)
    public_reference = models.CharField(max_length=240, blank=True)
    approximate_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    approximate_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    private_address = models.CharField(max_length=255, blank=True)
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    suites = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    parking_spaces = models.PositiveSmallIntegerField(null=True, blank=True)
    private_area = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_area = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    land_dimensions = models.CharField(max_length=60, blank=True)
    solar_orientation = models.CharField(max_length=80, blank=True)
    features = models.JSONField(default=list, blank=True)
    accepts_financing = models.BooleanField(null=True, blank=True)
    accepts_exchange = models.BooleanField(null=True, blank=True)
    broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.SET_NULL, related_name="properties")
    private_commission = models.CharField(max_length=120, blank=True)
    internal_notes = models.TextField(blank=True)
    published = models.BooleanField(default=False, db_index=True)
    hidden = models.BooleanField(default=False, db_index=True)
    featured = models.BooleanField(default=False, db_index=True)
    launch = models.BooleanField(default=False, db_index=True)
    exclusive = models.BooleanField(default=False, db_index=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    external_id = models.CharField(max_length=160, blank=True)
    source = models.CharField(max_length=80, default="manual")

    class Meta:
        indexes = [models.Index(fields=["published", "hidden", "status"]), models.Index(fields=["city", "neighborhood"])]

    @property
    def is_public(self):
        return self.published and not self.hidden and not self.archived_at and self.status in {
            self.Status.AVAILABLE,
            self.Status.RESERVED,
            self.Status.NEGOTIATING,
        }

    @property
    def review_color(self):
        if not self.reviewed_at or self.reviewed_at <= timezone.now() - timedelta(days=60): return "red"
        if self.reviewed_at <= timezone.now() - timedelta(days=30): return "yellow"
        return "green"

    @property
    def review_label(self):
        return {"green": "Novo", "yellow": "Atenção: revisar", "red": "Revisão urgente"}[self.review_color]

    @property
    def is_launch(self):
        return self.launch or self.created_at >= timezone.now() - timedelta(days=7)

    def publication_errors(self):
        errors = {}
        for field in ("title", "public_description", "property_type", "purpose", "city", "neighborhood"):
            if not getattr(self, field): errors[field] = "Campo obrigatório para publicação."
        if not self.price and not self.price_on_request: errors["price"] = "Informe o valor ou marque consultar."
        if not self.reviewed_at: errors["reviewed_at"] = "Confirme a revisão comercial."
        if not self.media.filter(kind=Media.Kind.IMAGE, is_primary=True, status=Media.Status.READY).exists():
            errors["image"] = "Defina uma imagem principal validada."
        return errors

    def publish(self):
        errors = self.publication_errors()
        if errors: raise ValidationError(errors)
        self.published = True
        if self.status == self.Status.DRAFT: self.status = self.Status.AVAILABLE
        self.save(update_fields=["published", "status", "updated_at"])

    def archive(self):
        self.archived_at = timezone.now()
        self.published = False
        self.featured = False
        self.status = self.Status.ARCHIVED
        self.save(update_fields=["archived_at", "published", "featured", "status", "updated_at"])

    def restore_archive(self):
        self.archived_at = None
        self.published = True
        self.featured = False
        self.status = self.Status.AVAILABLE
        self.save(update_fields=["archived_at", "published", "featured", "status", "updated_at"])

    def clean(self):
        if self.featured and not self.is_public: raise ValidationError({"featured": "Somente imóveis públicos podem ser destacados."})
    def __str__(self): return self.title


class Development(TimeStamped):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    city = models.CharField(max_length=120)
    neighborhood = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=80, blank=True)
    highlights = models.JSONField(default=list, blank=True)
    published = models.BooleanField(default=False)
    hidden = models.BooleanField(default=False)
    featured = models.BooleanField(default=False)
    external_link = models.URLField(blank=True)
    def __str__(self): return self.name


class Media(TimeStamped):
    class Kind(models.TextChoices):
        IMAGE = "image", "Imagem"
        VIDEO = "video", "Vídeo"
        DOCUMENT = "document", "Documento"
    class Status(models.TextChoices):
        QUARANTINE = "quarantine", "Quarentena"
        READY = "ready", "Pronto"
        REJECTED = "rejected", "Rejeitado"
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.CASCADE, related_name="media")
    development = models.ForeignKey(Development, null=True, blank=True, on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    file = models.FileField(upload_to="media/%Y/%m/", blank=True)
    source_path = models.CharField(max_length=500, blank=True)
    external_url = models.URLField(blank=True)
    caption = models.CharField(max_length=240, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    sha256 = models.CharField(max_length=64, db_index=True)
    mime_type = models.CharField(max_length=120)
    size = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUARANTINE)
    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(property__isnull=False) | Q(development__isnull=False), name="media_has_owner"),
            models.UniqueConstraint(fields=["property"], condition=Q(is_primary=True, kind="image"), name="one_primary_property_image"),
            models.UniqueConstraint(fields=["development"], condition=Q(is_primary=True, kind="image"), name="one_primary_development_image"),
            models.UniqueConstraint(fields=["property", "sha256"], condition=Q(property__isnull=False), name="unique_property_media_hash"),
        ]


class Lead(TimeStamped):
    class Status(models.TextChoices):
        NEW = "new", "Novo"
        IN_PROGRESS = "in_progress", "Em atendimento"
        CONVERTED = "converted", "Convertido"
        DISCARDED = "discarded", "Descartado"
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    message = models.TextField()
    origin = models.CharField(max_length=80, default="contact")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    development = models.ForeignKey(Development, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    consent = models.BooleanField(default=False)
    preferred_visit_date = models.DateField(null=True, blank=True)
    preferred_visit_period = models.CharField(max_length=40, blank=True)


class SiteSettings(TimeStamped):
    company_name = models.CharField(max_length=160, default="In Mare Negócios Imobiliários")
    slogan = models.CharField(max_length=240, default="Conectando pessoas a imóveis únicos.")
    whatsapp = models.CharField(max_length=40, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    instagram = models.URLField(blank=True)
    facebook = models.URLField(blank=True)
    linkedin = models.URLField(blank=True)
    youtube = models.URLField(blank=True)
    tiktok = models.URLField(blank=True)
    about_title = models.CharField(max_length=200, default="Sobre a In Mare")
    about_text = models.TextField(blank=True, default="Nascemos com o propósito de transformar o mercado imobiliário através de confiança, tranquilidade e experiências memoráveis.")
    team_title = models.CharField(max_length=200, default="Nossa Equipe")
    team_text = models.TextField(blank=True, default="Profissionais preparados para entender seus objetivos e cuidar de cada detalhe da sua jornada imobiliária.")


class InstitutionalImage(TimeStamped):
    class Section(models.TextChoices):
        COMPANY = "company", "A Imobiliária"
        TEAM = "team", "Nossa Equipe"

    section = models.CharField(max_length=20, choices=Section.choices, db_index=True)
    title = models.CharField(max_length=160, blank=True)
    text = models.CharField(max_length=280, blank=True)
    image = models.ImageField(upload_to="content/institutional/%Y/%m/")
    position = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "created_at"]


class HeroSlide(TimeStamped):
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=280, blank=True)
    image_url = models.URLField(blank=True)
    image = models.ImageField(upload_to="content/heroes/%Y/%m/", blank=True)
    link_url = models.CharField(max_length=240, blank=True)
    link_label = models.CharField(max_length=80, blank=True)
    position = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "created_at"]


class Testimonial(TimeStamped):
    name = models.CharField(max_length=160)
    role = models.CharField(max_length=160, blank=True)
    text = models.TextField()
    photo = models.ImageField(upload_to="content/testimonials/%Y/%m/", blank=True)
    position = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "created_at"]


class FrequentlyAskedQuestion(TimeStamped):
    question = models.CharField(max_length=240)
    answer = models.TextField()
    position = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "created_at"]


class ImportJob(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        PROCESSING = "processing", "Processando"
        REVIEW = "review", "Aguardando revisão"
        FAILED = "failed", "Falhou"
    source_path = models.CharField(max_length=500)
    source_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.SET_NULL, related_name="imports")
    suggestions = models.JSONField(default=dict)
    errors = models.JSONField(default=list)


class AuditEvent(TimeStamped):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=100, db_index=True)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
