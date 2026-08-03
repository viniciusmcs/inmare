import csv
import hashlib
import io
import re
import unicodedata
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q

from .models import (
    CRMActivity,
    CRMContact,
    CRMImportBatch,
    CRMImportRow,
    CRMOpportunity,
    CRMPropertyLink,
    normalize_document,
    normalize_email,
    normalize_phone,
)

MAX_CRM_IMPORT_SIZE = 15 * 1024 * 1024
ALLOWED_CRM_IMPORT_EXTENSIONS = {".csv", ".pdf"}


def file_sha256(upload):
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def validate_crm_import(upload):
    extension = Path(upload.name).suffix.casefold()
    if extension not in ALLOWED_CRM_IMPORT_EXTENSIONS:
        raise ValueError("Envie um arquivo CSV ou PDF.")
    if upload.size > MAX_CRM_IMPORT_SIZE:
        raise ValueError("O arquivo de importação deve ter no máximo 15 MB.")
    signature = upload.read(8)
    upload.seek(0)
    content_type = (upload.content_type or "").casefold()
    if extension == ".pdf" and (not signature.startswith(b"%PDF-") or content_type not in {"application/pdf", "application/octet-stream"}):
        raise ValueError("O arquivo não é um PDF válido.")
    if extension == ".csv" and b"\x00" in signature:
        raise ValueError("O CSV contém dados binários inválidos.")
    return extension


def _key(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    return re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")


CSV_ALIASES = {
    "name": {"nome", "cliente", "condomino", "proprietario", "razao_social"},
    "document": {"cpf", "cnpj", "cpf_cnpj", "documento"},
    "phone": {"celular", "telefone", "whatsapp", "fone"},
    "email": {"email", "e_mail"},
    "address": {"endereco", "logradouro"},
    "city": {"cidade", "municipio"},
    "state": {"uf", "estado"},
    "postal_code": {"cep"},
    "unit_reference": {"lote", "unidade", "economia", "imovel"},
    "development_name": {"condominio", "empreendimento"},
}


def _canonical_csv_row(row):
    normalized = {_key(key): value for key, value in row.items() if key}
    result = {}
    for field, aliases in CSV_ALIASES.items():
        result[field] = next((normalized[alias] for alias in aliases if normalized.get(alias)), "")
    return result


def parse_csv(upload):
    raw = upload.read()
    upload.seek(0)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise ValueError("O CSV não possui cabeçalho.")
    return [_canonical_csv_row(row) for row in reader if any((value or "").strip() for value in row.values())]


def parse_pdf(upload):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("O leitor de PDF não está instalado no servidor.") from exc
    reader = PdfReader(upload)
    text = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
    upload.seek(0)
    rows = []
    lines = [line.rstrip() for line in text.splitlines()]
    header_pattern = re.compile(r"^\s*(?P<number>[1-9]\d{0,3})\s+(?P<name>.+?)(?P<unit>Lote\s+.+|Casa em Condomínio\s+.+)\s*$")
    reversed_header_pattern = re.compile(r"^\s*(?P<number>[1-9]\d{0,3})\s+(?P<unit>Lote\s+\S+)\s+(?P<name>.+?)\s*$")
    for index, line in enumerate(lines):
        match = header_pattern.match(line) or reversed_header_pattern.match(line)
        if not match:
            continue
        following = [item.strip() for item in lines[index + 1:index + 9] if item.strip()]
        if len(following) < 2:
            continue
        location_parts = [part.strip() for part in re.split(r"\s{2,}", following[0]) if part.strip()]
        postal_match = re.search(r"(\d{5}-?\d{3})\s*$", following[0])
        postal_code = postal_match.group(1) if postal_match else ""
        if len(location_parts) >= 3:
            city_state = location_parts[-2].rsplit(" - ", 1)
            address = " ".join(location_parts[:-2])
        else:
            without_postal = following[0][:postal_match.start()].rstrip() if postal_match else following[0]
            city_match = re.search(r"([A-ZÀ-Ü][A-ZÀ-Ü -]+?)\s*-\s*([A-Z]{2})\s*$", without_postal)
            city_state = [city_match.group(1).strip(), city_match.group(2)] if city_match else [""]
            address = without_postal[:city_match.start()].strip() if city_match else without_postal.strip()
        contact_line = next((item for item in following[1:] if item.startswith("CPF:")), "")
        contact_match = re.match(
            r"CPF:\s*(?P<document>.*?)\s*Cel\.:\s*(?P<cell>.*?)\s*Tel\.:\s*(?P<telephone>.*?)\s*Email:\s*(?P<email>.*)$",
            contact_line,
        )
        if not contact_match:
            continue
        cell = contact_match.group("cell").strip() or contact_match.group("telephone").strip()
        rows.append({
            "name": match.group("name"),
            "document": contact_match.group("document"),
            "phone": cell,
            "email": contact_match.group("email"),
            "address": address,
            "city": city_state[0],
            "state": city_state[1] if len(city_state) == 2 else "",
            "postal_code": postal_code,
            "unit_reference": match.group("unit"),
            "development_name": "Riviera",
            "source_row": int(match.group("number")),
        })
    if not rows:
        raise ValueError("Não foi possível reconhecer registros de clientes neste PDF.")
    return rows


def sanitize_import_row(raw):
    name = " ".join((raw.get("name") or "").split())
    document = normalize_document(raw.get("document"))
    phone = normalize_phone(raw.get("phone"))
    email = normalize_email(raw.get("email"))
    errors = []
    if not name:
        errors.append("Nome não informado.")
    if document and len(document) not in (11, 14):
        errors.append("CPF/CNPJ possui quantidade inválida de dígitos.")
    if email:
        try:
            validate_email(email)
        except DjangoValidationError:
            errors.append("E-mail precisa de revisão.")
    if phone and len(phone) < 10:
        errors.append("Telefone precisa de revisão.")
    normalized = {
        "name": name,
        "document": document or "",
        "person_type": CRMContact.PersonType.COMPANY if document and len(document) == 14 else CRMContact.PersonType.INDIVIDUAL,
        "phone": phone,
        "email": email,
        "address": " ".join((raw.get("address") or "").split()),
        "city": " ".join((raw.get("city") or "").split()),
        "state": (raw.get("state") or "").strip().upper()[:2],
        "postal_code": re.sub(r"\D", "", raw.get("postal_code") or ""),
        "unit_reference": " ".join((raw.get("unit_reference") or "").split()),
        "development_name": " ".join((raw.get("development_name") or "").split()),
    }
    return normalized, errors


def find_duplicate_contact(data):
    query = Q()
    if data.get("document"):
        query |= Q(document=data["document"])
    if data.get("phone"):
        query |= Q(normalized_phone=data["phone"])
    if data.get("email"):
        query |= Q(normalized_email=data["email"])
    return CRMContact.objects.filter(query).first() if query else None


def contact_identity_keys(data):
    """Return stable identifiers ordered from strongest to weakest."""
    keys = []
    if data.get("document"):
        keys.append(("document", data["document"]))
    if data.get("email"):
        keys.append(("email", data["email"]))
    if data.get("phone"):
        keys.append(("phone", data["phone"]))
    return keys


def find_duplicate_import_row(batch, data, exclude_id=None):
    wanted = set(contact_identity_keys(data))
    if not wanted:
        return None
    rows = batch.rows.exclude(pk=exclude_id).exclude(status=CRMImportRow.Status.IGNORED).order_by("row_number")
    for candidate in rows:
        if wanted.intersection(contact_identity_keys(candidate.normalized_data)):
            return candidate
    return None


@transaction.atomic
def process_import_batch(batch):
    batch.status = CRMImportBatch.Status.PROCESSING
    batch.save(update_fields=["status", "updated_at"])
    try:
        extension = Path(batch.original_name).suffix.casefold()
        with batch.file.open("rb") as upload:
            rows = parse_pdf(upload) if extension == ".pdf" else parse_csv(upload)
        if len(rows) > 5000:
            raise ValueError("A importação permite no máximo 5.000 registros por arquivo.")
        batch.rows.all().delete()
        created = []
        seen_identities = {}
        for position, raw in enumerate(rows, start=1):
            normalized, errors = sanitize_import_row(raw)
            duplicate = find_duplicate_contact(normalized)
            row_number = raw.get("source_row") or position
            duplicate_of_row = next(
                (seen_identities[key] for key in contact_identity_keys(normalized) if key in seen_identities),
                None,
            )
            if duplicate_of_row:
                normalized["duplicate_of_row"] = duplicate_of_row
            row_status = (
                CRMImportRow.Status.ERROR if errors else
                CRMImportRow.Status.DUPLICATE if duplicate or duplicate_of_row else
                CRMImportRow.Status.VALID
            )
            created.append(CRMImportRow(
                batch=batch,
                row_number=row_number,
                raw_data=raw,
                normalized_data=normalized,
                status=row_status,
                errors=errors,
                matched_contact=duplicate,
            ))
            if not errors and not duplicate_of_row:
                for key in contact_identity_keys(normalized):
                    seen_identities.setdefault(key, row_number)
        CRMImportRow.objects.bulk_create(created)
        batch.total_rows = len(created)
        batch.valid_rows = sum(row.status == CRMImportRow.Status.VALID for row in created)
        batch.duplicate_rows = sum(row.status == CRMImportRow.Status.DUPLICATE for row in created)
        batch.error_rows = sum(row.status == CRMImportRow.Status.ERROR for row in created)
        batch.status = CRMImportBatch.Status.REVIEW
        batch.errors = []
    except Exception as exc:
        batch.status = CRMImportBatch.Status.FAILED
        batch.errors = [str(exc)]
    batch.save(update_fields=["status", "total_rows", "valid_rows", "duplicate_rows", "error_rows", "errors", "updated_at"])
    return batch


def _merge_missing_contact_data(contact, data):
    changed = []
    for field in ("phone", "email", "address", "city", "state", "postal_code"):
        if not getattr(contact, field) and data.get(field):
            setattr(contact, field, data[field])
            changed.append(field)
    if contact.profile == CRMContact.Profile.GENERAL:
        contact.profile = CRMContact.Profile.OWNER
        changed.append("profile")
    if changed:
        contact.save(update_fields=changed + ["normalized_phone", "normalized_email", "updated_at"])
    return contact


def _link_imported_unit(contact, row, data):
    if not (row.matched_property or data.get("unit_reference")):
        return
    CRMPropertyLink.objects.get_or_create(
        contact=contact,
        property=row.matched_property,
        relationship=CRMPropertyLink.Relationship.OWNER,
        development_name="" if row.matched_property else data.get("development_name", ""),
        unit_reference="" if row.matched_property else data.get("unit_reference", ""),
    )


@transaction.atomic
def commit_import_batch(batch, actor=None):
    if batch.status != CRMImportBatch.Status.REVIEW:
        raise ValueError("Somente importações revisadas podem ser confirmadas.")
    if batch.rows.filter(status=CRMImportRow.Status.ERROR).exists():
        raise ValueError("Revise ou ignore todos os registros com erro antes de confirmar.")
    imported = 0
    rows = list(batch.rows.select_for_update().select_related("matched_contact", "matched_property"))
    # Only ready/new rows can create contacts. Duplicate rows are never merged or
    # counted as imported contacts.
    for row in rows:
        if row.status != CRMImportRow.Status.VALID:
            continue
        data = row.normalized_data
        contact = find_duplicate_contact(data)
        if contact:
            row.matched_contact = contact
            row.status = CRMImportRow.Status.DUPLICATE
            row.save(update_fields=["matched_contact", "status", "updated_at"])
            continue
        contact = CRMContact.objects.create(
            name=data["name"], person_type=data["person_type"], document=data.get("document") or None,
            phone=data.get("phone", ""), email=data.get("email", ""), address=data.get("address", ""),
            city=data.get("city", ""), state=data.get("state", ""), postal_code=data.get("postal_code", ""),
            profile=CRMContact.Profile.OWNER, source="import", source_detail=batch.source_label or batch.original_name,
        )
        _link_imported_unit(contact, row, data)
        CRMActivity.objects.create(
            contact=contact,
            actor=actor,
            kind=CRMActivity.Kind.IMPORT,
            description=f"Contato importado de {batch.source_label or batch.original_name}.",
            metadata={"batch_id": str(batch.id), "row_number": row.row_number},
        )
        row.matched_contact = contact
        row.status = CRMImportRow.Status.IMPORTED
        row.save(update_fields=["matched_contact", "status", "updated_at"])
        imported += 1

    # A repeated owner can legitimately reference another unit. Preserve that
    # relationship without creating or updating the duplicated contact.
    for row in rows:
        if row.status != CRMImportRow.Status.DUPLICATE:
            continue
        contact = row.matched_contact or find_duplicate_contact(row.normalized_data)
        if contact:
            _link_imported_unit(contact, row, row.normalized_data)
            if row.matched_contact_id != contact.id:
                row.matched_contact = contact
                row.save(update_fields=["matched_contact", "updated_at"])
    batch.duplicate_rows = batch.rows.filter(status=CRMImportRow.Status.DUPLICATE).count()
    batch.status = CRMImportBatch.Status.COMMITTED
    batch.imported_rows = imported
    batch.save(update_fields=["status", "imported_rows", "duplicate_rows", "updated_at"])
    return imported


@transaction.atomic
def sync_lead_to_crm(lead):
    phone = normalize_phone(lead.phone)
    email = normalize_email(lead.email)
    query = Q()
    if phone:
        query |= Q(normalized_phone=phone)
    if email:
        query |= Q(normalized_email=email)
    contact = CRMContact.objects.filter(query).first() if query else None
    if not contact:
        contact = CRMContact.objects.create(
            name=lead.name,
            phone=phone,
            email=email,
            source=lead.origin,
            marketing_consent=lead.consent,
            assigned_broker=lead.broker,
        )
    opportunity, created = CRMOpportunity.objects.get_or_create(
        source_lead=lead,
        defaults={
            "contact": contact,
            "property": lead.property,
            "title": f"{lead.name} — {lead.property.title if lead.property else 'Atendimento geral'}",
            "broker": lead.broker,
            "source": lead.origin,
            "notes": lead.message,
        },
    )
    if created:
        CRMActivity.objects.create(
            contact=contact,
            opportunity=opportunity,
            kind=CRMActivity.Kind.NOTE,
            description=f"Lead recebido pelo site: {lead.message}",
            metadata={"lead_id": str(lead.id), "origin": lead.origin},
        )
    return contact, opportunity
