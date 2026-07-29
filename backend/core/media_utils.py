import io
import os

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pi_heif import register_heif_opener
from rest_framework.exceptions import ValidationError

register_heif_opener()
HEIF_EXTENSIONS = {".heic", ".heif"}
HEIF_MIME_TYPES = {
    "application/octet-stream",
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
}
HEIF_BRANDS = {
    b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis",
    b"hevm", b"hevs", b"mif1", b"msf1",
}
MAX_IMAGE_PIXELS = 80_000_000


def _has_heif_signature(upload):
    upload.seek(0)
    header = upload.read(64)
    upload.seek(0)
    if len(header) < 12 or header[4:8] != b"ftyp":
        return False
    brands = {header[8:12]}
    brands.update(header[i:i + 4] for i in range(16, len(header) - 3, 4))
    return bool(brands & HEIF_BRANDS)


def normalize_uploaded_image(upload, *, max_bytes):
    if not upload:
        return upload
    if upload.size > max_bytes:
        limit = max_bytes // (1024 * 1024)
        raise ValidationError(f"A imagem deve ter no máximo {limit} MB.")
    if os.path.splitext(upload.name)[1].lower() not in HEIF_EXTENSIONS:
        return upload
    mime_type = (upload.content_type or "").lower()
    if mime_type not in HEIF_MIME_TYPES:
        raise ValidationError("O tipo do arquivo HEIC/HEIF não corresponde à extensão.")
    if not _has_heif_signature(upload):
        raise ValidationError("A foto HEIC/HEIF é inválida ou está corrompida.")

    try:
        with Image.open(upload) as source:
            source.load()
            width, height = source.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise ValidationError("A resolução da foto é muito alta para processamento seguro.")
            oriented = ImageOps.exif_transpose(source)
            if oriented.mode in {"RGBA", "LA"}:
                rgba = oriented.convert("RGBA")
                converted = Image.new("RGB", rgba.size, "white")
                converted.paste(rgba, mask=rgba.getchannel("A"))
            else:
                converted = oriented.convert("RGB")
            output = io.BytesIO()
            converted.save(output, format="JPEG", quality=90, optimize=True)
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        message = "Não foi possível abrir a foto do iPhone. Tente selecioná-la novamente."
        raise ValidationError(message) from exc
    finally:
        upload.seek(0)

    stem = os.path.splitext(os.path.basename(upload.name))[0] or "foto-iphone"
    converted_file = ContentFile(output.getvalue(), name=f"{stem}.jpg")
    converted_file.content_type = "image/jpeg"
    return converted_file
