import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  BarChart3,
  BadgeDollarSign,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  GripVertical,
  Handshake,
  ImagePlus,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Rocket,
  Star,
  Trash2,
  Upload,
  UserPlus,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { collectPages, paginateItems } from "./pagination";
import type { AdminSession, AdminUser, CRMActivity, CRMAvailableContact, CRMBroker, CRMContact, CRMContactChoice, CRMContactHolder, CRMImportBatch, CRMImportRow, CRMNotification, CRMOpportunity, CRMProposal, CRMReport, CRMSummary, CRMTask, FAQ, HeroSlide, InstitutionalImage, Lead, ListingOption, Page, Property, PublicContent, SiteSettings, Testimonial } from "./types";

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
  const [section, setSection] = useState<"properties" | "crm" | "clients" | "content">("properties");
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
  const [propertyPage, setPropertyPage] = useState(1);
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
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    retry: false,
    queryFn: async () => (await api.get<AdminSession>("/admin/auth/me/")).data,
  });
  useEffect(() => {
    if (sessionQuery.data) {
      setAuthenticated(true);
      if (!sessionQuery.data.can_manage_properties) setSection("crm");
    } else if (sessionQuery.isError) {
      setAuthenticated(false);
    }
  }, [sessionQuery.data, sessionQuery.isError]);
  const properties = useQuery({
    queryKey: ["admin-properties"],
    enabled: authenticated === true && sessionQuery.data?.can_manage_properties === true,
    retry: false,
    refetchInterval: 10000,
    queryFn: async () => collectPages("/admin/properties/", async (url) => {
      const response = await api.get<Page<Property>>(url);
      return response.data;
    }),
  });
  const listingOptions = useQuery({
    queryKey: ["admin-listing-options"],
    enabled: authenticated === true && sessionQuery.data?.can_manage_properties === true,
    queryFn: async () => (await api.get<ListingOption[]>("/admin/listing-options/")).data,
  });
  const leads = useQuery({
    queryKey: ["admin-leads"],
    enabled: authenticated === true && sessionQuery.data?.can_manage_site === true,
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
      api.post<{ user: AdminSession }>("/admin/auth/login/", d),
    onSuccess: ({ data }) => {
      setAuthenticated(true);
      queryClient.setQueryData(["admin-session"], data.user);
      if (!data.user.can_manage_properties) setSection("crm");
      queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
    },
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
  const createListingOption = async (
    input: Pick<ListingOption, "kind" | "name" | "city">,
  ) => {
    const response = await api.post<ListingOption>("/admin/listing-options/", input);
    queryClient.setQueryData<ListingOption[]>(
      ["admin-listing-options"],
      (current = []) => [...current, response.data],
    );
    const label = input.kind === "city" ? "Cidade" : input.kind === "neighborhood" ? "Bairro" : "Tipo";
    setNotice(`${label} cadastrado com sucesso.`);
    setError("");
    return response.data;
  };
  const updateListingOption = async (
    id: string,
    input: Pick<ListingOption, "name" | "city">,
  ) => {
    const currentOptions = listingOptions.data ?? [];
    const previous = currentOptions.find((option) => option.id === id);
    const response = await api.patch<ListingOption>(`/admin/listing-options/${id}/`, input);
    queryClient.setQueryData<ListingOption[]>(
      ["admin-listing-options"],
      (current = []) => current.map((option) => {
        if (option.id === id) return response.data;
        if (
          previous?.kind === "city"
          && option.kind === "neighborhood"
          && option.city === previous.name
        ) {
          return { ...option, city: response.data.name };
        }
        return option;
      }),
    );
    await queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
    setNotice("Nome atualizado em todos os imóveis vinculados.");
    setError("");
    return response.data;
  };
  const deleteListingOption = async (id: string) => {
    await api.delete(`/admin/listing-options/${id}/`);
    queryClient.setQueryData<ListingOption[]>(
      ["admin-listing-options"],
      (current = []) => current.filter((option) => option.id !== id),
    );
    setNotice("Nome excluído do catálogo.");
    setError("");
  };
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
  const propertyTypes = [...new Set(list.map((property) => property.property_type).filter(Boolean))].sort();
  const propertiesPerPage = 10;
  const paginatedProperties = paginateItems(filteredList, propertyPage, propertiesPerPage);
  const propertyPageCount = paginatedProperties.pageCount;
  const activePropertyPage = paginatedProperties.page;
  const visibleProperties = paginatedProperties.items;
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
          {sessionQuery.data?.can_manage_properties && <button onClick={() => { setSection("properties"); setSelected(null); setAdminMenuOpen(false); }}>
            <Building2 /> Imóveis
          </button>}
          {sessionQuery.data?.can_manage_site && <button onClick={() => { setSection("clients"); setSelected(null); setAdminMenuOpen(false); }}>
            <Users /> Contatos do site
          </button>}
          <button onClick={() => { setSection("crm"); setSelected(null); setAdminMenuOpen(false); }}>
            <ClipboardList /> CRM comercial
          </button>
          {sessionQuery.data?.can_manage_site && <button onClick={() => { setSection("content"); setSelected(null); setAdminMenuOpen(false); }}>
            <Settings /> Conteúdo e redes
          </button>}
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
            <h1>{selected ? "Editar imóvel" : section === "crm" ? "CRM comercial" : section === "clients" ? "Contatos recebidos" : section === "content" ? "Conteúdo e redes" : "Gestão de imóveis"}</h1>
            <p className="admin-welcome">Seja bem-vindo, <b>{sessionQuery.data?.display_name || sessionQuery.data?.broker_name || sessionQuery.data?.username}</b>.</p>
          </div>
          <div className="admin-head-actions">
          <div className="admin-profile-chip" title={sessionQuery.data?.email || sessionQuery.data?.username}>
            <span>{(sessionQuery.data?.display_name || sessionQuery.data?.username || "A").slice(0, 1).toUpperCase()}</span>
            <div><b>{sessionQuery.data?.display_name || sessionQuery.data?.username}</b><small>{sessionQuery.data?.role === "admin" ? "Administrador" : sessionQuery.data?.role === "manager" ? "Gestor comercial" : "Corretor"} · @{sessionQuery.data?.username}</small></div>
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
        </div>
        {section === "content" ? (
          <ContentPanel notify={(message, failed = false) => failed ? setError(message) : setNotice(message)} />
        ) : section === "crm" ? (
          <CRMPanel
            properties={list}
            session={sessionQuery.data!}
            notify={(message, failed = false) => failed ? setError(message) : setNotice(message)}
          />
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
                    onChange={(event) => {
                      setFilters({ ...filters, search: event.target.value });
                      setPropertyPage(1);
                    }}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={filters.status}
                    onChange={(event) => {
                      setFilters({ ...filters, status: event.target.value });
                      setPropertyPage(1);
                    }}
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
                    onChange={(event) => {
                      setFilters({ ...filters, type: event.target.value });
                      setPropertyPage(1);
                    }}
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
                    onChange={(event) => {
                      setFilters({ ...filters, date: event.target.value });
                      setPropertyPage(1);
                    }}
                  />
                </label>
                <button
                  className="outline"
                  onClick={() => {
                    setFilters({ search: "", status: "", type: "", date: "" });
                    setPropertyPage(1);
                  }}
                >
                  Limpar filtros
                </button>
              </div>
              <div className="table">
                {visibleProperties.map((p) => {
                  const isWhatsAppPending =
                    p.source === "whatsapp" && p.status === "draft" && !p.published;
                  const commercialStatus =
                    isWhatsAppPending
                      ? { label: "Aguardando revisão", className: "whatsapp" }
                      : p.status === "sold"
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
                      {p.source === "whatsapp" && (
                        <small className="whatsapp-origin">
                          <MessageCircle /> Recebido automaticamente do WhatsApp
                        </small>
                      )}
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
              {!!filteredList.length && (
                <div className="admin-pagination" role="navigation" aria-label="Paginação dos imóveis">
                  <span>
                    Exibindo {(activePropertyPage - 1) * propertiesPerPage + 1}–{Math.min(activePropertyPage * propertiesPerPage, filteredList.length)} de {filteredList.length}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="outline"
                      disabled={activePropertyPage === 1}
                      onClick={() => setPropertyPage(activePropertyPage - 1)}
                    >
                      Anterior
                    </button>
                    {Array.from({ length: propertyPageCount }, (_, index) => index + 1).map((page) => (
                      <button
                        type="button"
                        key={page}
                        className={page === activePropertyPage ? "active" : ""}
                        aria-current={page === activePropertyPage ? "page" : undefined}
                        onClick={() => setPropertyPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="outline"
                      disabled={activePropertyPage === propertyPageCount}
                      onClick={() => setPropertyPage(activePropertyPage + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
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
            listingOptions={listingOptions.data ?? []}
            createListingOption={createListingOption}
            updateListingOption={updateListingOption}
            deleteListingOption={deleteListingOption}
            canAdminister={sessionQuery.data?.can_manage_site === true}
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

const crmStageLabels: Record<CRMOpportunity["stage"], string> = {
  new: "Lead recebido",
  contacted: "Contato realizado",
  visit: "Visita agendada",
  proposal: "Proposta enviada",
  negotiation: "Negociação",
  won: "Fechado",
  lost: "Perdido",
  paused: "Pausado",
};

const crmStages = Object.keys(crmStageLabels) as CRMOpportunity["stage"][];

function maskDocument(value?: string | null) {
  if (!value) return "Não informado";
  return value.length === 14
    ? `••.•••.•••/${value.slice(-4, -2)}-${value.slice(-2)}`
    : `•••.•••.•••-${value.slice(-2)}`;
}

function ContactPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  contacts?: CRMContact[];
  value: string;
  onChange: (contactId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matchesQuery = useQuery({
    queryKey: ["crm-contact-choices", debouncedQuery],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => (await api.get<Page<CRMContactChoice>>(
      `/admin/crm/contacts/choices/?search=${encodeURIComponent(debouncedQuery)}`,
    )).data,
  });
  const matches = matchesQuery.data?.results ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  const choose = (contact: CRMContactChoice) => {
    onChange(contact.id);
    setQuery(contact.name);
    setOpen(false);
  };

  return <label className="contact-picker">
    {label}
    <input
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      autoComplete="off"
      placeholder="Digite o nome do cliente"
      value={query}
      onFocus={() => setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      onChange={(event) => {
        setQuery(event.target.value);
        onChange("");
        setOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && open && matches[0]) {
          event.preventDefault();
          choose(matches[0]);
        }
        if (event.key === "Escape") setOpen(false);
      }}
    />
    {open && <span className="contact-picker-results" role="listbox">
      {matches.map((contact) => <button
        type="button"
        role="option"
        aria-selected={contact.id === value}
        key={contact.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(contact)}
      >
        <b>{contact.name}</b>
        <small>{[contact.city, contact.phone || contact.email].filter(Boolean).join(" · ") || "Sem dados adicionais"}</small>
      </button>)}
      {matchesQuery.isFetching && <small className="contact-picker-empty">Buscando clientes...</small>}
      {!matchesQuery.isFetching && !matches.length && <small className="contact-picker-empty">Nenhum cliente encontrado.</small>}
    </span>}
  </label>;
}

function CRMPanel({ properties, session, notify }: { properties: Property[]; session: AdminSession; notify: (message: string, failed?: boolean) => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"funnel" | "available" | "contacts" | "tasks" | "proposals" | "imports" | "reports" | "notifications" | "team">("funnel");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contactPage, setContactPage] = useState(1);
  const [poolSearch, setPoolSearch] = useState("");
  const [debouncedPoolSearch, setDebouncedPoolSearch] = useState("");
  const [poolPage, setPoolPage] = useState(1);
  const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", person_type: "individual", document: "", phone: "", email: "", profile: "general", city: "", state: "", source: "manual", notes: "", assigned_broker: "" });
  const [opportunityForm, setOpportunityForm] = useState({ contact: "", property: "", title: "", expected_value: "", broker: "" });
  const [taskForm, setTaskForm] = useState({ contact: "", opportunity: "", title: "", kind: "follow_up", due_at: "", broker: "" });
  const [proposalForm, setProposalForm] = useState({ opportunity: "", total_value: "", down_payment: "", financing_value: "", installment_count: "", installment_value: "", reinforcement_count: "", reinforcement_value: "", exchange_description: "", exchange_value: "", valid_until: "", notes: "" });
  const [linkForm, setLinkForm] = useState({ property: "", development_name: "", unit_reference: "", relationship: "owner" });
  const [activityNote, setActivityNote] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLabel, setImportLabel] = useState("Base Riviera 2024");
  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [editingImportRow, setEditingImportRow] = useState<CRMImportRow | null>(null);
  const [importRowForm, setImportRowForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const reportDefaultTo = new Date().toISOString().slice(0, 10);
  const reportDefaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [reportDates, setReportDates] = useState({ date_from: reportDefaultFrom, date_to: reportDefaultTo });
  const [brokerForm, setBrokerForm] = useState({ name: "", email: "", phone: "", whatsapp: "", role: "broker", username: "", password: "", can_manage_properties: false });
  const [adminForm, setAdminForm] = useState({ first_name: "", last_name: "", email: "", username: "", password: "" });
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setContactPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const contactsQuery = useQuery({
    queryKey: ["crm-contacts", debouncedSearch, contactPage],
    enabled: tab === "contacts",
    placeholderData: (previous) => previous,
    refetchInterval: tab === "contacts" ? 15_000 : false,
    queryFn: async () => (await api.get<Page<CRMContact>>(
      `/admin/crm/contacts/?ordering=name&page=${contactPage}&search=${encodeURIComponent(debouncedSearch)}`,
    )).data,
  });
  const summaryQuery = useQuery({
    queryKey: ["crm-summary"],
    refetchInterval: 10_000,
    queryFn: async () => (await api.get<CRMSummary>("/admin/crm/contacts/summary/")).data,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPoolSearch(poolSearch);
      setPoolPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [poolSearch]);
  const availableContactsQuery = useQuery({
    queryKey: ["crm-available-contacts", debouncedPoolSearch, poolPage],
    enabled: !!session.broker_id,
    refetchInterval: tab === "available" ? 10_000 : false,
    queryFn: async () => (await api.get<Page<CRMAvailableContact>>(
      `/admin/crm/contacts/available/?page=${poolPage}&search=${encodeURIComponent(debouncedPoolSearch)}`,
    )).data,
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["crm-opportunities"],
    enabled: tab === "funnel" || tab === "tasks" || tab === "proposals",
    queryFn: () => collectPages("/admin/crm/opportunities/", async (url) => (await api.get<Page<CRMOpportunity>>(url)).data),
  });
  const tasksQuery = useQuery({
    queryKey: ["crm-tasks"],
    enabled: tab === "tasks",
    queryFn: () => collectPages("/admin/crm/tasks/?ordering=due_at", async (url) => (await api.get<Page<CRMTask>>(url)).data),
  });
  const proposalsQuery = useQuery({
    queryKey: ["crm-proposals"],
    enabled: tab === "proposals",
    queryFn: () => collectPages("/admin/crm/proposals/", async (url) => (await api.get<Page<CRMProposal>>(url)).data),
  });
  const activitiesQuery = useQuery({
    queryKey: ["crm-activities", editingContact?.id],
    enabled: !!editingContact,
    queryFn: () => collectPages(`/admin/crm/activities/?contact=${editingContact?.id}`, async (url) => (await api.get<Page<CRMActivity>>(url)).data),
  });
  const contactHoldersQuery = useQuery({
    queryKey: ["crm-contact-holders", editingContact?.id],
    enabled: session.can_manage_team && !!editingContact,
    queryFn: async () => (await api.get<CRMContactHolder[]>(
      `/admin/crm/contacts/${editingContact?.id}/holders/`,
    )).data,
  });
  const importsQuery = useQuery({
    queryKey: ["crm-imports"],
    enabled: session.can_view_all_crm,
    queryFn: () => collectPages("/admin/crm/imports/", async (url) => (await api.get<Page<CRMImportBatch>>(url)).data),
  });
  const rowsQuery = useQuery({
    queryKey: ["crm-import-rows", currentBatch],
    enabled: session.can_view_all_crm && !!currentBatch,
    queryFn: () => collectPages(`/admin/crm/import-rows/?batch=${currentBatch}`, async (url) => (await api.get<Page<CRMImportRow>>(url)).data),
  });
  const referencePropertiesQuery = useQuery({
    queryKey: ["crm-reference-properties"],
    queryFn: async () => (await api.get<Array<Partial<Property> & { id: string; title: string }>>("/admin/crm/reference-properties/")).data,
  });
  const teamReferenceQuery = useQuery({
    queryKey: ["crm-reference-team"],
    queryFn: async () => (await api.get<Array<{ id: string; name: string; role: string }>>("/admin/crm/reference-team/")).data,
  });
  const reportsQuery = useQuery({
    queryKey: ["crm-reports", reportDates],
    enabled: tab === "reports",
    queryFn: async () => (await api.get<CRMReport>(`/admin/crm/reports/?date_from=${reportDates.date_from}&date_to=${reportDates.date_to}`)).data,
  });
  const notificationsQuery = useQuery({
    queryKey: ["crm-notifications"],
    refetchInterval: 30000,
    queryFn: () => collectPages("/admin/crm/notifications/", async (url) => (await api.get<Page<CRMNotification>>(url)).data),
  });
  const brokersQuery = useQuery({
    queryKey: ["crm-brokers"],
    enabled: session.can_manage_team,
    queryFn: () => collectPages("/admin/brokers/", async (url) => (await api.get<Page<CRMBroker>>(url)).data),
  });
  const adminUsersQuery = useQuery({
    queryKey: ["admin-users"],
    enabled: session.can_manage_team,
    queryFn: () => collectPages("/admin/users/", async (url) => (await api.get<Page<AdminUser>>(url)).data),
  });
  const contacts = contactsQuery.data?.results ?? [];
  const opportunities = opportunitiesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const crmProperties = referencePropertiesQuery.data ?? properties;
  const teamReference = teamReferenceQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const selectedBatch = (importsQuery.data ?? []).find((batch) => batch.id === currentBatch);
  const filteredContacts = contacts;

  const refreshCRM = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crm-contacts"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-contact-choices"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-proposals"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-imports"] }),
      queryClient.invalidateQueries({ queryKey: ["crm-available-contacts"] }),
    ]);
  };
  const claimContact = async (contact: CRMAvailableContact) => {
    try {
      await api.post(`/admin/crm/contacts/${contact.id}/claim/`);
      notify(`${contact.name} foi adicionado à sua carteira e ao funil.`);
      await refreshCRM();
      setTab("funnel");
    } catch (error) {
      notify(friendlyApiError(error), true);
      await queryClient.invalidateQueries({ queryKey: ["crm-available-contacts"] });
    }
  };
  const resetContactForm = () => {
    setEditingContact(null);
    setShowContactForm(false);
    setContactForm({ name: "", person_type: "individual", document: "", phone: "", email: "", profile: "general", city: "", state: "", source: "manual", notes: "", assigned_broker: "" });
  };
  const saveContact = async () => {
    if (!contactForm.name.trim()) return notify("Informe o nome do contato.", true);
    try {
      const payload = { ...contactForm, assigned_broker: contactForm.assigned_broker || null };
      if (editingContact) await api.patch(`/admin/crm/contacts/${editingContact.id}/`, payload);
      else await api.post("/admin/crm/contacts/", payload);
      notify(editingContact ? "Contato atualizado." : "Contato cadastrado no CRM.");
      resetContactForm();
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const editContact = (contact: CRMContact) => {
    setEditingContact(contact);
    setShowContactForm(true);
    setContactForm({
      name: contact.name, person_type: contact.person_type, document: contact.document ?? "", phone: contact.phone,
      email: contact.email, profile: contact.profile, city: contact.city, state: contact.state, source: contact.source, notes: contact.notes, assigned_broker: contact.assigned_broker ?? "",
    });
  };
  const releaseContact = async (holder: CRMContactHolder) => {
    if (!editingContact) return;
    if (!window.confirm(`Remover ${editingContact.name} da carteira de ${holder.name}${holder.username ? ` (${holder.username})` : ""}? O contato voltará para Leads disponíveis quando não houver outro atendimento aberto.`)) return;
    try {
      const response = await api.post<{ detail: string }>(`/admin/crm/contacts/${editingContact.id}/release/`, { broker: holder.id });
      notify(response.data.detail);
      resetContactForm();
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createPropertyLink = async () => {
    if (!editingContact || (!linkForm.property && !linkForm.unit_reference.trim())) return notify("Escolha um imóvel ou informe a unidade.", true);
    try {
      await api.post("/admin/crm/property-links/", { ...linkForm, property: linkForm.property || null, contact: editingContact.id });
      notify("Vínculo com o imóvel registrado.");
      setLinkForm({ property: "", development_name: "", unit_reference: "", relationship: "owner" });
      await refreshCRM();
      const response = await api.get<CRMContact>(`/admin/crm/contacts/${editingContact.id}/`);
      editContact(response.data);
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const addActivity = async () => {
    if (!editingContact || !activityNote.trim()) return;
    try {
      await api.post("/admin/crm/activities/", { contact: editingContact.id, kind: "note", description: activityNote });
      setActivityNote("");
      notify("Observação adicionada ao histórico.");
      await queryClient.invalidateQueries({ queryKey: ["crm-activities", editingContact.id] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createOpportunity = async () => {
    if (!opportunityForm.contact || !opportunityForm.title.trim()) return notify("Escolha o contato e informe o título da oportunidade.", true);
    try {
      await api.post("/admin/crm/opportunities/", { ...opportunityForm, property: opportunityForm.property || null, expected_value: opportunityForm.expected_value || null, broker: opportunityForm.broker || null, source: "manual", stage: "new" });
      setOpportunityForm({ contact: "", property: "", title: "", expected_value: "", broker: "" });
      notify("Oportunidade adicionada ao funil.");
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const moveOpportunity = async (opportunity: CRMOpportunity, stage: CRMOpportunity["stage"]) => {
    const lossReason = stage === "lost" ? window.prompt("Informe o motivo da perda desta oportunidade:") : "";
    if (stage === "lost" && !lossReason?.trim()) return;
    try {
      await api.patch(`/admin/crm/opportunities/${opportunity.id}/`, { stage, ...(lossReason ? { loss_reason: lossReason } : {}) });
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createTask = async () => {
    if (!taskForm.contact || !taskForm.title.trim() || !taskForm.due_at) return notify("Preencha contato, tarefa e data.", true);
    try {
      await api.post("/admin/crm/tasks/", { ...taskForm, opportunity: taskForm.opportunity || null, broker: taskForm.broker || null, due_at: new Date(taskForm.due_at).toISOString(), status: "pending" });
      setTaskForm({ contact: "", opportunity: "", title: "", kind: "follow_up", due_at: "", broker: "" });
      notify("Tarefa criada.");
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const completeTask = async (task: CRMTask) => {
    try {
      await api.patch(`/admin/crm/tasks/${task.id}/`, { status: task.status === "completed" ? "pending" : "completed" });
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createProposal = async () => {
    if (!proposalForm.opportunity || !proposalForm.total_value) return notify("Escolha a oportunidade e informe o valor total.", true);
    const installments = proposalForm.installment_count || proposalForm.installment_value
      ? [{ count: Number(proposalForm.installment_count || 0), value: normalizeDecimalInput(proposalForm.installment_value), note: "Parcelas" }] : [];
    const annual_reinforcements = proposalForm.reinforcement_count || proposalForm.reinforcement_value
      ? [{ count: Number(proposalForm.reinforcement_count || 0), value: normalizeDecimalInput(proposalForm.reinforcement_value), note: "Reforços anuais" }] : [];
    const exchanges = proposalForm.exchange_description
      ? [{ description: proposalForm.exchange_description, value: normalizeDecimalInput(proposalForm.exchange_value) }] : [];
    try {
      await api.post("/admin/crm/proposals/", {
        opportunity: proposalForm.opportunity,
        total_value: normalizeDecimalInput(proposalForm.total_value),
        down_payment: normalizeDecimalInput(proposalForm.down_payment || "0"),
        financing_value: normalizeDecimalInput(proposalForm.financing_value || "0"),
        installments, annual_reinforcements, exchanges,
        valid_until: proposalForm.valid_until || null, notes: proposalForm.notes, status: "draft",
      });
      setProposalForm({ opportunity: "", total_value: "", down_payment: "", financing_value: "", installment_count: "", installment_value: "", reinforcement_count: "", reinforcement_value: "", exchange_description: "", exchange_value: "", valid_until: "", notes: "" });
      notify("Proposta versionada criada.");
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const updateProposalStatus = async (proposal: CRMProposal, status: CRMProposal["status"]) => {
    try {
      await api.patch(`/admin/crm/proposals/${proposal.id}/`, { status });
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const uploadImport = async () => {
    if (!importFile) return notify("Selecione o PDF ou CSV.", true);
    setBusy(true);
    try {
      const data = new FormData(); data.append("file", importFile); data.append("source_label", importLabel);
      const response = await api.post<CRMImportBatch>("/admin/crm/imports/", data);
      setCurrentBatch(response.data.id);
      setImportFile(null);
      notify(response.data.status === "failed" ? response.data.errors.join(" ") : `${response.data.total_rows} registros enviados para revisão.`, response.data.status === "failed");
      await refreshCRM();
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setBusy(false); }
  };
  const ignoreImportRow = async (row: CRMImportRow) => {
    try {
      await api.patch(`/admin/crm/import-rows/${row.id}/`, { status: "ignored" });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["crm-import-rows", currentBatch] }), queryClient.invalidateQueries({ queryKey: ["crm-imports"] })]);
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const ignoreAllInvalidRows = async () => {
    if (!currentBatch) return;
    setBusy(true);
    try {
      const response = await api.post<{ ignored_rows: number }>(`/admin/crm/imports/${currentBatch}/ignore-invalid/`);
      notify(`${response.data.ignored_rows} registros inválidos foram ignorados.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["crm-import-rows", currentBatch] }), queryClient.invalidateQueries({ queryKey: ["crm-imports"] })]);
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setBusy(false); }
  };
  const editImportRow = (row: CRMImportRow) => {
    setEditingImportRow(row);
    setImportRowForm({ ...row.normalized_data });
  };
  const saveImportRow = async () => {
    if (!editingImportRow) return;
    try {
      await api.patch(`/admin/crm/import-rows/${editingImportRow.id}/`, { normalized_data: importRowForm });
      setEditingImportRow(null);
      notify("Registro saneado e validado novamente.");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["crm-import-rows", currentBatch] }), queryClient.invalidateQueries({ queryKey: ["crm-imports"] })]);
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const commitImport = async () => {
    if (!currentBatch) return;
    setBusy(true);
    try {
      const response = await api.post<{ imported_rows: number }>(`/admin/crm/imports/${currentBatch}/commit/`);
      notify(`${response.data.imported_rows} contatos novos importados. Duplicados não foram cadastrados novamente.`);
      await refreshCRM();
      await queryClient.invalidateQueries({ queryKey: ["crm-import-rows", currentBatch] });
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setBusy(false); }
  };
  const markNotificationRead = async (notification: CRMNotification) => {
    if (!notification.read_at) await api.post(`/admin/crm/notifications/${notification.id}/mark-read/`);
    await queryClient.invalidateQueries({ queryKey: ["crm-notifications"] });
  };
  const markAllNotificationsRead = async () => {
    await api.post("/admin/crm/notifications/mark-all-read/");
    await queryClient.invalidateQueries({ queryKey: ["crm-notifications"] });
  };
  const createBrokerAccess = async () => {
    if (!brokerForm.name.trim() || !brokerForm.username.trim() || !brokerForm.password) return notify("Informe nome, usuário e senha provisória.", true);
    try {
      await api.post("/admin/brokers/", { ...brokerForm, active: true });
      setBrokerForm({ name: "", email: "", phone: "", whatsapp: "", role: "broker", username: "", password: "", can_manage_properties: false });
      notify("Corretor e acesso cadastrados.");
      await queryClient.invalidateQueries({ queryKey: ["crm-brokers"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const toggleBroker = async (broker: CRMBroker) => {
    try {
      await api.patch(`/admin/brokers/${broker.id}/`, { active: !broker.active });
      await queryClient.invalidateQueries({ queryKey: ["crm-brokers"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const toggleBrokerPropertyAccess = async (broker: CRMBroker) => {
    try {
      await api.patch(`/admin/brokers/${broker.id}/`, { can_manage_properties: !broker.can_manage_properties });
      notify(broker.can_manage_properties ? "Acesso aos imóveis removido." : "Corretor liberado para cadastrar imóveis em rascunho.");
      await queryClient.invalidateQueries({ queryKey: ["crm-brokers"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const createAdminAccess = async () => {
    if (!adminForm.first_name.trim() || !adminForm.username.trim() || !adminForm.password) return notify("Informe nome, usuário e senha provisória do administrador.", true);
    try {
      await api.post("/admin/users/", { ...adminForm, is_active: true });
      setAdminForm({ first_name: "", last_name: "", email: "", username: "", password: "" });
      notify("Novo administrador cadastrado com segurança.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const toggleAdmin = async (adminUser: AdminUser) => {
    try {
      await api.patch(`/admin/users/${adminUser.id}/`, { is_active: !adminUser.is_active });
      notify(adminUser.is_active ? "Acesso administrativo desativado." : "Acesso administrativo reativado.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const exportReport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    try {
      const response = await api.get(`/admin/crm/reports/?date_from=${reportDates.date_from}&date_to=${reportDates.date_to}&export=${format}`, { responseType: "blob" });
      const disposition = String(response.headers["content-disposition"] || "");
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `relatorio-crm.${format}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      notify(`Relatório ${format === "xlsx" ? "Excel" : "PDF"} gerado.`);
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setExporting(null); }
  };

  return <div className="crm-panel">
    <section className="crm-welcome">
      <div><small>VISÃO COMERCIAL</small><h2>Seja bem-vindo, {session.display_name || session.broker_name || session.username}.</h2><p>Acompanhe negociações, compromissos e resultados em um só lugar.</p></div>
      <span className="crm-welcome-date"><CalendarDays /> {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>
    </section>
    <div className="metrics crm-metrics">
      <div><span>Contatos</span><strong>{summaryQuery.data?.contacts ?? "—"}</strong></div>
      <div><span>Oportunidades abertas</span><strong>{summaryQuery.data?.open_opportunities ?? "—"}</strong></div>
      <div><span>Follow-ups pendentes</span><strong>{summaryQuery.data?.pending_follow_ups ?? "—"}</strong></div>
      <div><span>Negócios fechados</span><strong>{summaryQuery.data?.won_opportunities ?? "—"}</strong></div>
    </div>
    <div className="crm-tabs" role="tablist">
      <button className={tab === "funnel" ? "active" : ""} onClick={() => setTab("funnel")}><Handshake /> Funil</button>
      {session.broker_id && <button className={tab === "available" ? "active" : ""} onClick={() => setTab("available")}><UserCheck /> Leads disponíveis</button>}
      <button className={tab === "contacts" ? "active" : ""} onClick={() => setTab("contacts")}><Users /> Contatos</button>
      <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}><CalendarDays /> Agenda</button>
      <button className={tab === "proposals" ? "active" : ""} onClick={() => setTab("proposals")}><BadgeDollarSign /> Propostas</button>
      {session.can_view_all_crm && <button className={tab === "imports" ? "active" : ""} onClick={() => setTab("imports")}><FileUp /> Importações</button>}
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><BarChart3 /> Relatórios</button>
      <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}><Bell /> Avisos {unreadNotifications > 0 && <span className="crm-tab-badge">{unreadNotifications}</span>}</button>
      {session.can_manage_team && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}><ShieldCheck /> Equipe e acessos</button>}
    </div>

    {tab === "available" && session.broker_id && <>
      <section className="admin-card crm-pool-toolbar">
        <div><h2>Leads disponíveis</h2><p>Contatos ainda sem responsável. Ao assumir, o cliente entra somente na sua carteira e no seu funil.</p></div>
        <input
          type="search"
          value={poolSearch}
          placeholder="Digite o nome, inclusive outra grafia"
          onChange={(event) => setPoolSearch(event.target.value)}
        />
      </section>
      <section className="admin-card crm-pool-list">
        {(availableContactsQuery.data?.results ?? []).map((contact) => <article key={contact.id}>
          <span className="crm-avatar">{contact.name.slice(0, 1)}</span>
          <span><b>{contact.name}</b><small>{[contact.city, contact.state, contact.profile].filter(Boolean).join(" · ") || "Contato sem localização informada"}</small></span>
          <button className="gold-button" onClick={() => claimContact(contact)}><UserCheck /> Assumir atendimento</button>
        </article>)}
        {availableContactsQuery.isLoading && <p className="filter-empty">Carregando contatos disponíveis…</p>}
        {!availableContactsQuery.isLoading && !(availableContactsQuery.data?.results.length) && <p className="filter-empty">Nenhum contato disponível encontrado.</p>}
        {(availableContactsQuery.data?.previous || availableContactsQuery.data?.next) && <div className="admin-pagination">
          <span>{availableContactsQuery.data.count} contato(s) disponível(is)</span>
          <div>
            <button className="outline" disabled={!availableContactsQuery.data.previous} onClick={() => setPoolPage((page) => Math.max(1, page - 1))}>Anterior</button>
            <b>Página {poolPage}</b>
            <button className="outline" disabled={!availableContactsQuery.data.next} onClick={() => setPoolPage((page) => page + 1)}>Próxima</button>
          </div>
        </div>}
      </section>
    </>}

    {tab === "funnel" && <>
      <section className="admin-card crm-create-row">
        <h2>Nova oportunidade</h2>
        <div className="form-grid">
          <ContactPicker label="Contato" value={opportunityForm.contact} onChange={(contact) => setOpportunityForm({ ...opportunityForm, contact })} />
          <label>Imóvel<select value={opportunityForm.property} onChange={(event) => setOpportunityForm({ ...opportunityForm, property: event.target.value })}><option value="">Atendimento geral</option>{crmProperties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label>
          <label>Título<input value={opportunityForm.title} onChange={(event) => setOpportunityForm({ ...opportunityForm, title: event.target.value })} placeholder="Ex.: Compra no Riviera" /></label>
          <label>Valor esperado<input inputMode="decimal" value={opportunityForm.expected_value} onChange={(event) => setOpportunityForm({ ...opportunityForm, expected_value: normalizeDecimalInput(event.target.value) })} /></label>
          {session.can_view_all_crm && <label>Corretor responsável<select value={opportunityForm.broker} onChange={(event) => setOpportunityForm({ ...opportunityForm, broker: event.target.value })}><option value="">Ainda não atribuído</option>{teamReference.map((broker) => <option value={broker.id} key={broker.id}>{broker.name}</option>)}</select></label>}
        </div><button className="gold-button" onClick={createOpportunity}><Plus /> Adicionar ao funil</button>
      </section>
      <div className="crm-funnel">
        {crmStages.map((stage) => <section key={stage} className="crm-stage"><header><b>{crmStageLabels[stage]}</b><span>{opportunities.filter((item) => item.stage === stage).length}</span></header>{opportunities.filter((item) => item.stage === stage).map((item) => <article key={item.id}><b>{item.contact_name}</b><span>{item.title}</span>{item.property_title && <small>{item.property_title}</small>}<select aria-label="Mover oportunidade" value={item.stage} onChange={(event) => moveOpportunity(item, event.target.value as CRMOpportunity["stage"])}>{crmStages.map((value) => <option value={value} key={value}>{crmStageLabels[value]}</option>)}</select></article>)}</section>)}
      </div>
    </>}

    {tab === "contacts" && <>
      <section className="admin-card crm-contact-toolbar"><input placeholder="Buscar nome, telefone, e-mail ou cidade" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="gold-button" onClick={() => { resetContactForm(); setShowContactForm(true); }}><UserPlus /> Novo contato</button></section>
      {showContactForm && <section className="admin-card crm-contact-editor"><header><div><h2>{editingContact ? "Editar contato" : "Novo contato"}</h2><p>Dados comerciais e classificação do cliente.</p></div><button className="outline" onClick={resetContactForm}><X /> Fechar</button></header><div className="form-grid">
        <label>Nome *<input value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} /></label>
        <label>Tipo<select value={contactForm.person_type} onChange={(event) => setContactForm({ ...contactForm, person_type: event.target.value })}><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
        <label>CPF/CNPJ<input value={contactForm.document} onChange={(event) => setContactForm({ ...contactForm, document: event.target.value })} /></label>
        <label>WhatsApp<input value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} /></label>
        <label>E-mail<input type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} /></label>
        <label>Perfil<select value={contactForm.profile} onChange={(event) => setContactForm({ ...contactForm, profile: event.target.value })}><option value="general">Contato</option><option value="owner">Proprietário</option><option value="buyer">Comprador</option><option value="seller">Vendedor</option><option value="investor">Investidor</option><option value="partner">Parceiro</option></select></label>
        <label>Cidade<input value={contactForm.city} onChange={(event) => setContactForm({ ...contactForm, city: event.target.value })} /></label>
        <label>UF<input maxLength={2} value={contactForm.state} onChange={(event) => setContactForm({ ...contactForm, state: event.target.value.toUpperCase() })} /></label>
        <label>Origem<input value={contactForm.source} onChange={(event) => setContactForm({ ...contactForm, source: event.target.value })} /></label>
        {session.can_view_all_crm && <label>Corretor responsável<select value={contactForm.assigned_broker} onChange={(event) => setContactForm({ ...contactForm, assigned_broker: event.target.value })}><option value="">Sem responsável</option>{teamReference.map((broker) => <option value={broker.id} key={broker.id}>{broker.name}</option>)}</select></label>}
        <label className="crm-notes">Observações<textarea rows={4} value={contactForm.notes} onChange={(event) => setContactForm({ ...contactForm, notes: event.target.value })} /></label>
      </div><span className="crm-row-actions"><button className="gold-button" onClick={saveContact}><Save /> Salvar contato</button>{session.can_manage_team && (contactHoldersQuery.data ?? []).map((holder) => <button key={holder.id} className="outline" onClick={() => releaseContact(holder)}><X /> Remover de {holder.name}{holder.username ? ` (${holder.username})` : ""}</button>)}</span>
      {editingContact && <><div className="crm-link-editor"><h3>Vincular proprietário e imóvel</h3><div className="form-grid"><label>Imóvel cadastrado<select value={linkForm.property} onChange={(event) => setLinkForm({ ...linkForm, property: event.target.value })}><option value="">Unidade externa</option>{crmProperties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label><label>Empreendimento<input value={linkForm.development_name} onChange={(event) => setLinkForm({ ...linkForm, development_name: event.target.value })} /></label><label>Unidade/lote<input value={linkForm.unit_reference} onChange={(event) => setLinkForm({ ...linkForm, unit_reference: event.target.value })} /></label><label>Relação<select value={linkForm.relationship} onChange={(event) => setLinkForm({ ...linkForm, relationship: event.target.value })}><option value="owner">Proprietário</option><option value="co_owner">Coproprietário</option><option value="interested">Interessado</option><option value="representative">Representante</option></select></label></div><button className="outline" onClick={createPropertyLink}><Building2 /> Registrar vínculo</button><div className="crm-links">{editingContact.property_links.map((link) => <span key={link.id}>{link.property_title || `${link.development_name} ${link.unit_reference}`}</span>)}</div></div><div className="crm-timeline"><h3>Histórico de atendimento</h3><div className="crm-note-form"><textarea rows={3} placeholder="Registrar ligação, conversa ou observação" value={activityNote} onChange={(event) => setActivityNote(event.target.value)} /><button className="outline" onClick={addActivity}><Plus /> Adicionar</button></div>{(activitiesQuery.data ?? []).map((activity) => <article key={activity.id}><i /><span><b>{activity.kind}</b><p>{activity.description}</p><small>{new Date(activity.created_at).toLocaleString("pt-BR")}{activity.actor_name ? ` · ${activity.actor_name}` : ""}</small></span></article>)}</div></>}
      </section>}
      <section className="admin-card"><div className="crm-contact-list">{filteredContacts.map((contact) => <button key={contact.id} onClick={() => editContact(contact)}><span className="crm-avatar">{contact.name.slice(0, 1)}</span><span><b>{contact.name}</b><small>{contact.phone || contact.email || "Sem contato informado"}</small></span><span><i>{contact.profile}</i><small>{contact.property_links.length} imóvel(is) · {contact.opportunity_count} oportunidade(s)</small></span><span><small>{maskDocument(contact.document)}</small><em>Editar</em></span></button>)}</div>{contactsQuery.isFetching && <p className="filter-empty">Buscando contatos...</p>}{!contactsQuery.isFetching && !filteredContacts.length && <p className="filter-empty">Nenhum contato encontrado.</p>}{contactsQuery.data && (contactsQuery.data.previous || contactsQuery.data.next) && <div className="admin-pagination"><span>{contactsQuery.data.count} contato(s)</span><div><button className="outline" disabled={!contactsQuery.data.previous} onClick={() => setContactPage((page) => Math.max(1, page - 1))}>Anterior</button><b>Página {contactPage}</b><button className="outline" disabled={!contactsQuery.data.next} onClick={() => setContactPage((page) => page + 1)}>Próxima</button></div></div>}</section>
    </>}

    {tab === "tasks" && <><section className="admin-card crm-create-row"><h2>Nova tarefa ou visita</h2><div className="form-grid"><ContactPicker label="Contato" contacts={contacts} value={taskForm.contact} onChange={(contact) => setTaskForm({ ...taskForm, contact, opportunity: "" })} /><label>Oportunidade<select value={taskForm.opportunity} onChange={(event) => setTaskForm({ ...taskForm, opportunity: event.target.value })}><option value="">Sem oportunidade</option>{opportunities.filter((item) => !taskForm.contact || item.contact === taskForm.contact).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Tipo<select value={taskForm.kind} onChange={(event) => setTaskForm({ ...taskForm, kind: event.target.value })}><option value="follow_up">Follow-up</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="visit">Visita</option></select></label><label>Tarefa<input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} /></label><label>Data e hora<input type="datetime-local" value={taskForm.due_at} onChange={(event) => setTaskForm({ ...taskForm, due_at: event.target.value })} /></label>{session.can_view_all_crm && <label>Corretor responsável<select value={taskForm.broker} onChange={(event) => setTaskForm({ ...taskForm, broker: event.target.value })}><option value="">Ainda não atribuído</option>{teamReference.map((broker) => <option value={broker.id} key={broker.id}>{broker.name}</option>)}</select></label>}</div><button className="gold-button" onClick={createTask}><Plus /> Criar tarefa</button></section><section className="admin-card crm-task-list">{tasks.map((task) => <article key={task.id} className={task.status}><div><b>{task.title}</b><span>{task.contact_name}{task.property_title ? ` · ${task.property_title}` : ""}</span></div><time>{new Date(task.due_at).toLocaleString("pt-BR")}</time><button className="outline" onClick={() => completeTask(task)}>{task.status === "completed" ? "Reabrir" : "Concluir"}</button></article>)}{!tasks.length && <p className="filter-empty">Nenhuma tarefa cadastrada.</p>}</section></>}

    {tab === "proposals" && <><section className="admin-card crm-create-row"><h2>Nova proposta</h2><p>Registre as condições sem sobrescrever versões anteriores.</p><div className="form-grid"><label>Oportunidade<select value={proposalForm.opportunity} onChange={(event) => setProposalForm({ ...proposalForm, opportunity: event.target.value })}><option value="">Selecione</option>{opportunities.map((item) => <option value={item.id} key={item.id}>{item.contact_name} — {item.title}</option>)}</select></label><label>Valor total<input inputMode="decimal" value={proposalForm.total_value} onChange={(event) => setProposalForm({ ...proposalForm, total_value: event.target.value })} /></label><label>Entrada/ato<input inputMode="decimal" value={proposalForm.down_payment} onChange={(event) => setProposalForm({ ...proposalForm, down_payment: event.target.value })} /></label><label>Financiamento<input inputMode="decimal" value={proposalForm.financing_value} onChange={(event) => setProposalForm({ ...proposalForm, financing_value: event.target.value })} /></label><label>Nº de parcelas<input type="number" min="0" value={proposalForm.installment_count} onChange={(event) => setProposalForm({ ...proposalForm, installment_count: event.target.value })} /></label><label>Valor da parcela<input inputMode="decimal" value={proposalForm.installment_value} onChange={(event) => setProposalForm({ ...proposalForm, installment_value: event.target.value })} /></label><label>Nº de reforços<input type="number" min="0" value={proposalForm.reinforcement_count} onChange={(event) => setProposalForm({ ...proposalForm, reinforcement_count: event.target.value })} /></label><label>Valor do reforço<input inputMode="decimal" value={proposalForm.reinforcement_value} onChange={(event) => setProposalForm({ ...proposalForm, reinforcement_value: event.target.value })} /></label><label>Bem em dação<input placeholder="Ex.: veículo, terreno, jet" value={proposalForm.exchange_description} onChange={(event) => setProposalForm({ ...proposalForm, exchange_description: event.target.value })} /></label><label>Valor da dação<input inputMode="decimal" value={proposalForm.exchange_value} onChange={(event) => setProposalForm({ ...proposalForm, exchange_value: event.target.value })} /></label><label>Válida até<input type="date" value={proposalForm.valid_until} onChange={(event) => setProposalForm({ ...proposalForm, valid_until: event.target.value })} /></label><label>Observações<textarea value={proposalForm.notes} onChange={(event) => setProposalForm({ ...proposalForm, notes: event.target.value })} /></label></div><button className="gold-button" onClick={createProposal}><BadgeDollarSign /> Criar proposta</button></section><section className="admin-card crm-proposal-list">{(proposalsQuery.data ?? []).map((proposal) => <article key={proposal.id}><span><b>{proposal.contact_name} · versão {proposal.version}</b><small>{proposal.property_title || "Atendimento geral"} · {Number(proposal.total_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></span><span><small>Entrada: {Number(proposal.down_payment).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small><small>{proposal.installments[0]?.count || 0} parcela(s) · {proposal.annual_reinforcements[0]?.count || 0} reforço(s)</small></span><select value={proposal.status} onChange={(event) => updateProposalStatus(proposal, event.target.value as CRMProposal["status"])}><option value="draft">Rascunho</option><option value="sent">Enviada</option><option value="analysis">Em análise</option><option value="counter">Contraproposta</option><option value="accepted">Aceita</option><option value="rejected">Recusada</option><option value="expired">Expirada</option></select></article>)}{!(proposalsQuery.data ?? []).length && <p className="filter-empty">Nenhuma proposta registrada.</p>}</section></>}

    {tab === "imports" && <>
      <section className="admin-card crm-import-upload"><div><h2>Importar e sanear contatos</h2><p>PDF e CSV entram em quarentena. Revise erros e duplicidades antes de confirmar.</p></div><div className="form-grid"><label>Identificação da base<input value={importLabel} onChange={(event) => setImportLabel(event.target.value)} /></label><label>Arquivo PDF ou CSV<input type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label></div><button className="gold-button" disabled={busy} onClick={uploadImport}><Upload /> {busy ? "Processando…" : "Enviar para quarentena"}</button></section>
      <section className="admin-card"><h2>Importações</h2><div className="crm-import-list">{(importsQuery.data ?? []).map((batch) => <button className={currentBatch === batch.id ? "active" : ""} key={batch.id} onClick={() => setCurrentBatch(batch.id)}><span><b>{batch.source_label || "Importação"}</b><small>{formatDate(batch.created_at)}</small></span><i>{batch.status}</i><span>{batch.total_rows} registros</span></button>)}</div></section>
      {selectedBatch && <section className="admin-card crm-import-review">
        <header><div><h2>Revisão da importação</h2><p>{selectedBatch.valid_rows} prontos · {selectedBatch.duplicate_rows} duplicados · {selectedBatch.error_rows} com erro · {selectedBatch.imported_rows} importados</p></div>{selectedBatch.status === "review" && <span className="crm-import-actions">{selectedBatch.error_rows > 0 && <button className="outline" disabled={busy} onClick={ignoreAllInvalidRows}>Ignorar todos os inválidos</button>}<button className="gold-button" disabled={busy || selectedBatch.error_rows > 0} onClick={commitImport}><CheckCircle2 /> Importar somente novos</button></span>}</header>
        {selectedBatch.error_rows > 0 && <p className="admin-error">Corrija individualmente ou ignore todos os registros inválidos para continuar.</p>}
        <div className="crm-import-rows">{(rowsQuery.data ?? []).map((row) => <article key={row.id} className={row.status}><span><b>#{row.row_number} {row.normalized_data.name}</b><small>{row.normalized_data.unit_reference} · {row.normalized_data.email || row.normalized_data.phone}</small></span><i>{row.status === "duplicate" ? `Duplicado${row.matched_contact_name ? `: ${row.matched_contact_name}` : ` da linha ${row.normalized_data.duplicate_of_row}`} — não será importado` : row.status}</i>{row.errors.length > 0 && <span><small>{row.errors.join(" ")}</small><span className="crm-row-actions"><button className="outline" onClick={() => editImportRow(row)}>Corrigir</button><button className="outline" onClick={() => ignoreImportRow(row)}>Ignorar</button></span></span>}{editingImportRow?.id === row.id && <div className="crm-row-editor"><label>Nome<input value={importRowForm.name ?? ""} onChange={(event) => setImportRowForm({ ...importRowForm, name: event.target.value })} /></label><label>CPF/CNPJ<input value={importRowForm.document ?? ""} onChange={(event) => setImportRowForm({ ...importRowForm, document: event.target.value })} /></label><label>Telefone<input value={importRowForm.phone ?? ""} onChange={(event) => setImportRowForm({ ...importRowForm, phone: event.target.value })} /></label><label>E-mail<input value={importRowForm.email ?? ""} onChange={(event) => setImportRowForm({ ...importRowForm, email: event.target.value })} /></label><label>Unidade<input value={importRowForm.unit_reference ?? ""} onChange={(event) => setImportRowForm({ ...importRowForm, unit_reference: event.target.value })} /></label><span><button className="gold-button" onClick={saveImportRow}>Validar correção</button><button className="outline" onClick={() => setEditingImportRow(null)}>Cancelar</button></span></div>}</article>)}</div>
      </section>}
    </>}

    {tab === "reports" && <>
      <section className="admin-card crm-report-filter"><div><h2>Relatórios comerciais</h2><p>{session.can_view_all_crm ? "Visão consolidada da operação e do desempenho da equipe." : "Indicadores da sua carteira comercial."}</p></div><div className="crm-report-controls"><label>De<input type="date" value={reportDates.date_from} onChange={(event) => setReportDates({ ...reportDates, date_from: event.target.value })} /></label><label>Até<input type="date" value={reportDates.date_to} onChange={(event) => setReportDates({ ...reportDates, date_to: event.target.value })} /></label><span className="crm-export-actions"><button className="outline" disabled={!!exporting} onClick={() => exportReport("xlsx")}><FileSpreadsheet /> {exporting === "xlsx" ? "Gerando…" : "Excel"}</button><button className="outline" disabled={!!exporting} onClick={() => exportReport("pdf")}><FileText /> {exporting === "pdf" ? "Gerando…" : "PDF"}</button></span></div></section>
      {reportsQuery.data && <>
        <div className="metrics crm-report-metrics">
          <div><span>Novos contatos</span><strong>{reportsQuery.data.metrics.new_contacts}</strong></div>
          <div><span>Oportunidades</span><strong>{reportsQuery.data.metrics.new_opportunities}</strong></div>
          <div><span>Conversão</span><strong>{reportsQuery.data.metrics.conversion_rate}%</strong></div>
          <div><span>Vendas fechadas</span><strong>{reportsQuery.data.metrics.won}</strong></div>
          <div><span>Volume fechado</span><strong>{reportsQuery.data.metrics.won_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</strong></div>
          <div><span>Pipeline aberto</span><strong>{reportsQuery.data.metrics.pipeline_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</strong></div>
          <div><span>Ciclo médio</span><strong>{reportsQuery.data.metrics.average_cycle_days} dias</strong></div>
          <div><span>Tarefas atrasadas</span><strong>{reportsQuery.data.metrics.overdue_tasks}</strong></div>
        </div>
        <div className="crm-report-grid">
          <section className="admin-card"><h2>Funil atual</h2><div className="crm-report-bars">{reportsQuery.data.by_stage.map((item) => <article key={item.stage}><span><b>{item.label}</b><small>{item.total} oportunidade(s) · {item.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</small></span><i style={{ width: `${Math.max(4, item.total * 100 / Math.max(1, ...reportsQuery.data.by_stage.map((stage) => stage.total)))}%` }} /></article>)}</div></section>
          <section className="admin-card"><h2>Origem dos leads</h2><div className="crm-report-ranking">{reportsQuery.data.by_source.map((item) => <article key={item.source}><b>{item.source || "Não informada"}</b><span>{item.total}</span></article>)}{!reportsQuery.data.by_source.length && <p className="filter-empty">Sem oportunidades no período.</p>}</div></section>
        </div>
        <section className="admin-card"><h2>Desempenho por corretor</h2><div className="crm-report-table"><div className="head"><b>Corretor</b><b>Oportunidades</b><b>Fechadas</b><b>Conversão</b><b>Volume</b><b>Atrasos</b></div>{reportsQuery.data.broker_performance.map((item) => <div key={item.broker_id}><span>{item.broker_name}</span><span>{item.opportunities}</span><span>{item.won}</span><span>{item.conversion_rate}%</span><span>{item.won_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</span><span>{item.overdue_tasks}</span></div>)}</div></section>
        <section className="admin-card crm-trend"><header><div><h2>Evolução diária</h2><p>Novas oportunidades e vendas fechadas no período.</p></div><Download /></header><div className="crm-trend-chart">{reportsQuery.data.trend.map((item) => { const maximum = Math.max(1, ...reportsQuery.data.trend.map((day) => Math.max(day.opportunities, day.won))); return <article key={item.date} title={`${new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}: ${item.opportunities} oportunidades, ${item.won} vendas`}><span style={{ height: `${Math.max(item.opportunities ? 8 : 2, item.opportunities * 100 / maximum)}%` }} /><i style={{ height: `${Math.max(item.won ? 8 : 2, item.won * 100 / maximum)}%` }} /></article>; })}</div><div className="crm-trend-legend"><span><i className="opportunity" /> Oportunidades</span><span><i className="won" /> Vendas fechadas</span></div></section>
        <div className="crm-report-grid"><section className="admin-card"><h2>Atividade do período</h2><div className="crm-report-ranking"><article><b>Visitas concluídas</b><span>{reportsQuery.data.metrics.completed_visits}</span></article><article><b>Propostas movimentadas</b><span>{reportsQuery.data.metrics.sent_proposals}</span></article><article><b>Negócios perdidos</b><span>{reportsQuery.data.metrics.lost}</span></article></div></section><section className="admin-card"><h2>Principais motivos de perda</h2><div className="crm-report-ranking">{reportsQuery.data.loss_reasons.map((item) => <article key={item.loss_reason}><b>{item.loss_reason}</b><span>{item.total}</span></article>)}{!reportsQuery.data.loss_reasons.length && <p className="filter-empty">Nenhum motivo registrado no período.</p>}</div></section></div>
      </>}
    </>}

    {tab === "notifications" && <section className="admin-card crm-notifications"><header><div><h2>Central de avisos</h2><p>Atribuições, compromissos próximos e tarefas atrasadas.</p></div>{unreadNotifications > 0 && <button className="outline" onClick={markAllNotificationsRead}>Marcar todas como lidas</button>}</header>{notifications.map((notification) => <button key={notification.id} className={`${notification.priority} ${notification.read_at ? "read" : "unread"}`} onClick={() => markNotificationRead(notification)}><span><i /><b>{notification.title}</b><small>{notification.message}</small></span><time>{new Date(notification.created_at).toLocaleString("pt-BR")}</time></button>)}{!notifications.length && <p className="filter-empty">Nenhum aviso no momento.</p>}</section>}

    {tab === "team" && session.can_manage_team && <>
      <section className="admin-card crm-team-form crm-admin-form"><div><h2>Novo administrador</h2><p>Crie acessos para quem administrará imóveis, conteúdo, CRM e equipe.</p></div><div className="form-grid"><label>Nome<input value={adminForm.first_name} onChange={(event) => setAdminForm({ ...adminForm, first_name: event.target.value })} /></label><label>Sobrenome<input value={adminForm.last_name} onChange={(event) => setAdminForm({ ...adminForm, last_name: event.target.value })} /></label><label>E-mail<input type="email" value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} /></label><label>Usuário<input autoComplete="off" value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} /></label><label>Senha provisória<input type="password" minLength={8} autoComplete="new-password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} /></label></div><button className="gold-button" onClick={createAdminAccess}><ShieldCheck /> Criar administrador</button></section>
      <section className="admin-card crm-team-list crm-admin-list"><h2>Administradores do sistema</h2>{(adminUsersQuery.data ?? []).map((adminUser) => <article key={adminUser.id}><span className="crm-avatar">{adminUser.display_name.slice(0, 1).toUpperCase()}</span><span><b>{adminUser.display_name}</b><small>@{adminUser.username}{adminUser.email ? ` · ${adminUser.email}` : ""}{adminUser.username === session.username ? " · você" : ""}</small></span><i className={adminUser.is_active ? "active" : "inactive"}>{adminUser.is_superuser ? "Superadmin" : adminUser.is_active ? "Ativo" : "Inativo"}</i><button className="outline" disabled={adminUser.username === session.username || (adminUser.is_superuser && session.username !== adminUser.username)} onClick={() => toggleAdmin(adminUser)}>{adminUser.is_active ? "Desativar" : "Ativar"}</button></article>)}</section>
      <section className="admin-card crm-team-form"><div><h2>Novo acesso comercial</h2><p>Gestores enxergam toda a operação; corretores acessam a própria carteira e podem assumir leads disponíveis.</p></div><div className="form-grid"><label>Nome<input value={brokerForm.name} onChange={(event) => setBrokerForm({ ...brokerForm, name: event.target.value })} /></label><label>E-mail<input type="email" value={brokerForm.email} onChange={(event) => setBrokerForm({ ...brokerForm, email: event.target.value })} /></label><label>Telefone<input value={brokerForm.phone} onChange={(event) => setBrokerForm({ ...brokerForm, phone: event.target.value })} /></label><label>Perfil<select value={brokerForm.role} onChange={(event) => setBrokerForm({ ...brokerForm, role: event.target.value })}><option value="broker">Corretor — somente sua carteira</option><option value="manager">Gestor — todo o CRM</option></select></label><label>Usuário<input autoComplete="off" value={brokerForm.username} onChange={(event) => setBrokerForm({ ...brokerForm, username: event.target.value })} /></label><label>Senha provisória<input type="password" autoComplete="new-password" value={brokerForm.password} onChange={(event) => setBrokerForm({ ...brokerForm, password: event.target.value })} /></label><label className="check admin-check"><input type="checkbox" checked={brokerForm.can_manage_properties} onChange={(event) => setBrokerForm({ ...brokerForm, can_manage_properties: event.target.checked })} /> Pode cadastrar imóveis em rascunho</label></div><button className="gold-button" onClick={createBrokerAccess}><UserPlus /> Criar acesso</button></section>
      <section className="admin-card crm-team-list"><h2>Equipe comercial</h2>{(brokersQuery.data ?? []).map((broker) => <article key={broker.id}><span className="crm-avatar">{broker.name.slice(0, 1)}</span><span><b>{broker.name}</b><small>@{broker.user_username || "sem acesso"} · {broker.role === "manager" ? "Gestor comercial" : "Corretor"} · {broker.can_manage_properties ? "cadastra imóveis" : "sem acesso aos imóveis"}</small></span><i className={broker.active ? "active" : "inactive"}>{broker.active ? "Ativo" : "Inativo"}</i><span className="crm-team-actions"><button className="outline" onClick={() => toggleBrokerPropertyAccess(broker)}>{broker.can_manage_properties ? "Bloquear imóveis" : "Liberar imóveis"}</button><button className="outline" onClick={() => toggleBroker(broker)}>{broker.active ? "Desativar" : "Ativar"}</button></span></article>)}</section>
    </>}
  </div>;
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
  const refreshHeroSettings = (updated: SiteSettings & { id?: string }) => {
    setSettings(updated);
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    queryClient.invalidateQueries({ queryKey: ["public-settings"] });
  };
  return <div className="content-admin">
    <section className="admin-card"><h2>Contato e redes sociais</h2><div className="form-grid">{input("company_name", "Nome da empresa")}{input("whatsapp", "WhatsApp")}{input("phone", "Telefone")}{input("email", "E-mail")}{input("instagram", "Instagram")}{input("facebook", "Facebook")}{input("linkedin", "LinkedIn")}{input("youtube", "YouTube")}{input("tiktok", "TikTok")}</div><button className="gold-button" onClick={saveSettings}><Save /> Salvar dados</button></section>
    <section className="admin-card"><h2>A Imobiliária e Nossa Equipe</h2><p>Edite os textos apresentados na página institucional.</p><div className="institutional-settings">{input("about_title", "Título sobre a imobiliária")}{textarea("about_text", "Texto sobre a imobiliária")}{input("team_title", "Título da equipe")}{textarea("team_text", "Texto sobre a equipe")}</div><button className="gold-button" onClick={saveSettings}><Save /> Salvar textos</button></section>
    <HeroVideoManager settings={settings} notify={notify} onChanged={refreshHeroSettings} />
    <InstitutionalImageCreator section="company" title="Fotos da Imobiliária" items={(contentQuery.data?.institutional_images ?? []).filter((item) => item.section === "company")} notify={notify} onChanged={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} />
    <InstitutionalImageCreator section="team" title="Nossa Equipe" items={(contentQuery.data?.institutional_images ?? []).filter((item) => item.section === "team")} notify={notify} onChanged={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} />
    <HeaderCreator onCreated={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} notify={notify} items={contentQuery.data?.hero_slides ?? []} onDelete={(id) => removeItem("hero-slides", id)} onToggle={(item) => toggleItem("hero-slides", item)} onMove={(items, index, amount) => moveItem("hero-slides", items, index, amount)} />
    <TestimonialCreator onCreated={() => { queryClient.invalidateQueries({ queryKey: ["admin-public-content"] }); queryClient.invalidateQueries({ queryKey: ["public-content"] }); }} notify={notify} items={contentQuery.data?.testimonials ?? []} onDelete={(id) => removeItem("testimonials", id)} onToggle={(item) => toggleItem("testimonials", item)} onMove={(items, index, amount) => moveItem("testimonials", items, index, amount)} />
    <ContentCreator title="Perguntas frequentes" fields={[["question", "Pergunta"], ["answer", "Resposta"], ["position", "Ordem"]]} onCreate={(payload) => createItem("faqs", { ...payload, active: true })} items={contentQuery.data?.faqs ?? []} onDelete={(id) => removeItem("faqs", id)} onToggle={(item) => toggleItem("faqs", item)} onMove={(items, index, amount) => moveItem("faqs", items, index, amount)} />
  </div>;
}

function HeroVideoManager({ settings, notify, onChanged }: { settings: SiteSettings & { id?: string }; notify: (message: string, error?: boolean) => void; onChanged: (settings: SiteSettings & { id?: string }) => void }) {
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = video ? URL.createObjectURL(video) : settings.hero_video_src;
  const posterPreview = poster ? URL.createObjectURL(poster) : settings.hero_poster_src;
  const upload = async () => {
    if (!video) return notify("Selecione um vídeo MP4 para o fundo da Home.", true);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("hero_video", video);
      if (poster) body.append("hero_poster", poster);
      body.append("hero_video_enabled", "true");
      const response = settings.id
        ? await api.patch(`/admin/content/${settings.id}/`, body, { headers: { "Content-Type": "multipart/form-data" } })
        : await api.post("/admin/content/", body, { headers: { "Content-Type": "multipart/form-data" } });
      setVideo(null); setPoster(null); onChanged(response.data);
      notify("Vídeo de fundo atualizado e ativado na Home.");
    } catch (error) { notify(friendlyApiError(error), true); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    if (!settings.id) return;
    try {
      const response = await api.patch(`/admin/content/${settings.id}/`, { hero_video_enabled: !settings.hero_video_enabled });
      onChanged(response.data);
      notify(settings.hero_video_enabled ? "Vídeo de fundo pausado. A imagem de fallback será exibida." : "Vídeo de fundo ativado.");
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  const clear = async () => {
    if (!settings.id || !settings.hero_video_src || !window.confirm("Excluir o vídeo de fundo e a capa cadastrada?")) return;
    try {
      const response = await api.post(`/admin/content/${settings.id}/clear-hero-video/`);
      onChanged(response.data); setVideo(null); setPoster(null);
      notify("Vídeo de fundo removido. As imagens do Header voltaram a ser usadas.");
    } catch (error) { notify(friendlyApiError(error), true); }
  };
  return <section className="admin-card hero-video-manager">
    <div className="hero-video-admin-head"><div><h2>Vídeo de fundo da Home</h2><p>Envie um MP4 horizontal. Ele será reproduzido sem som, em loop, atrás dos filtros. Limite: 100 MB.</p></div>{settings.hero_video_src && <i className={settings.hero_video_enabled ? "enabled" : ""}>{settings.hero_video_enabled ? "Ativo" : "Pausado"}</i>}</div>
    <div className="hero-video-admin-grid">
      <div className="hero-video-preview">{preview ? <video key={preview} src={preview} poster={posterPreview} muted loop playsInline controls /> : <div><Upload /><b>Nenhum vídeo cadastrado</b><span>A Home continua usando as imagens do Header.</span></div>}</div>
      <div className="hero-video-fields">
        <label className="header-drop"><Upload /><b>{video ? video.name : "Selecionar vídeo MP4"}</b><span>Prefira vídeos horizontais, curtos e otimizados para web.</span><input type="file" accept="video/mp4" disabled={busy} onChange={(event) => setVideo(event.target.files?.[0] ?? null)} /></label>
        <label className="header-drop compact"><ImagePlus /><b>{poster ? poster.name : "Imagem de capa (opcional)"}</b><span>Mostrada enquanto o vídeo carrega ou se não puder reproduzir.</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setPoster(event.target.files?.[0] ?? null)} /></label>
      </div>
    </div>
    <div className="hero-video-actions"><button className="gold-button" disabled={busy || !video} onClick={upload}>{busy ? "Enviando vídeo..." : <><Upload /> Salvar e ativar vídeo</>}</button>{settings.hero_video_src && <button className="outline" onClick={toggle}>{settings.hero_video_enabled ? "Pausar vídeo" : "Ativar vídeo"}</button>}{settings.hero_video_src && <button className="outline danger-action" onClick={clear}><Trash2 /> Excluir vídeo</button>}</div>
  </section>;
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
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
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
  listingOptions,
  createListingOption,
  updateListingOption,
  deleteListingOption,
  canAdminister,
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
  listingOptions: ListingOption[];
  createListingOption: (
    input: Pick<ListingOption, "kind" | "name" | "city">,
  ) => Promise<ListingOption>;
  updateListingOption: (
    id: string,
    input: Pick<ListingOption, "name" | "city">,
  ) => Promise<ListingOption>;
  deleteListingOption: (id: string) => Promise<void>;
  canAdminister: boolean;
}) {
  const [saleConfirmation, setSaleConfirmation] = useState<"sell" | "restore" | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState<"archive" | "restore" | null>(null);
  const [draggingMedia, setDraggingMedia] = useState<string | null>(null);
  const [deletingMedia, setDeletingMedia] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaDeleteConfirmation, setMediaDeleteConfirmation] = useState<{ id: string; kind: string } | null>(null);
  const [propertyDeleteConfirmation, setPropertyDeleteConfirmation] = useState(false);
  const [deletingProperty, setDeletingProperty] = useState(false);
  const [optionDialog, setOptionDialog] = useState<{
    field: "property_type" | "city" | "neighborhood";
    label: string;
    option?: ListingOption;
  } | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [optionError, setOptionError] = useState("");
  const [creatingOption, setCreatingOption] = useState(false);
  const uploadFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      for (const file of selectedFiles) await upload(file);
    } finally {
      setUploadingMedia(false);
    }
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
  const catalogField = (
    name: "property_type" | "city" | "neighborhood",
    label: string,
  ) => {
    const options = listingOptions
      .filter((option) => (
        option.kind === name
        && (name !== "neighborhood" || option.city === String(form.city))
      ))
      .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
    const disabled = name === "neighborhood" && !form.city;
    const selectedOption = options.find((option) => option.name === String(form[name] ?? ""));
    return (
      <div className="catalog-field">
        <label>
          <span>{label}<b className="required-mark"> *</b></span>
          <select
            required
            disabled={disabled}
            value={String(form[name] ?? "")}
            onChange={(event) => {
              const nextForm = { ...form, [name]: event.target.value };
              if (name === "city") nextForm.neighborhood = "";
              setForm(nextForm);
            }}
          >
            <option value="">{disabled ? "Selecione primeiro a cidade" : `Selecione ${label.toLocaleLowerCase("pt-BR")}`}</option>
            {options.map((option) => (
              <option key={option.id} value={option.name}>{option.name}</option>
            ))}
          </select>
        </label>
        {canAdminister && <button
          type="button"
          className="catalog-edit"
          disabled={disabled || !selectedOption}
          aria-label={`Editar ${label.toLocaleLowerCase("pt-BR")} selecionado`}
          title={`Editar ${label.toLocaleLowerCase("pt-BR")} selecionado`}
          onClick={() => {
            if (!selectedOption) return;
            setOptionDialog({ field: name, label, option: selectedOption });
            setNewOptionName(selectedOption.name);
            setOptionError("");
          }}
        >
          <Pencil />
        </button>}
        {canAdminister && <button
          type="button"
          className="catalog-delete-trigger"
          disabled={disabled || !selectedOption}
          aria-label={`Excluir ${label.toLocaleLowerCase("pt-BR")} selecionado`}
          title={`Excluir ${label.toLocaleLowerCase("pt-BR")} selecionado`}
          onClick={() => {
            if (!selectedOption) return;
            setOptionDialog({ field: name, label, option: selectedOption });
            setNewOptionName(selectedOption.name);
            setOptionError("");
          }}
        >
          <Trash2 />
        </button>}
        {canAdminister && <button
          type="button"
          className="catalog-add"
          disabled={disabled}
          aria-label={`Cadastrar novo ${label.toLocaleLowerCase("pt-BR")}`}
          title={`Cadastrar novo ${label.toLocaleLowerCase("pt-BR")}`}
          onClick={() => {
            setOptionDialog({ field: name, label });
            setNewOptionName("");
            setOptionError("");
          }}
        >
          <Plus />
        </button>}
      </div>
    );
  };
  return (
    <section className="admin-card editor">
      <button className="back" onClick={back}>
        <ArrowLeft /> Voltar
      </button>
      {selected.source === "whatsapp" && (
        <div className="whatsapp-ingest-banner" role="status">
          <MessageCircle />
          <span>
            <b>Recebido automaticamente do WhatsApp</b>
            Rascunho aguardando conferência. Revise os dados, contatos privados e
            mídias antes de publicar.
          </span>
        </div>
      )}
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
        {catalogField("property_type", "Tipo")}
        {catalogField("city", "Cidade")}
        {catalogField("neighborhood", "Bairro")}
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
        {canAdminister && selected.id && (
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
            <b>{uploadingMedia ? "Enviando arquivos…" : "Adicionar fotos, vídeos ou PDF"}</b>
            {uploadingMedia
              ? "Aguarde a conclusão antes de sair desta tela."
              : "No iPhone, toque aqui e escolha a Fototeca. Fotos HEIC são convertidas automaticamente."}
          </span>
          <input
            type="file"
            multiple
            disabled={uploadingMedia}
            accept=".heic,.heif,image/heic,image/heif,image/jpeg,image/png,image/webp,video/mp4,application/pdf"
            onChange={(event) => {
              void uploadFiles(event.target.files ?? []);
              event.target.value = "";
            }}
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
      {optionDialog && (
        <div className="confirm-backdrop">
          <form
            className="confirm-modal catalog-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!newOptionName.trim() || creatingOption) return;
              setCreatingOption(true);
              setOptionError("");
              try {
                const optionData = {
                  name: newOptionName.trim(),
                  city: optionDialog.field === "neighborhood" ? String(form.city) : "",
                };
                const savedOption = optionDialog.option
                  ? await updateListingOption(optionDialog.option.id, optionData)
                  : await createListingOption({
                      kind: optionDialog.field,
                      ...optionData,
                    });
                const nextForm = { ...form, [optionDialog.field]: savedOption.name };
                if (optionDialog.field === "city" && !optionDialog.option) nextForm.neighborhood = "";
                setForm(nextForm);
                setOptionDialog(null);
                setNewOptionName("");
              } catch (createError) {
                setOptionError(friendlyApiError(createError));
              } finally {
                setCreatingOption(false);
              }
            }}
          >
            {optionDialog.option ? <Pencil /> : <Plus />}
            <h2>
              {optionDialog.option ? "Editar" : "Novo"} {optionDialog.label.toLocaleLowerCase("pt-BR")}
            </h2>
            {optionDialog.option && (
              <p>O novo nome será aplicado automaticamente a todos os imóveis vinculados.</p>
            )}
            {optionDialog.field === "neighborhood" && (
              <p>Este bairro pertence à cidade <b>{String(form.city)}</b>.</p>
            )}
            <label>
              Nome padronizado
              <input
                autoFocus
                required
                maxLength={120}
                value={newOptionName}
                onChange={(event) => setNewOptionName(event.target.value)}
                placeholder={`Ex.: ${optionDialog.field === "city" ? "Capão da Canoa" : optionDialog.field === "neighborhood" ? "Atlântida" : "Casa"}`}
              />
            </label>
            {optionError && <p className="form-error">{optionError}</p>}
            <div>
              {optionDialog.option && (
                <button
                  type="button"
                  className="confirm-delete catalog-delete"
                  disabled={creatingOption}
                  onClick={async () => {
                    if (!window.confirm(`Excluir “${optionDialog.option?.name}” do catálogo?`)) return;
                    setCreatingOption(true);
                    setOptionError("");
                    try {
                      await deleteListingOption(optionDialog.option!.id);
                      const nextForm = { ...form, [optionDialog.field]: "" };
                      if (optionDialog.field === "city") nextForm.neighborhood = "";
                      setForm(nextForm);
                      setOptionDialog(null);
                      setNewOptionName("");
                    } catch (deleteError) {
                      setOptionError(friendlyApiError(deleteError));
                    } finally {
                      setCreatingOption(false);
                    }
                  }}
                >
                  <Trash2 /> Excluir nome
                </button>
              )}
              <button
                type="button"
                className="outline"
                disabled={creatingOption}
                onClick={() => setOptionDialog(null)}
              >
                Cancelar
              </button>
              <button className="gold-button" disabled={creatingOption}>
                {optionDialog.option ? <Pencil /> : <Plus />}
                {creatingOption
                  ? optionDialog.option ? "Salvando..." : "Cadastrando..."
                  : optionDialog.option ? "Salvar novo nome" : "Cadastrar opção"}
              </button>
            </div>
          </form>
        </div>
      )}
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
