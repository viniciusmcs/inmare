import secrets
import re
import unicodedata
import uuid
from datetime import timedelta
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


def public_code():
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10].upper()


def catalog_key(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()


def person_name_search_key(value):
    """Normalize common Brazilian name spelling variants for lookup."""
    normalized = catalog_key(value)
    words = []
    for word in normalized.split():
        word = word.replace("ph", "f").replace("qu", "k")
        word = word.replace("y", "i").replace("q", "k")
        word = re.sub(r"c(?=[aou])", "k", word)
        word = re.sub(r"c(?=[ei])", "s", word)
        word = re.sub(r"(.)\1+", r"\1", word)
        words.append(word)
    return " ".join(words)


class TimeStamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True


class Broker(TimeStamped):
    class Role(models.TextChoices):
        MANAGER = "manager", "Gestor comercial"
        BROKER = "broker", "Corretor"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="crm_broker",
    )
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.BROKER, db_index=True)
    can_manage_properties = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    def __str__(self): return self.name


class ListingOption(TimeStamped):
    class Kind(models.TextChoices):
        PROPERTY_TYPE = "property_type", "Tipo de imóvel"
        CITY = "city", "Cidade"
        NEIGHBORHOOD = "neighborhood", "Bairro"

    kind = models.CharField(max_length=30, choices=Kind.choices, db_index=True)
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=120, editable=False)
    city = models.CharField(max_length=120, blank=True)
    city_key = models.CharField(max_length=120, blank=True, editable=False)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["kind", "city", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["kind", "key", "city_key"],
                name="unique_listing_option",
            ),
        ]

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.split())
        self.key = catalog_key(self.name)
        if self.kind == self.Kind.NEIGHBORHOOD:
            self.city = " ".join(self.city.split())
            self.city_key = catalog_key(self.city)
        else:
            self.city = ""
            self.city_key = ""
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.city})" if self.city else self.name


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


def normalize_document(value):
    digits = re.sub(r"\D", "", value or "")
    return digits or None


def normalize_phone(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) in (10, 11):
        digits = f"55{digits}"
    return digits


def normalize_email(value):
    return re.sub(r"\s+", "", value or "").casefold()


class CRMContact(TimeStamped):
    class PersonType(models.TextChoices):
        INDIVIDUAL = "individual", "Pessoa física"
        COMPANY = "company", "Pessoa jurídica"

    class Profile(models.TextChoices):
        GENERAL = "general", "Contato"
        OWNER = "owner", "Proprietário"
        BUYER = "buyer", "Comprador"
        SELLER = "seller", "Vendedor"
        INVESTOR = "investor", "Investidor"
        PARTNER = "partner", "Parceiro"

    class Status(models.TextChoices):
        ACTIVE = "active", "Ativo"
        ARCHIVED = "archived", "Arquivado"

    name = models.CharField(max_length=200, db_index=True)
    search_name = models.CharField(max_length=200, blank=True, db_index=True, editable=False)
    person_type = models.CharField(max_length=20, choices=PersonType.choices, default=PersonType.INDIVIDUAL)
    document = models.CharField(max_length=14, null=True, blank=True, unique=True)
    phone = models.CharField(max_length=20, blank=True)
    normalized_phone = models.CharField(max_length=20, blank=True, db_index=True, editable=False)
    email = models.EmailField(blank=True)
    normalized_email = models.CharField(max_length=254, blank=True, db_index=True, editable=False)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True, db_index=True)
    state = models.CharField(max_length=2, blank=True)
    postal_code = models.CharField(max_length=8, blank=True)
    profile = models.CharField(max_length=20, choices=Profile.choices, default=Profile.GENERAL, db_index=True)
    source = models.CharField(max_length=80, default="manual", db_index=True)
    source_detail = models.CharField(max_length=200, blank=True)
    tags = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    assigned_broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_contacts")
    marketing_consent = models.BooleanField(default=False)
    consent_at = models.DateTimeField(null=True, blank=True)
    do_not_contact = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    last_contact_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name", "created_at"]
        indexes = [models.Index(fields=["status", "profile"])]

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.split())
        self.search_name = person_name_search_key(self.name)
        self.document = normalize_document(self.document)
        self.normalized_phone = normalize_phone(self.phone)
        self.normalized_email = normalize_email(self.email)
        self.postal_code = re.sub(r"\D", "", self.postal_code or "")
        self.state = (self.state or "").strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class CRMPropertyLink(TimeStamped):
    class Relationship(models.TextChoices):
        OWNER = "owner", "Proprietário"
        CO_OWNER = "co_owner", "Coproprietário"
        INTERESTED = "interested", "Interessado"
        REPRESENTATIVE = "representative", "Representante"

    contact = models.ForeignKey(CRMContact, on_delete=models.CASCADE, related_name="property_links")
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.CASCADE, related_name="crm_contacts")
    relationship = models.CharField(max_length=20, choices=Relationship.choices, default=Relationship.OWNER)
    development_name = models.CharField(max_length=200, blank=True)
    unit_reference = models.CharField(max_length=120, blank=True)
    ownership_share = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    is_primary = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["development_name", "unit_reference", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["contact", "property", "relationship"],
                condition=Q(property__isnull=False),
                name="unique_crm_contact_property_relationship",
            ),
            models.UniqueConstraint(
                fields=["contact", "development_name", "unit_reference", "relationship"],
                condition=Q(property__isnull=True) & ~Q(unit_reference=""),
                name="unique_crm_contact_external_unit",
            ),
        ]


class CRMOpportunity(TimeStamped):
    class Stage(models.TextChoices):
        NEW = "new", "Lead recebido"
        CONTACTED = "contacted", "Contato realizado"
        VISIT = "visit", "Visita agendada"
        PROPOSAL = "proposal", "Proposta enviada"
        NEGOTIATION = "negotiation", "Negociação"
        WON = "won", "Fechado"
        LOST = "lost", "Perdido"
        PAUSED = "paused", "Pausado"

    contact = models.ForeignKey(CRMContact, on_delete=models.CASCADE, related_name="opportunities")
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_opportunities")
    source_lead = models.OneToOneField(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_opportunity")
    title = models.CharField(max_length=200)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.NEW, db_index=True)
    broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_opportunities")
    expected_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=80, default="manual", db_index=True)
    next_action_at = models.DateTimeField(null=True, blank=True, db_index=True)
    loss_reason = models.CharField(max_length=240, blank=True)
    notes = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["stage", "broker"])]


class CRMTask(TimeStamped):
    class Kind(models.TextChoices):
        FOLLOW_UP = "follow_up", "Follow-up"
        CALL = "call", "Ligação"
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "E-mail"
        VISIT = "visit", "Visita"
        OTHER = "other", "Outro"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        COMPLETED = "completed", "Concluída"
        CANCELED = "canceled", "Cancelada"

    contact = models.ForeignKey(CRMContact, on_delete=models.CASCADE, related_name="tasks")
    opportunity = models.ForeignKey(CRMOpportunity, null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_tasks")
    broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_tasks")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.FOLLOW_UP)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_at"]


class CRMNotification(TimeStamped):
    class Kind(models.TextChoices):
        ASSIGNMENT = "assignment", "Nova atribuição"
        TASK_DUE = "task_due", "Tarefa próxima"
        TASK_OVERDUE = "task_overdue", "Tarefa atrasada"
        OPPORTUNITY = "opportunity", "Oportunidade"
        SYSTEM = "system", "Sistema"

    class Priority(models.TextChoices):
        LOW = "low", "Baixa"
        NORMAL = "normal", "Normal"
        HIGH = "high", "Alta"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="crm_notifications")
    broker = models.ForeignKey(Broker, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    source_task = models.ForeignKey(CRMTask, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SYSTEM, db_index=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL, db_index=True)
    title = models.CharField(max_length=180)
    message = models.TextField(blank=True)
    link = models.CharField(max_length=240, blank=True)
    unique_key = models.CharField(max_length=240, null=True, blank=True, unique=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at", "created_at"])]


class CRMActivity(TimeStamped):
    class Kind(models.TextChoices):
        NOTE = "note", "Observação"
        CALL = "call", "Ligação"
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "E-mail"
        VISIT = "visit", "Visita"
        STAGE_CHANGE = "stage_change", "Mudança de etapa"
        PROPOSAL = "proposal", "Proposta"
        IMPORT = "import", "Importação"

    contact = models.ForeignKey(CRMContact, on_delete=models.CASCADE, related_name="activities")
    opportunity = models.ForeignKey(CRMOpportunity, null=True, blank=True, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.NOTE, db_index=True)
    description = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]


class CRMProposal(TimeStamped):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        SENT = "sent", "Enviada"
        ANALYSIS = "analysis", "Em análise"
        COUNTER = "counter", "Contraproposta"
        ACCEPTED = "accepted", "Aceita"
        REJECTED = "rejected", "Recusada"
        EXPIRED = "expired", "Expirada"

    opportunity = models.ForeignKey(CRMOpportunity, on_delete=models.CASCADE, related_name="proposals")
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    total_value = models.DecimalField(max_digits=14, decimal_places=2)
    down_payment = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    financing_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    installments = models.JSONField(default=list, blank=True)
    annual_reinforcements = models.JSONField(default=list, blank=True)
    exchanges = models.JSONField(default=list, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-version", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["opportunity", "version"], name="unique_crm_proposal_version")]


class CRMImportBatch(TimeStamped):
    class Status(models.TextChoices):
        PROCESSING = "processing", "Processando"
        REVIEW = "review", "Aguardando revisão"
        COMMITTED = "committed", "Importado"
        FAILED = "failed", "Falhou"

    file = models.FileField(upload_to="quarantine/crm-imports/%Y/%m/")
    original_name = models.CharField(max_length=255)
    source_hash = models.CharField(max_length=64, db_index=True)
    source_label = models.CharField(max_length=160, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING, db_index=True)
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    imported_rows = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]


class CRMImportRow(TimeStamped):
    class Status(models.TextChoices):
        VALID = "valid", "Pronto"
        DUPLICATE = "duplicate", "Possível duplicidade"
        ERROR = "error", "Com erro"
        IMPORTED = "imported", "Importado"
        IGNORED = "ignored", "Ignorado"

    batch = models.ForeignKey(CRMImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField()
    raw_data = models.JSONField(default=dict)
    normalized_data = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)
    errors = models.JSONField(default=list, blank=True)
    matched_contact = models.ForeignKey(CRMContact, null=True, blank=True, on_delete=models.SET_NULL, related_name="import_rows")
    matched_property = models.ForeignKey(Property, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_import_rows")

    class Meta:
        ordering = ["row_number"]
        constraints = [models.UniqueConstraint(fields=["batch", "row_number"], name="unique_crm_import_row")]


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
    hero_video = models.FileField(upload_to="content/hero-video/%Y/%m/", blank=True)
    hero_poster = models.ImageField(upload_to="content/hero-video/%Y/%m/", blank=True)
    hero_video_enabled = models.BooleanField(default=False)


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
