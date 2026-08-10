from django.db import migrations, models


def normalize_name(value):
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    words = []
    for word in normalized.split():
        word = word.replace("ph", "f").replace("qu", "k")
        word = word.replace("y", "i").replace("q", "k")
        word = re.sub(r"c(?=[aou])", "k", word)
        word = re.sub(r"c(?=[ei])", "s", word)
        word = re.sub(r"(.)\1+", r"\1", word)
        words.append(word)
    return " ".join(words)


def populate_search_names(apps, schema_editor):
    Contact = apps.get_model("core", "CRMContact")
    for contact in Contact.objects.only("id", "name").iterator(chunk_size=500):
        Contact.objects.filter(pk=contact.pk).update(search_name=normalize_name(contact.name))


class Migration(migrations.Migration):
    dependencies = [("core", "0012_broker_role_broker_user_crmnotification")]

    operations = [
        migrations.AddField(
            model_name="broker",
            name="can_manage_properties",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="crmcontact",
            name="search_name",
            field=models.CharField(blank=True, db_index=True, editable=False, max_length=200),
        ),
        migrations.RunPython(populate_search_names, migrations.RunPython.noop),
    ]
