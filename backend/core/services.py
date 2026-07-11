import hashlib
import mimetypes
import re
import tempfile
import zipfile
from decimal import Decimal
from pathlib import Path
from django.core.files import File
from django.db import transaction
from django.utils.text import slugify
from .models import AuditEvent, ImportJob, Media, Property

ALLOWED = {".jpg": Media.Kind.IMAGE, ".jpeg": Media.Kind.IMAGE, ".png": Media.Kind.IMAGE, ".webp": Media.Kind.IMAGE, ".mp4": Media.Kind.VIDEO, ".pdf": Media.Kind.DOCUMENT}
MAX_FILES = 250
MAX_FILE_SIZE = 300 * 1024 * 1024
MAX_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100

def validate_and_extract_zip(zip_path, destination):
    destination = Path(destination).resolve()
    total_size = 0
    with zipfile.ZipFile(zip_path) as archive:
        members = archive.infolist()
        if len(members) > MAX_FILES: raise ValueError("Quantidade de arquivos excedida.")
        for member in members:
            member_path = (destination / member.filename).resolve()
            if destination not in member_path.parents and member_path != destination:
                raise ValueError("Caminho inseguro no ZIP.")
            if member.is_dir(): continue
            total_size += member.file_size
            if total_size > MAX_UNCOMPRESSED_SIZE: raise ValueError("Tamanho descompactado excedido.")
            if member.file_size > MAX_FILE_SIZE: raise ValueError("Arquivo do ZIP excede o limite.")
            if member.compress_size and member.file_size / member.compress_size > MAX_COMPRESSION_RATIO:
                raise ValueError("Taxa de compressão insegura.")
            if Path(member.filename).suffix.lower() not in set(ALLOWED) | {".txt"}:
                raise ValueError("Formato não permitido no ZIP.")
        archive.extractall(destination)
    return destination

def import_property_zip(zip_path):
    with tempfile.TemporaryDirectory() as temp:
        root = validate_and_extract_zip(zip_path, temp)
        children = [item for item in root.iterdir() if item.is_dir()]
        import_root = children[0] if len(children) == 1 else root
        return import_property_folder(import_root)

def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()

def hydrate_imported_media(job):
    for media in job.property.media.filter(file=""):
        source = Path(media.source_path)
        if source.is_file():
            with source.open("rb") as stream:
                media.file.save(source.name, File(stream), save=True)

def extract_property_description(text):
    normalized = text.replace("\ufeff", "").strip()
    clean_lines = [
        re.sub(r"^[\s*▪️✅\-—⁠]+|[\s*]+$", "", line).strip()
        for line in normalized.splitlines()
        if re.sub(r"[\s\-—_]", "", line)
    ]
    suggestions = {}
    patterns = {
        "price": r"R\$\s*([\d.]+(?:,\d{2})?)",
        "bedrooms": r"(\d{1,2})\s*dormit",
        "suites": r"(\d{1,2})\s*su[ií]te",
        "private_area": r"(\d+(?:[.,]\d+)?)\s*m[²2](?:\s+(?:constru[ií]dos?|de\s+[aá]rea\s+privativa))?",
        "land_dimensions": r"terreno\s+(\d+\s*x\s*\d+)",
        "neighborhood": r"bairro:\s*([^\n\r*]+)",
        "private_address": r"(?:rua:?\s*)?((?:rua|estrada|avenida|av\.)\s+[^\n\r,*]+(?:,\s*\d+)?)",
        "phone": r"(\d{2}[-\s]?\d{4,5}[.\-\s]?\d{2}[.\-\s]?\d{2})",
        "private_commission": r"(?:\+\s*)?(\d+\s*%)",
    }
    for field, pattern in patterns.items():
        match = re.search(pattern, normalized, re.I)
        if match:
            value = match.group(1).strip()
            if field == "price":
                decimal_value = Decimal(value.replace(".", "").replace(",", "."))
                value = str(decimal_value.quantize(Decimal("0.01")))
            elif field in {"bedrooms", "suites"}: value = int(value)
            elif field == "private_area": value = value.replace(",", ".")
            suggestions[field] = {"value": value, "source": match.group(0), "confidence": "high"}
    city_names = {"xangri-lá": "Xangri-Lá", "xangri-la": "Xangri-Lá", "capão da canoa": "Capão da Canoa", "capao da canoa": "Capão da Canoa"}
    for candidate, value in city_names.items():
        match = re.search(rf"\b{re.escape(candidate)}\b", normalized, re.I)
        if match:
            suggestions["city"] = {"value": value, "source": match.group(0), "confidence": "high"}
            break
    if clean_lines:
        title_line = clean_lines[0]
        if re.search(r"^(novidade\s+)?[àa]\s+venda$", title_line, re.I) and len(clean_lines) > 1:
            title_line = clean_lines[1]
        suggestions["title"] = {"value": title_line.title(), "source": title_line, "confidence": "medium"}
    property_type = "Sobrado" if re.search(r"\bsobrado\b", normalized, re.I) else "Casa"
    suggestions["property_type"] = {"value": property_type, "source": property_type, "confidence": "medium"}
    condo = re.search(r"(?:condom[ií]nio\s+)?((?:cap[aã]o ilhas|zen concept|amare home)[^\n\r.]*)", normalized, re.I)
    if condo and "neighborhood" not in suggestions:
        condo_name = condo.group(1).strip(" *-—").title()
        suggestions["neighborhood"] = {"value": condo_name, "source": condo.group(0), "confidence": "medium"}
    parking = re.search(r"(?:abrigo|vaga|garagem)[^\n\r]*?(?:para|p/)?\s*(\d+|dois|tr[eê]s|quatro)\s*carros?", normalized, re.I)
    if parking:
        words = {"dois": 2, "três": 3, "tres": 3, "quatro": 4}
        raw = parking.group(1).lower()
        suggestions["parking_spaces"] = {"value": int(raw) if raw.isdigit() else words[raw], "source": parking.group(0), "confidence": "medium"}
    reference = re.search(r"pr[oó]xim[ao]\s+ao\s+([^\n\r]+)", normalized, re.I)
    if reference: suggestions["public_reference"] = {"value": f"Próxima ao {reference.group(1).strip()}", "source": reference.group(0), "confidence": "medium"}
    feature_names = ["beira lago", "frente lago", "lado mar", "frente leste", "lareira", "churrasqueira", "mobiliada", "decorada", "climatizada", "elevador", "piscina", "lavabo", "paisagismo", "irrigação", "pé direito duplo", "persianas elétricas", "cortinas elétricas", "depósito", "varanda"]
    features = [name for name in feature_names if name in normalized.lower()]
    if features: suggestions["features"] = {"value": features, "source": features, "confidence": "high"}
    if re.search(r"n[aã]o aceita im[oó]veis", normalized, re.I): suggestions["accepts_exchange"] = {"value": False, "source": "Não aceita imóveis", "confidence": "high"}
    elif re.search(r"(?:aceita|aceitamos|recebe|estudo)\s+(?:im[oó]vel|da[cç][aã]o)", normalized, re.I):
        suggestions["accepts_exchange"] = {"value": True, "source": "Aceita imóvel/dação", "confidence": "medium"}
    suggestions["public_description"] = {"value": normalized, "source": "Texto original", "confidence": "high"}
    return suggestions

@transaction.atomic
def import_property_folder(source_path):
    root = Path(source_path).resolve()
    if not root.is_dir(): raise ValueError("Pasta de importação inexistente.")
    files = [p for p in root.rglob("*") if p.is_file()]
    if len(files) > MAX_FILES: raise ValueError("Quantidade de arquivos excedida.")
    source_hash = hashlib.sha256("|".join(f"{p.relative_to(root)}:{p.stat().st_size}" for p in sorted(files)).encode()).hexdigest()
    existing = ImportJob.objects.filter(source_hash=source_hash).first()
    if existing:
        hydrate_imported_media(existing)
        return existing
    text_path = root / "DESCRICAO.txt"
    text = text_path.read_text(encoding="utf-8", errors="replace") if text_path.exists() else ""
    suggestions = extract_property_description(text)
    values = {key: data["value"] for key, data in suggestions.items() if key in {"price", "bedrooms", "suites", "private_area", "land_dimensions", "neighborhood", "private_address", "city", "public_reference", "features", "accepts_exchange", "private_commission"}}
    values.update(title=root.name.title(), slug=slugify(root.name), public_description=text, source="folder-import", status=Property.Status.DRAFT, published=False)
    prop = Property.objects.create(**values)
    job = ImportJob.objects.create(source_path=str(root), source_hash=source_hash, status=ImportJob.Status.PROCESSING, property=prop, suggestions=suggestions)
    primary_set = False
    errors = []
    for position, path in enumerate(files):
        extension = path.suffix.lower()
        if extension not in ALLOWED or path.name == "DESCRICAO.txt": continue
        if path.stat().st_size > MAX_FILE_SIZE:
            errors.append(f"Arquivo excede o limite: {path.name}"); continue
        digest = sha256_file(path)
        kind = ALLOWED[extension]
        Media.objects.create(property=prop, kind=kind, source_path=str(path), position=position, is_primary=kind == Media.Kind.IMAGE and not primary_set, sha256=digest, mime_type=mimetypes.guess_type(path)[0] or "application/octet-stream", size=path.stat().st_size, status=Media.Status.READY)
        if kind == Media.Kind.IMAGE: primary_set = True
    job.status = ImportJob.Status.REVIEW
    job.errors = errors
    job.save(update_fields=["status", "errors", "updated_at"])
    hydrate_imported_media(job)
    AuditEvent.objects.create(action="property.imported", entity_type="Property", entity_id=str(prop.id), metadata={"files": len(files)})
    return job
