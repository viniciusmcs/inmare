import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  GripVertical,
  Handshake,
  ImagePlus,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Plus,
  Save,
  Settings,
  Rocket,
  Star,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "./api";
import type { FAQ, HeroSlide, InstitutionalImage, Lead, Page, Property, PublicContent, SiteSettings, Testimonial } from "./types";

const reviewLabels: Record<string, string> = {
  green: "Novo",
  yellow: "Atenção: revisar",
  red: "Revisão urgente",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  negotiating: "Em atendimento",
  sold: "Vendido",
  rented: "Alugado",
  archived: "Arquivado",
};

const fieldLabels: Record<string, string> = {
  title: "Título",
  slug: "Link do imóvel",
  public_description: "Descrição pública",
  property_type: "Tipo",
  purpose: "Finalidade",
  status: "Status",
  price: "Valor",
  condominium_fee: "Condomínio",
  iptu: "IPTU",
  price_on_request: "Consultar valor",
  city: "Cidade",
  neighborhood: "Bairro",
  public_reference: "Referência pública",
  approximate_latitude: "Latitude aproximada",
  approximate_longitude: "Longitude aproximada",
  private_address: "Endereço privado",
  bedrooms: "Dormitórios",
  suites: "Suítes",
  bathrooms: "Banheiros",
  parking_spaces: "Vagas",
  private_area: "Área privativa",
  total_area: "Área total",
  land_dimensions: "Dimensões do terreno",
  solar_orientation: "Orientação solar",
  features: "Características",
  accepts_financing: "Aceita financiamento",
  accepts_exchange: "Aceita permuta",
  featured: "Destaque",
  launch: "Lançamento",
  exclusive: "Exclusivo",
  reviewed_at: "Revisão comercial",
  image: "Imagem principal",
  file: "Arquivo",
  media_ids: "Ordem das mídias",
  name: "Nome",
  phone: "WhatsApp",
  email: "E-mail",
  message: "Mensagem",
  photo: "Foto",
  image_url: "URL da imagem",
  link_url: "Link",
  link_label: "Texto do botão",
  text: "Texto",
  question: "Pergunta",
  answer: "Resposta",
};

const decimalPlaces: Record<string, number> = {
  price: 2,
  condominium_fee: 2,
  iptu: 2,
  private_area: 2,
  total_area: 2,
  approximate_latitude: 6,
  approximate_longitude: 6,
};

const integerFields = new Set(["bedrooms", "suites", "bathrooms", "parking_spaces"]);

function fieldLabel(field: string) {
  return fieldLabels[field] ?? field.replaceAll("_", " ");
}

function normalizeDecimalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) return trimmed.replace(/\./g, "").replace(",", ".");
  return trimmed;
}

function localFormError(form: Record<string, string | boolean>) {
  for (const field of integerFields) {
    const value = String(form[field] ?? "").trim();
    if (!value) continue;
    if (!/^\d+$/.test(value)) return `${fieldLabel(field)}: informe apenas número inteiro, sem vírgula ou ponto.`;
  }
  for (const [field, places] of Object.entries(decimalPlaces)) {
    const raw = String(form[field] ?? "").trim();
    if (!raw) continue;
    const normalized = normalizeDecimalInput(raw);
    if (!/^-?\d+(\.\d+)?$/.test(normalized))
      return `${fieldLabel(field)}: digite apenas números. Exemplo: ${places === 2 ? "1000,50" : "-29,123456"}.`;
    const decimals = normalized.split(".")[1]?.length ?? 0;
    if (decimals > places)
      return `${fieldLabel(field)}: use no máximo ${places} casa${places > 1 ? "s" : ""} decimal${places > 1 ? "is" : ""}.`;
  }
  return "";
}

function flattenErrorMessages(data: unknown, path = ""): string[] {
  if (!data) return [];
  if (typeof data === "string") return [path ? `${path}: ${data}` : data];
  if (Array.isArray(data)) return data.flatMap((item) => flattenErrorMessages(item, path));
  if (typeof data === "object")
    return Object.entries(data as Record<string, unknown>).flatMap(([key, value]) =>
      flattenErrorMessages(value, path ? `${path}.${key}` : key),
    );
  return [String(data)];
}

function translateBackendMessage(field: string, message: string) {
  const key = field.split(".").pop() ?? field;
  const label = fieldLabel(key);
  const lower = message.toLowerCase();
  const places = decimalPlaces[field] ?? decimalPlaces[key];
  if (lower.includes("no more than") && lower.includes("decimal"))
    return `${label}: use no máximo ${places ?? 2} casas decimais.`;
  if (lower.includes("max_digits") || lower.includes("whole digits") || lower.includes("ensure that there are no more than"))
    return `${label}: o número está grande demais. Diminua a quantidade de dígitos.`;
  if (lower.includes("valid number") || lower.includes("número válido") || lower.includes("a valid number"))
    return `${label}: digite apenas números. Use vírgula para centavos, por exemplo 1000,50.`;
  if (lower.includes("required") || lower.includes("obrigatório") || lower.includes("blank"))
    return `${label}: preencha este campo antes de salvar.`;
  if (lower.includes("valid integer") || lower.includes("inteiro"))
    return `${label}: informe apenas número inteiro.`;
  if (lower.includes("valid choice") || lower.includes("escolha"))
    return `${label}: escolha uma opção válida da lista.`;
  if (lower.includes("valid date") || lower.includes("data"))
    return `${label}: informe uma data válida.`;
  if (lower.includes("duplicate") || lower.includes("duplicado"))
    return `${label}: este item já existe.`;
  return `${label}: ${message}`;
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function apiError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("required:"))
    return `Preencha os campos obrigatórios: ${error.message.slice(9)}.`;
  const response = error as { response?: { data?: unknown } };
  const data = response.response?.data;
  if (typeof data === "string")
    return "Não foi possível concluir. Confira os dados e tente novamente.";
  if (data && typeof data === "object") {
    const text = JSON.stringify(data).toLowerCase();
    if (text.includes("número válido") || text.includes("valid number"))
      return "Confira os campos de valor e medidas. Use apenas números.";
    if (text.includes("obrigatório") || text.includes("required"))
      return "Preencha os campos obrigatórios antes de continuar.";
    if (text.includes("publique o imóvel"))
      return "Publique o imóvel antes de colocá-lo em destaque.";
    if (text.includes("imagem principal"))
      return "Adicione e valide uma imagem principal antes de publicar.";
    if (text.includes("confirme a revisão"))
      return "Confirme a revisão do imóvel antes de publicar.";
    if (text.includes("duplicado"))
      return "Este arquivo já foi adicionado ao imóvel.";
  }
  return "Não foi possível concluir. Confira os dados e tente novamente.";
}

function friendlyApiError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("friendly:"))
    return error.message.slice(9);
  const response = error as { response?: { data?: unknown } };
  const data = response.response?.data;
  if (data && typeof data === "object") {
    const translated = flattenErrorMessages(data).map((entry) => {
      const separator = entry.indexOf(":");
      if (separator < 0) return entry;
      return translateBackendMessage(entry.slice(0, separator), entry.slice(separator + 1).trim());
    });
    if (translated.length) return translated.slice(0, 4).join(" ");
  }
  if (typeof data === "string" && data.trim()) return data;
  return apiError(error);
}

const blank: Record<string, string | boolean> = {
  title: "",
  public_description: "",
  property_type: "Casa",
  purpose: "sale",
  status: "draft",
  price: "",
  condominium_fee: "",
  iptu: "",
  price_on_request: false,
  city: "",
  neighborhood: "",
  public_reference: "",
  bedrooms: "",
  suites: "",
  bathrooms: "",
  parking_spaces: "",
  private_area: "",
  land_dimensions: "",
  private_address: "",
  private_commission: "",
  internal_notes: "",
  featured: false,
  launch: false,
  exclusive: false,
  approximate_latitude: "",
  approximate_longitude: "",
};

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Property | null>(null);
  const [section, setSection] = useState<"properties" | "clients" | "content">("properties");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>(blank);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    type: "",
    date: "",
  });
  useEffect(() => {
    if (!notice && !error) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notice, error]);
  useEffect(() => {
    setAdminMenuOpen(false);
  }, [section, selected?.id]);
  useEffect(() => {
    document.body.classList.toggle("admin-menu-open", adminMenuOpen);
    return () => document.body.classList.remove("admin-menu-open");
  }, [adminMenuOpen]);
  const properties = useQuery({
    queryKey: ["admin-properties"],
    enabled: authenticated !== false,
    retry: false,
    queryFn: async () => {
      try {
        const r = await api.get<Page<Property>>("/admin/properties/");
        setAuthenticated(true);
        return r.data.results;
      } catch (e) {
        setAuthenticated(false);
        throw e;
      }
    },
  });
  const leads = useQuery({
    queryKey: ["admin-leads"],
    enabled: authenticated === true,
    refetchInterval: 5000,
    queryFn: async () => (await api.get<Page<Lead>>("/admin/leads/")).data.results,
  });
  useEffect(() => {
    if (!selected) {
      setForm({ ...blank });
      return;
    }
    const source = selected as unknown as Record<string, unknown>;
    setForm(
      Object.fromEntries(
        Object.keys(blank).map((key) => {
          const value = source[key];
          return [
            key,
            typeof value === "boolean"
              ? value
              : value == null
                ? blank[key]
                : String(value),
          ];
        }),
      ),
    );
  }, [selected]);
  const login = useMutation({
    mutationFn: (d: { username: string; password: string }) =>
      api.post("/admin/auth/login/", d),
    onSuccess: () => {
      setAuthenticated(true);
      queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
    },
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
  const save = useMutation({
    mutationFn: async () => {
      const requiredFields: Record<string, string> = {
        title: "Título",
        property_type: "Tipo",
        city: "Cidade",
        neighborhood: "Bairro",
        purpose: "Finalidade",
        public_description: "Descrição pública",
      };
      const missing = Object.entries(requiredFields)
        .filter(([key]) => !String(form[key] ?? "").trim())
        .map(([, label]) => label);
      if (missing.length) throw new Error(`required:${missing.join(", ")}`);
      const friendlyValidation = localFormError(form);
      if (friendlyValidation) throw new Error(`friendly:${friendlyValidation}`);
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => {
          const numeric = [
            "bedrooms",
            "suites",
            "bathrooms",
            "parking_spaces",
            "private_area",
            "price",
            "condominium_fee",
            "iptu",
            "approximate_latitude",
            "approximate_longitude",
          ].includes(k);
          return [
            k,
            numeric && v === ""
              ? null
              : numeric && typeof v === "string"
                ? normalizeDecimalInput(v)
                : v,
          ];
        }),
      );
      payload.purpose = payload.purpose || "sale";
      payload.status = payload.status || "draft";
      payload.featured = payload.featured === true;
      payload.launch = payload.launch === true;
      payload.price_on_request = payload.price_on_request === true;
      return selected?.id
        ? api.patch<Property>(`/admin/properties/${selected.id}/`, payload)
        : api.post<Property>("/admin/properties/", payload);
    },
    onSuccess: ({ data }) => {
      setSelected(data);
      setNotice("Imóvel salvo com sucesso.");
      setError("");
      refresh();
    },
    onError: (saveError) => {
      setNotice("");
      setError(friendlyApiError(saveError));
    },
  });
  const action = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await api.post<Property | { property: Property; detail: string }>(
        `/admin/properties/${id}/${name}/`,
      );
      return "property" in response.data
        ? { property: response.data.property, detail: response.data.detail }
        : {
            property: response.data,
            detail:
              {
                "mark-sold": "Imóvel marcado como vendido e removido do site.",
                "restore-sale": "Venda desconfirmada. O imóvel voltou ao site.",
                "mark-in-service": "Imóvel marcado como em atendimento.",
                "remove-in-service": "Atendimento removido. O imóvel está disponível.",
                archive: "Imóvel arquivado e removido do site.",
                "restore-archive": "Imóvel restaurado e disponível novamente no site.",
                "toggle-featured": response.data.featured
                  ? "Imóvel adicionado aos destaques da Home."
                  : "Imóvel removido dos destaques da Home.",
                "toggle-launch": response.data.launch
                  ? "Imóvel destacado como lançamento."
                  : "Destaque de lançamento removido.",
                publish: "Imóvel publicado com sucesso.",
                "confirm-review": "Revisão confirmada com sucesso.",
              }[name] ?? "Operação concluída com sucesso.",
          };
    },
    onSuccess: ({ property, detail }) => {
      setSelected(property);
      setNotice(detail);
      setError("");
      refresh();
    },
    onError: (actionError) => setError(friendlyApiError(actionError)),
  });
  const updateLeadStatus = async (lead: Lead) => {
    try {
      const status = lead.status === "in_progress" ? "new" : "in_progress";
      await api.patch(`/admin/leads/${lead.id}/`, { status });
      setNotice(
        status === "in_progress"
          ? "Cliente marcado como em atendimento."
          : "Atendimento do cliente desmarcado.",
      );
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
    } catch (leadError) {
      setNotice("");
      setError(friendlyApiError(leadError));
    }
  };
  const deleteLead = async (lead: Lead) => {
    try {
      await api.delete(`/admin/leads/${lead.id}/`);
      setNotice("Cliente excluído com sucesso.");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
    } catch (leadError) {
      setNotice("");
      setError(friendlyApiError(leadError));
    }
  };
  const upload = async (file: File) => {
    if (!selected?.id) return;
    try {
      const data = new FormData();
      data.append("file", file);
      await api.post(`/admin/properties/${selected.id}/media/`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const r = await api.get<Property>(`/admin/properties/${selected.id}/`);
      setSelected(r.data);
      setNotice(`${file.name} adicionado com sucesso.`);
      setError("");
      refresh();
    } catch (uploadError) {
      setError(`${file.name}: ${friendlyApiError(uploadError)}`);
    }
  };
  const reorder = async (draggedId: string, targetId: string) => {
    if (!selected?.id) return;
    const media = [...selected.media];
    const from = media.findIndex((item) => item.id === draggedId);
    const to = media.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = media.splice(from, 1);
    media.splice(to, 0, moved);
    setSelected({ ...selected, media });
    try {
      const response = await api.post<Property>(
        `/admin/properties/${selected.id}/media-order/`,
        { media_ids: media.map((item) => item.id) },
      );
      setSelected(response.data);
      setNotice("Ordem das mídias atualizada.");
    } catch (reorderError) {
      setError(friendlyApiError(reorderError));
      const response = await api.get<Property>(`/admin/properties/${selected.id}/`);
      setSelected(response.data);
    }
  };
  const setPrimary = async (mediaId: string) => {
    if (!selected?.id) return;
    try {
      const response = await api.post<Property>(
        `/admin/properties/${selected.id}/media/${mediaId}/primary/`,
      );
      setSelected(response.data);
      setNotice("Foto principal atualizada.");
      refresh();
    } catch (primaryError) {
      setError(friendlyApiError(primaryError));
    }
  };
  const deleteMedia = async (mediaId: string) => {
    if (!selected?.id) return;
    try {
      const response = await api.delete<Property>(
        `/admin/properties/${selected.id}/media/${mediaId}/`,
      );
      setSelected(response.data);
      setNotice("Mídia excluída com sucesso.");
      setError("");
      refresh();
    } catch (deleteError) {
      setNotice("");
      setError(friendlyApiError(deleteError));
      throw deleteError;
    }
  };
  const deleteProperty = async () => {
    if (!selected?.id) return;
    try {
      await api.delete(`/admin/properties/${selected.id}/`);
      setSelected(null);
      setNotice("Imóvel excluído definitivamente.");
      setError("");
      refresh();
    } catch (deleteError) {
      setNotice("");
      setError(friendlyApiError(deleteError));
      throw deleteError;
    }
  };
  const importTxt = async (file: File) => {
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await api.post<{ values: Record<string, unknown> }>(
        "/admin/properties/txt-preview/",
        data,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const values = response.data.values;
      setForm((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            values[key] == null
              ? value
              : typeof values[key] === "boolean"
                ? values[key]
                : String(values[key]),
          ]),
        ),
      );
      setNotice("TXT importado. Confira os campos preenchidos antes de salvar.");
      setError("");
    } catch (txtError) {
      setError(friendlyApiError(txtError));
    }
  };
  if (authenticated === false)
    return <Login submit={(d) => login.mutate(d)} error={login.isError} />;
  const list = properties.data ?? [];
  const filteredList = list.filter((property) => {
    const search = filters.search.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch =
      !search ||
      [property.title, property.city, property.neighborhood, property.public_id]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(search));
    return (
      matchesSearch &&
      (!filters.status || property.status === filters.status) &&
      (!filters.type || property.property_type === filters.type) &&
      (!filters.date || property.created_at?.slice(0, 10) === filters.date)
    );
  });
  const propertyTypes = [...new Set(list.map((property) => property.property_type))].sort();
  return (
    <div className="admin">
      {(notice || error) && (
        <Toast
          message={error || notice}
          type={error ? "error" : "success"}
          onClose={() => {
            setNotice("");
            setError("");
          }}
        />
      )}
      <aside className={adminMenuOpen ? "open" : ""}>
        <button
          className="admin-mobile-menu"
          type="button"
          aria-label={adminMenuOpen ? "Fechar menu administrativo" : "Abrir menu administrativo"}
          aria-controls="admin-panel-nav"
          aria-expanded={adminMenuOpen}
          onClick={() => setAdminMenuOpen((open) => !open)}
        >
          {adminMenuOpen ? <X /> : <Menu />}
          <span>Menu do painel</span>
        </button>
        <img src="/assets/brand/logo-transparent.png" alt="In Mare" />
        <nav id="admin-panel-nav">
          <button onClick={() => { setSection("properties"); setSelected(null); setAdminMenuOpen(false); }}>
            <Building2 /> Imóveis
          </button>
          <button onClick={() => { setSection("clients"); setSelected(null); setAdminMenuOpen(false); }}>
            <Users /> Clientes
          </button>
          <button onClick={() => { setSection("content"); setSelected(null); setAdminMenuOpen(false); }}>
            <Settings /> Conteúdo e redes
          </button>
          <Link to="/" onClick={() => setAdminMenuOpen(false)}>
            <ArrowLeft /> Ver site
          </Link>
          <button
            onClick={async () => {
              setAdminMenuOpen(false);
              await api.post("/admin/auth/logout/");
              setAuthenticated(false);
            }}
          >
            <LogOut /> Sair
          </button>
        </nav>
      </aside>
      <main>
        <div className="admin-head">
          <div>
            <small>PAINEL ADMINISTRATIVO</small>
            <h1>{selected ? "Editar imóvel" : section === "clients" ? "Gestão de clientes" : section === "content" ? "Conteúdo e redes" : "Gestão de imóveis"}</h1>
          </div>
          {section === "properties" && <button
            className="gold-button"
            onClick={() =>
              setSelected({
                purpose: "sale",
                status: "draft",
                featured: false,
                launch: false,
                price_on_request: false,
              } as Property)
            }
          >
            <Plus /> Novo imóvel
          </button>}
        </div>
        {section === "content" ? (
          <ContentPanel notify={(message, failed = false) => failed ? setError(message) : setNotice(message)} />
        ) : section === "clients" ? (
          <ClientsPanel
            leads={leads.data ?? []}
            updateStatus={updateLeadStatus}
            deleteLead={deleteLead}
          />
        ) : !selected ? (
          <>
            <div className="metrics">
              {[
                ["Imóveis", list.length],
                ["Publicados", list.filter((p) => p.published).length],
                [
                  "Em revisão",
                  list.filter((p) => p.review_color !== "green").length,
                ],
                ["Destaques", list.filter((p) => p.featured).length],
              ].map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>
            <section className="admin-card">
              <h2>Imóveis cadastrados</h2>
              <div className="admin-filters">
                <label>
                  Buscar
                  <input
                    value={filters.search}
                    placeholder="Nome, cidade, bairro ou código"
                    onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={filters.status}
                    onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select
                    value={filters.type}
                    onChange={(event) => setFilters({ ...filters, type: event.target.value })}
                  >
                    <option value="">Todos</option>
                    {propertyTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  Data de cadastro
                  <input
                    type="date"
                    value={filters.date}
                    onChange={(event) => setFilters({ ...filters, date: event.target.value })}
                  />
                </label>
                <button
                  className="outline"
                  onClick={() => setFilters({ search: "", status: "", type: "", date: "" })}
                >
                  Limpar filtros
                </button>
              </div>
              <div className="table">
                {filteredList.map((p) => {
                  const commercialStatus =
                    p.status === "sold"
                      ? { label: "Vendido", className: "sold" }
                      : p.status === "archived"
                        ? { label: "Arquivado", className: "archived" }
                      : p.status === "negotiating"
                        ? { label: "Em atendimento", className: "service" }
                        : {
                            label:
                              p.review_label ??
                              reviewLabels[p.review_color] ??
                              p.review_color,
                            className: p.review_color,
                          };
                  return (
                  <button
                    className="property-row"
                    key={p.id}
                    onClick={() => setSelected(p)}
                  >
                    <img
                      src={
                        p.media.find((m) => m.is_primary)?.url ||
                        "/assets/property/WhatsApp Image 2026-06-08 at 13.57.42.jpeg"
                      }
                    />
                    <span>
                      <b>{p.title}</b>
                      <small>
                        {p.city} • {p.neighborhood} •{" "}
                        {statusLabels[p.status] ?? p.status}
                      </small>
                    </span>
                    <i className={commercialStatus.className}>
                      <b>{commercialStatus.label}</b>
                    </i>
                    <span className="row-action">
                      <em>Editar</em>
                      {p.created_at && (
                        <small>Cadastrado em {formatDate(p.created_at)}</small>
                      )}
                    </span>
                  </button>
                  );
                })}
                {!filteredList.length && (
                  <p className="filter-empty">Nenhum imóvel encontrado com estes filtros.</p>
                )}
              </div>
            </section>
          </>
        ) : (
          <Editor
            form={form}
            setForm={setForm}
            selected={selected}
            save={() => save.mutate()}
            upload={upload}
            reorder={reorder}
            setPrimary={setPrimary}
            deleteMedia={deleteMedia}
            deleteProperty={deleteProperty}
            importTxt={importTxt}
            action={(name) =>
              selected.id && action.mutate({ id: selected.id, name })
            }
            back={() => setSelected(null)}
            saving={save.isPending}
          />
        )}
      </main>
    </div>
  );
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div className={`admin-toast ${type}`} role="status">
      <button onClick={onClose} aria-label="Fechar aviso">×</button>
      {type === "success" ? <CheckCircle2 /> : <CircleAlert />}
      <span>{message}</span>
      <i />
    </div>
  );
}

function ClientsPanel({
  leads,
  updateStatus,
  deleteLead,
}: {
  leads: Lead[];
  updateStatus: (lead: Lead) => Promise<void>;
  deleteLead: (lead: Lead) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const leadStatus: Record<string, string> = {
    new: "Novo contato",
    in_progress: "Em atendimento",
    converted: "Convertido",
    discarded: "Descartado",
  };
  return (
    <section className="admin-card clients-panel">
      <div className="clients-heading">
        <div>
          <h2>Clientes que entraram em contato</h2>
          <p>{leads.length} solicitação(ões) recebida(s).</p>
        </div>
      </div>
      <div className="clients-grid">
        {leads.map((lead) => (
          <article key={lead.id} className="client-card">
            <header>
              <span>
                <b>{lead.name}</b>
                <small>{formatDate(lead.created_at)}</small>
              </span>
              <i className={lead.status}>{leadStatus[lead.status] ?? lead.status}</i>
            </header>
            <p className="client-property">
              <Building2 /> {lead.property_title || "Atendimento geral"}
            </p>
            <small className="client-origin">
              Origem: {lead.origin === "find" ? "Encontrar meu imóvel" : lead.origin === "announce" ? "Anuncie seu imóvel" : lead.origin === "visit" ? "Agendamento de visita" : "Contato do site"}
            </small>
            {lead.preferred_visit_date && <p className="visit-preference"><CalendarDays /> Visita preferida: {formatDate(lead.preferred_visit_date)} · {lead.preferred_visit_period}</p>}
            <p>{lead.message}</p>
            <div className="client-details">
              {lead.phone && <span>WhatsApp: +{lead.phone}</span>}
              {lead.email && <span>E-mail: {lead.email}</span>}
            </div>
            <div className="client-actions">
              {lead.phone && (
                <a
                  className="whatsapp-action"
                  href={`https://wa.me/${lead.phone}`}
                  target="_blank"
                >
                  <MessageCircle /> Abrir WhatsApp
                </a>
              )}
              {lead.email && (
                <a className="outline" href={`mailto:${lead.email}`}>
                  <Mail /> Enviar e-mail
                </a>
              )}
              <button
                className={`outline ${lead.status === "in_progress" ? "active-action" : ""}`}
                onClick={() => updateStatus(lead)}
              >
                <UserCheck />
                {lead.status === "in_progress"
                  ? "Em atendimento — desmarcar"
                  : "Marcar em atendimento"}
              </button>
              <button className="outline danger-action" onClick={() => setConfirmDelete(lead)}>
                <Trash2 /> Excluir cliente
              </button>
            </div>
          </article>
        ))}
        {!leads.length && <p className="filter-empty">Nenhum cliente entrou em contato ainda.</p>}
      </div>
      {confirmDelete && (
        <div className="confirm-backdrop">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
          >
            <Trash2 />
            <h2 id="delete-client-title">Excluir cliente?</h2>
            <p>
              A solicitação de <b>{confirmDelete.name}</b> será excluída
              permanentemente. Deseja continuar?
            </p>
            <div>
              <button className="outline" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button
                className="confirm-sale"
                onClick={async () => {
                  await deleteLead(confirmDelete);
                  setConfirmDelete(null);
                }}
              >
                Excluir cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ContentPanel({ notify }: { notify: (message: string, failed?: boolean) => void }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<SiteSettings & { id?: string }>({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const response = await api.get<Page<SiteSettings & { id?: string }>>("/admin/content/");
      return response.data.results[0] ?? {};
    },
  });
  const contentQuery = useQuery<PublicContent>({
    queryKey: ["admin-public-content"],
    queryFn: async () => {
      const [hero, testimonials, faqs, institutional] = await Promise.all([
        api.get<Page<HeroSlide>>("/admin/hero-slides/"),
        api.get<Page<Testimonial>>("/admin/testimonials/"),
        api.get<Page<FAQ>>("/admin/faqs/"),
        api.get<Page<InstitutionalImage>>("/admin/institutional-images/"),
      ]);
      return { hero_slides: hero.data.results, testimonials: testimonials.data.results, faqs: faqs.data.results, institutional_images: institutional.data.results };
    },
  });
  const [settings, setSettings] = useState<SiteSettings & { id?: string }>({});
  useEffect(() => { if (settingsQuery.data) setSettings(settingsQuery.data); }, [settingsQuery.data]);
  const saveSettings = async () => {
    try {
      const response = settings.id
        ? await api.patch(`/admin/content/${settings.id}/`, settings)
        : await api.post("/admin/content/", settings);
      setSettings(response.data);
      notify("Dados institucionais e redes sociais atualizados.");
      queryClient.invalidateQueries({ queryKey: ["public-settings"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createItem = async (kind: "hero-slides" | "testimonials" | "faqs", payload: object) => {
    try {
      await api.post(`/admin/${kind}/`, payload);
      notify("Conteúdo adicionado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["admin-public-content"] });
      queryClient.invalidateQueries({ queryKey: ["public-content"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const removeItem = async (kind: "hero-slides" | "testimonials" | "faqs", id: string) => {
    try {
      await api.delete(`/admin/${kind}/${id}/`);
      notify("Conteúdo removido.");
      queryClient.invalidateQueries({ queryKey: ["admin-public-content"] });
      queryClient.invalidateQueries({ queryKey: ["public-content"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const toggleItem = async (kind: "hero-slides" | "testimonials" | "faqs", item: HeroSlide | Testimonial | FAQ) => {
    try {
      await api.patch(`/admin/${kind}/${item.id}/`, { active: item.active === false });
      notify(item.active === false ? "Conteúdo ativado." : "Conteúdo ocultado.");
      queryClient.invalidateQueries({ queryKey: ["admin-public-content"] });
      queryClient.invalidateQueries({ queryKey: ["public-content"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const moveItem = async (kind: "hero-slides" | "testimonials" | "faqs", items: (HeroSlide | Testimonial | FAQ)[], index: number, amount: number) => {
    const target = index + amount;
    if (target < 0 || target >= items.length) return;
    try {
      await Promise.all([
        api.patch(`/admin/${kind}/${items[index].id}/`, { position: target }),
        api.patch(`/admin/${kind}/${items[target].id}/`, { position: index }),
      ]);
      notify("Ordem atualizada.");
      queryClient.invalidateQueries({ queryKey: ["admin-public-content"] });
      queryClient.invalidateQueries({ queryKey: ["public-content"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const input = (name: keyof SiteSettings, label: string) => <label>{label}<input value={String(settings[name] ?? "")} onChange={(event) => setSettings({ ...settings, [name]: event.target.value })} /></label>;
  const textarea = (name: keyof SiteSettings, label: string) => <label>{label}<textarea rows={5} value={String(settings[name] ?? "")} onChange={(event) => setSettings({ ...settings, [name]: event.target.value })} /></label>;
  return <div className="content-admin">
    <section className="admin-card"><h2>Contato e redes sociais</h2><div className="form-grid">{input("company_name", "Nome da empresa")}{input("whatsapp", "WhatsApp")}{input("phone", "Telefone")}{input("email", "E-mail")}{input("instagram", "Instagram")}{input("facebook", "Facebook")}{input("linkedin", "LinkedIn")}{input("youtube", "YouTube")}{input("tiktok", "TikTok")}</div><button className="gold-button" onClick={saveSettings}><Save /> Salvar dados</button></section>
    <section className="admin-card"><h2>A Imobiliária e Nossa Equipe</h2><p>Edite os textos apresentados na página institucional.</p><div className="institutional-settings">{input("about_title", "Título sobre a imobiliária")}{textarea("about_text", "Texto sobre a imobiliária")}{input("team_title", "Título da equipe")}{textarea("team_text", "Texto sobre a equipe")}</div><button className="gold-button" onClick={saveSettings}><Save /> Salvar textos</button></section>
    <InstitutionalImageCreator section="company" title="Fotos da Imobiliária" items={(contentQuery.data?.institutional_images ?? []).filter((item) => item.section === "company")} notify={notify} onChanged={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} />
    <InstitutionalImageCreator section="team" title="Nossa Equipe" items={(contentQuery.data?.institutional_images ?? []).filter((item) => item.section === "team")} notify={notify} onChanged={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} />
    <HeaderCreator onCreated={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} notify={notify} items={contentQuery.data?.hero_slides ?? []} onDelete={(id) => removeItem("hero-slides", id)} onToggle={(item) => toggleItem("hero-slides", item)} onMove={(items, index, amount) => moveItem("hero-slides", items, index, amount)} />
    <TestimonialCreator onCreated={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} notify={notify} items={contentQuery.data?.testimonials ?? []} onDelete={(id) => removeItem("testimonials", id)} onToggle={(item) => toggleItem("testimonials", item)} onMove={(items, index, amount) => moveItem("testimonials", items, index, amount)} />
    <ContentCreator title="Perguntas frequentes" fields={[["question", "Pergunta"], ["answer", "Resposta"], ["position", "Ordem"]]} onCreate={(payload) => createItem("faqs", { ...payload, active: true })} items={contentQuery.data?.faqs ?? []} onDelete={(id) => removeItem("faqs", id)} onToggle={(item) => toggleItem("faqs", item)} onMove={(items, index, amount) => moveItem("faqs", items, index, amount)} />
  </div>;
}

function InstitutionalImageCreator({ section, title, items, notify, onChanged }: { section: "company" | "team"; title: string; items: InstitutionalImage[]; notify: (message: string, error?: boolean) => void; onChanged: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const create = async () => {
    if (!files.length) return notify("Selecione ao menos uma imagem.", true);
    try {
      for (const [index, file] of files.entries()) {
        const body = new FormData();
        body.append("section", section); body.append("title", caption); body.append("text", text);
        body.append("image", file); body.append("position", String(items.length + index)); body.append("active", "true");
        await api.post("/admin/institutional-images/", body, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setFiles([]); setCaption(""); setText(""); notify(`${files.length} imagem(ns) adicionada(s).`); onChanged();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const update = async (item: InstitutionalImage, payload: object, message: string) => {
    try { await api.patch(`/admin/institutional-images/${item.id}/`, payload); notify(message); onChanged(); }
    catch (error) { notify(friendlyApiError(error), true); }
  };
  const remove = async (item: InstitutionalImage) => {
    try { await api.delete(`/admin/institutional-images/${item.id}/`); notify("Imagem removida."); onChanged(); }
    catch (error) { notify(friendlyApiError(error), true); }
  };
  const move = async (index: number, amount: number) => {
    const target = index + amount; if (target < 0 || target >= items.length) return;
    try {
      await Promise.all([api.patch(`/admin/institutional-images/${items[index].id}/`, { position: target }), api.patch(`/admin/institutional-images/${items[target].id}/`, { position: index })]);
      notify("Ordem atualizada."); onChanged();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  return <section className="admin-card institutional-creator"><h2>{title}</h2><p>{section === "team" ? "Adicione fotos da equipe, nomes/cargos e uma breve apresentação." : "Adicione imagens dos ambientes e momentos da imobiliária."}</p><div className="header-upload-form"><label className="header-drop"><ImagePlus /><b>Selecionar imagens</b><span>Você pode selecionar várias imagens de uma vez.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label><div className="institutional-fields"><label>{section === "team" ? "Nome ou identificação" : "Legenda"}<input value={caption} onChange={(event) => setCaption(event.target.value)} /></label><label>Texto sobre<textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label></div></div>{!!files.length && <div className="header-file-preview">{files.map((file) => <div key={`${file.name}-${file.size}`}><img src={URL.createObjectURL(file)} alt="" /><span>{file.name}</span></div>)}</div>}<button className="gold-button" onClick={create}><Plus /> Adicionar imagens</button><div className="header-admin-list">{items.map((item, index) => <article key={item.id}><img src={item.image_src} alt={item.title} /><div><b>{item.title || "Sem legenda"}</b><small>{item.active === false ? "Oculto" : "Ativo"}</small>{item.text && <small>{item.text}</small>}</div><span><button className="outline" aria-label="Subir" onClick={() => move(index, -1)}><ArrowUp /></button><button className="outline" aria-label="Descer" onClick={() => move(index, 1)}><ArrowDown /></button><button className="outline" onClick={() => update(item, { active: item.active === false }, item.active === false ? "Imagem ativada." : "Imagem ocultada.")}>{item.active === false ? "Ativar" : "Ocultar"}</button><button className="outline danger-action" onClick={() => remove(item)}><Trash2 /> Excluir</button></span></article>)}</div></section>;
}

function HeaderCreator({ onCreated, notify, items, onDelete, onToggle, onMove }: { onCreated: () => void; notify: (message: string, error?: boolean) => void; items: HeroSlide[]; onDelete: (id: string) => void; onToggle: (item: HeroSlide) => void; onMove: (items: HeroSlide[], index: number, amount: number) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState("Seu próximo imóvel começa aqui");
  const [subtitle, setSubtitle] = useState("Compra, venda e oportunidades com segurança, transparência e excelência.");
  const create = async () => {
    if (isUploading) return;
    if (!files.length) return notify("Selecione ao menos uma imagem para o Header.", true);
    if (items.length + files.length > 12) return notify(`O Header permite no máximo 12 imagens. Você pode adicionar mais ${Math.max(0, 12 - items.length)}.`, true);
    setIsUploading(true);
    try {
      for (const [index, file] of files.entries()) {
        const body = new FormData();
        body.append("title", title); body.append("subtitle", subtitle); body.append("image", file);
        body.append("link_url", "/imoveis"); body.append("link_label", "Ver imóveis");
        body.append("position", String(items.length + index)); body.append("active", "true");
        await api.post("/admin/hero-slides/", body, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setFiles([]); notify(`${files.length} imagem(ns) adicionada(s) ao Header.`); onCreated();
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setIsUploading(false); }
  };
  return <section className="admin-card header-creator"><h2>Header</h2><p>As imagens passam automaticamente no fundo da Home e dos títulos de todas as páginas públicas, trocando a cada 5 segundos. Limite: 12 imagens.</p><div className="header-upload-form"><label className="header-drop"><ImagePlus /><b>Selecionar imagens do Header</b><span>Você pode selecionar várias imagens de uma vez.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={isUploading} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label><div className="form-grid"><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Texto<input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label></div></div>{!!files.length && <div className="header-file-preview">{files.map((file) => <div key={`${file.name}-${file.size}`}><img src={URL.createObjectURL(file)} alt="" /><span>{file.name}</span></div>)}</div>}<button className="gold-button" disabled={isUploading} onClick={create}>{isUploading ? "Enviando imagens..." : <><Plus /> Adicionar ao Header</>}</button><div className="header-admin-list">{items.map((item, index) => <article key={item.id}><img src={item.image_src} alt={item.title} /><div><b>{item.title}</b><small>{item.active === false ? "Oculto" : "Ativo"}</small></div><span><button className="outline" aria-label="Subir" onClick={() => onMove(items, index, -1)}><ArrowUp /></button><button className="outline" aria-label="Descer" onClick={() => onMove(items, index, 1)}><ArrowDown /></button><button className="outline" onClick={() => onToggle(item)}>{item.active === false ? "Ativar" : "Ocultar"}</button><button className="outline danger-action" onClick={() => onDelete(item.id)}><Trash2 /> Excluir</button></span></article>)}</div></section>;
}

function TestimonialCreator({ onCreated, notify, items, onDelete, onToggle, onMove }: { onCreated: () => void; notify: (message: string, error?: boolean) => void; items: Testimonial[]; onDelete: (id: string) => void; onToggle: (item: Testimonial) => void; onMove: (items: Testimonial[], index: number, amount: number) => void }) {
  const [values, setValues] = useState({ name: "", role: "", text: "", position: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const create = async () => {
    if (!values.name.trim() || !values.text.trim()) return notify("Informe o nome e o depoimento.", true);
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => { if (value) body.append(key, value); });
    body.append("active", "true");
    if (photo) body.append("photo", photo);
    try {
      await api.post("/admin/testimonials/", body, { headers: { "Content-Type": "multipart/form-data" } });
      setValues({ name: "", role: "", text: "", position: "" }); setPhoto(null); setPreview("");
      notify("Relato adicionado com sucesso."); onCreated();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  return <section className="admin-card testimonial-creator"><h2>Relatos de clientes</h2><p>Adicione a foto e o depoimento. O relato aparecerá automaticamente na Home.</p><div className="testimonial-admin-form"><label className="testimonial-photo-upload">{preview ? <img src={preview} alt="Prévia da foto" /> : <ImagePlus />}<span>{photo ? "Trocar foto" : "Selecionar foto"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setPhoto(file); setPreview(file ? URL.createObjectURL(file) : ""); }} /></label><div className="form-grid"><label>Nome *<input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label>Identificação<input placeholder="Ex.: Comprou com a In Mare" value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })} /></label><label>Ordem<input type="number" min="0" value={values.position} onChange={(event) => setValues({ ...values, position: event.target.value })} /></label><label className="testimonial-text-field">Depoimento *<textarea rows={6} value={values.text} onChange={(event) => setValues({ ...values, text: event.target.value })} /></label></div></div><button className="gold-button" onClick={create}><Plus /> Adicionar relato</button><div className="content-list testimonial-admin-list">{items.map((item, index) => <div key={item.id}><span className="testimonial-list-person">{item.photo_src ? <img src={item.photo_src} alt="" /> : <i>{item.name.slice(0, 1)}</i>}<b>{item.name}</b></span><span><button className="outline" aria-label="Subir" onClick={() => onMove(items, index, -1)}><ArrowUp /></button><button className="outline" aria-label="Descer" onClick={() => onMove(items, index, 1)}><ArrowDown /></button><button className="outline" onClick={() => onToggle(item)}>{item.active === false ? "Ativar" : "Ocultar"}</button><button className="outline danger-action" onClick={() => onDelete(item.id)}><Trash2 /> Excluir</button></span></div>)}</div></section>;
}

function ContentCreator({ title, fields, onCreate, items, onDelete, onToggle, onMove }: { title: string; fields: string[][]; onCreate: (payload: object) => void; items: (HeroSlide | Testimonial | FAQ)[]; onDelete: (id: string) => void; onToggle: (item: HeroSlide | Testimonial | FAQ) => void; onMove: (items: (HeroSlide | Testimonial | FAQ)[], index: number, amount: number) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return <section className="admin-card content-creator"><h2>{title}</h2><div className="form-grid">{fields.map(([name, label]) => <label key={name}>{label}<input value={values[name] ?? ""} onChange={(event) => setValues({ ...values, [name]: event.target.value })} /></label>)}</div><button className="gold-button" onClick={() => { onCreate(values); setValues({}); }}><Plus /> Adicionar</button><div className="content-list">{items.map((item, index) => <div key={item.id}><b>{"title" in item ? item.title : "name" in item ? item.name : item.question}</b><span><button className="outline" aria-label="Subir" onClick={() => onMove(items, index, -1)}><ArrowUp /></button><button className="outline" aria-label="Descer" onClick={() => onMove(items, index, 1)}><ArrowDown /></button><button className="outline" onClick={() => onToggle(item)}>{item.active === false ? "Ativar" : "Ocultar"}</button><button className="outline danger-action" onClick={() => onDelete(item.id)}><Trash2 /> Excluir</button></span></div>)}</div></section>;
}

function Login({
  submit,
  error,
}: {
  submit: (d: { username: string; password: string }) => void;
  error: boolean;
}) {
  return (
    <div className="admin-login">
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          submit({
            username: String(d.get("username")),
            password: String(d.get("password")),
          });
        }}
      >
        <img src="/assets/brand/logo-transparent.png" alt="In Mare" />
        <h1>Acesso administrativo</h1>
        <label>
          Usuário
          <input name="username" defaultValue="admin" required />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            defaultValue="admin"
            required
          />
        </label>
        {error && <p className="error">Usuário ou senha inválidos.</p>}
        <button className="gold-button">Entrar</button>
        <Link to="/">Voltar ao site</Link>
      </form>
    </div>
  );
}

function Editor({
  form,
  setForm,
  selected,
  save,
  upload,
  reorder,
  setPrimary,
  deleteMedia,
  deleteProperty,
  importTxt,
  action,
  back,
  saving,
}: {
  form: Record<string, string | boolean>;
  setForm: (v: Record<string, string | boolean>) => void;
  selected: Property;
  save: () => void;
  upload: (f: File) => Promise<void>;
  reorder: (draggedId: string, targetId: string) => void;
  setPrimary: (mediaId: string) => void;
  deleteMedia: (mediaId: string) => Promise<void>;
  deleteProperty: () => Promise<void>;
  importTxt: (file: File) => void;
  action: (n: string) => void;
  back: () => void;
  saving: boolean;
}) {
  const [saleConfirmation, setSaleConfirmation] = useState<"sell" | "restore" | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState<"archive" | "restore" | null>(null);
  const [draggingMedia, setDraggingMedia] = useState<string | null>(null);
  const [deletingMedia, setDeletingMedia] = useState<string | null>(null);
  const [mediaDeleteConfirmation, setMediaDeleteConfirmation] = useState<{ id: string; kind: string } | null>(null);
  const [propertyDeleteConfirmation, setPropertyDeleteConfirmation] = useState(false);
  const [deletingProperty, setDeletingProperty] = useState(false);
  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await upload(file);
  };
  const field = (name: string, label: string, type = "text", required = false) => (
    <label>
      <span>
        {label}
        {required && <b className="required-mark"> *</b>}
      </span>
      <input
        type={type}
        required={required}
        value={String(form[name] ?? "")}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="admin-card editor">
      <button className="back" onClick={back}>
        <ArrowLeft /> Voltar
      </button>
      {!selected.id && (
        <label className="txt-import">
          <Upload />
          <span>
            <b>Importar informações de um TXT</b>
            O sistema preencherá os campos reconhecidos. Revise antes de salvar.
          </span>
          <strong>Selecionar TXT</strong>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importTxt(file);
              event.target.value = "";
            }}
          />
        </label>
      )}
      <p className="required-note">* Campos obrigatórios</p>
      <div className="form-grid">
        {field("title", "Título", "text", true)}
        {field("property_type", "Tipo", "text", true)}
        {field("city", "Cidade", "text", true)}
        {field("neighborhood", "Bairro", "text", true)}
        {field("price", "Valor", "number")}
        {field("condominium_fee", "Condomínio", "number")}
        {field("iptu", "IPTU", "number")}
        <label>
          <span>Finalidade<b className="required-mark"> *</b></span>
          <select
            required
            value={String(form.purpose)}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          >
            <option value="sale">Venda</option>
            <option value="rent">Aluguel</option>
            <option value="season">Temporada</option>
          </select>
        </label>
        {field("bedrooms", "Dormitórios", "number")}
        {field("suites", "Suítes", "number")}
        {field("bathrooms", "Banheiros", "number")}
        {field("parking_spaces", "Vagas", "number")}
        {field("private_area", "Área privativa", "number")}
        {field("land_dimensions", "Terreno")}
        {field("public_reference", "Referência pública")}
        {field("private_address", "Endereço privado")}
        {field("private_commission", "Comissão privada")}
        {field("approximate_latitude", "Latitude aproximada", "number")}
        {field("approximate_longitude", "Longitude aproximada", "number")}
      </div>
      <label className="check admin-check"><input type="checkbox" checked={Boolean(form.exclusive)} onChange={(event) => setForm({ ...form, exclusive: event.target.checked })} /> Imóvel exclusivo</label>
      <label>
        <span>Descrição pública<b className="required-mark"> *</b></span>
        <textarea
          required
          rows={7}
          value={String(form.public_description)}
          onChange={(e) =>
            setForm({ ...form, public_description: e.target.value })
          }
        />
      </label>
      <label>
        Observações internas
        <textarea
          rows={4}
          value={String(form.internal_notes)}
          onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
        />
      </label>
      <div className="editor-actions">
        <button className="gold-button" onClick={save} disabled={saving}>
          <Save /> Salvar imóvel
        </button>
        {selected.id && (
          <>
            <button
              className="outline"
              onClick={() => action("confirm-review")}
              disabled={selected.status === "archived"}
            >
              <CheckCircle2 /> Confirmar revisão
            </button>
            <button className="outline" onClick={() => action("publish")} disabled={selected.status === "archived"}>
              <Upload /> Publicar
            </button>
            <button className="outline" onClick={() => action("validate-media")} disabled={selected.status === "archived"}>
              <CheckCircle2 /> Validar mídias
            </button>
            <button
              className={`outline ${selected.featured ? "active-action" : ""}`}
              onClick={() => action("toggle-featured")}
              disabled={selected.status === "archived"}
            >
              <Star /> {selected.featured ? "Destacado na Home — remover" : "Destacar imóvel"}
            </button>
            <button
              className={`outline ${selected.launch ? "active-action" : ""}`}
              onClick={() => action("toggle-launch")}
              disabled={selected.status === "archived"}
            >
              <Rocket /> {selected.launch ? "Destacado em Lançamentos — remover" : "Destacar em Lançamentos"}
            </button>
            <button
              className={`outline ${selected.status === "negotiating" ? "active-action" : ""}`}
              onClick={() =>
                action(selected.status === "negotiating" ? "remove-in-service" : "mark-in-service")
              }
              disabled={selected.status === "sold" || selected.status === "archived"}
            >
              <Handshake /> {selected.status === "negotiating" ? "Em atendimento — desmarcar" : "Marcar em atendimento"}
            </button>
            <button
              className={`outline danger-action ${selected.status === "sold" ? "sold-action" : ""}`}
              onClick={() => setSaleConfirmation(selected.status === "sold" ? "restore" : "sell")}
              disabled={selected.status === "archived"}
            >
              <BadgeDollarSign /> {selected.status === "sold" ? "Imóvel vendido" : "Marcar como vendido"}
            </button>
            <button
              className={`outline archive-action ${selected.status === "archived" ? "active-archive" : ""}`}
              onClick={() =>
                setArchiveConfirmation(selected.status === "archived" ? "restore" : "archive")
              }
            >
              {selected.status === "archived" ? <ArchiveRestore /> : <Archive />}
              {selected.status === "archived" ? "Arquivado — restaurar" : "Arquivar imóvel"}
            </button>
            <button
              className="outline danger-action"
              onClick={() => setPropertyDeleteConfirmation(true)}
            >
              <Trash2 /> Excluir imóvel
            </button>
          </>
        )}
      </div>
      {selected.id && (
        <label
          className="media-dropzone"
          tabIndex={0}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(event.dataTransfer.files);
          }}
          onPaste={(event) => { void uploadFiles(event.clipboardData.files); }}
        >
          <ImagePlus />
          <span>
            <b>Arraste ou cole fotos e vídeos aqui</b>
            Selecione vários arquivos de uma vez ou use Ctrl+V para colar.
          </span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
            onChange={(event) => { void uploadFiles(event.target.files ?? []); }}
          />
        </label>
      )}
      {!selected.id && (
        <div className="media-step">
          <ImagePlus />
          <span>
            <b>Adicionar e validar imagens</b>
            Salve o imóvel primeiro. Assim que ele for criado, os botões para
            adicionar e validar fotos, vídeos e PDF serão liberados aqui.
          </span>
        </div>
      )}
      {selected.media?.length ? (
        <div className="media-grid">
          {selected.media.map((m) => (
            <div
              key={m.id}
              className={`media-item ${draggingMedia === m.id ? "dragging" : ""}`}
              draggable
              onDragStart={() => setDraggingMedia(m.id)}
              onDragEnd={() => setDraggingMedia(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingMedia && draggingMedia !== m.id) reorder(draggingMedia, m.id);
                setDraggingMedia(null);
              }}
            >
              <span className="media-drag"><GripVertical /> Arrastar</span>
              {m.kind === "image" && (
                <button
                  className={`primary-star ${m.is_primary ? "active" : ""}`}
                  onClick={() => setPrimary(m.id)}
                  title={m.is_primary ? "Foto principal" : "Definir como foto principal"}
                  aria-label={m.is_primary ? "Foto principal" : "Definir como foto principal"}
                >
                  <Star />
                </button>
              )}
              <button
                type="button"
                className={`media-delete ${m.kind === "image" ? "beside-star" : ""}`}
                disabled={deletingMedia === m.id}
                onClick={() => setMediaDeleteConfirmation({ id: m.id, kind: m.kind })}
                title="Excluir mídia"
                aria-label={m.kind === "image" ? "Excluir foto" : "Excluir mídia"}
              >
                <Trash2 />
              </button>
              {m.kind === "image" ? (
                <img src={m.url} />
              ) : m.kind === "video" ? (
                <video src={m.url} controls />
              ) : (
                <a href={m.url} target="_blank">
                  Abrir PDF
                </a>
              )}
              <small>
                {m.kind}
                {m.is_primary ? " • principal" : ""}
              </small>
            </div>
          ))}
        </div>
      ) : null}
      {mediaDeleteConfirmation && (
        <div className="confirm-backdrop">
          <div className="confirm-modal delete-confirm" role="alertdialog" aria-modal="true">
            <Trash2 />
            <h2>{mediaDeleteConfirmation.kind === "image" ? "Excluir esta foto?" : "Excluir esta mídia?"}</h2>
            <p>
              {mediaDeleteConfirmation.kind === "image"
                ? "A foto será removida permanentemente deste imóvel. Se ela for a principal, a próxima foto será definida como principal."
                : "Este arquivo será removido permanentemente do imóvel."}
            </p>
            <div>
              <button className="outline" onClick={() => setMediaDeleteConfirmation(null)} disabled={deletingMedia !== null}>
                Cancelar
              </button>
              <button
                className="confirm-delete"
                disabled={deletingMedia !== null}
                onClick={async () => {
                  const mediaId = mediaDeleteConfirmation.id;
                  setDeletingMedia(mediaId);
                  try {
                    await deleteMedia(mediaId);
                    setMediaDeleteConfirmation(null);
                  } finally {
                    setDeletingMedia(null);
                  }
                }}
              >
                <Trash2 /> {deletingMedia ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
      {propertyDeleteConfirmation && (
        <div className="confirm-backdrop">
          <div className="confirm-modal delete-confirm" role="alertdialog" aria-modal="true">
            <Trash2 />
            <h2>Excluir este imóvel?</h2>
            <p>
              <b>{selected.title}</b> e todas as fotos, vídeos, documentos e informações cadastradas serão removidos permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div>
              <button className="outline" onClick={() => setPropertyDeleteConfirmation(false)} disabled={deletingProperty}>
                Cancelar
              </button>
              <button
                className="confirm-delete"
                disabled={deletingProperty}
                onClick={async () => {
                  setDeletingProperty(true);
                  try {
                    await deleteProperty();
                    setPropertyDeleteConfirmation(false);
                  } finally {
                    setDeletingProperty(false);
                  }
                }}
              >
                <Trash2 /> {deletingProperty ? "Excluindo..." : "Sim, excluir imóvel"}
              </button>
            </div>
          </div>
        </div>
      )}
      {saleConfirmation && (
        <div className="confirm-backdrop">
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <BadgeDollarSign />
            <h2>{saleConfirmation === "sell" ? "Confirmar venda?" : "Desconfirmar venda?"}</h2>
            <p>
              {saleConfirmation === "sell"
                ? "O imóvel será marcado como vendido e deixará de aparecer no site."
                : "O imóvel voltará a ficar disponível e reaparecerá na listagem do site."}
            </p>
            <div>
              <button className="outline" onClick={() => setSaleConfirmation(null)}>
                Cancelar
              </button>
              <button
                className={saleConfirmation === "sell" ? "confirm-sale" : "gold-button"}
                onClick={() => {
                  action(saleConfirmation === "sell" ? "mark-sold" : "restore-sale");
                  setSaleConfirmation(null);
                }}
              >
                {saleConfirmation === "sell" ? "Sim, marcar como vendido" : "Sim, recolocar no site"}
              </button>
            </div>
          </div>
        </div>
      )}
      {archiveConfirmation && (
        <div className="confirm-backdrop">
          <div className="confirm-modal archive-confirm" role="dialog" aria-modal="true">
            {archiveConfirmation === "archive" ? <Archive /> : <ArchiveRestore />}
            <h2>{archiveConfirmation === "archive" ? "Arquivar imóvel?" : "Restaurar imóvel?"}</h2>
            <p>
              {archiveConfirmation === "archive"
                ? "O imóvel ficará disponível apenas para a gestão e deixará de aparecer para os clientes."
                : "O imóvel voltará a ficar disponível e reaparecerá automaticamente no site."}
            </p>
            <div>
              <button className="outline" onClick={() => setArchiveConfirmation(null)}>
                Cancelar
              </button>
              <button
                className={archiveConfirmation === "archive" ? "confirm-archive" : "gold-button"}
                onClick={() => {
                  action(archiveConfirmation === "archive" ? "archive" : "restore-archive");
                  setArchiveConfirmation(null);
                }}
              >
                {archiveConfirmation === "archive" ? "Sim, arquivar imóvel" : "Sim, restaurar imóvel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

