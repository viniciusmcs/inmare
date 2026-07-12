import {
  Bath, BedDouble, Building2, Car, ChevronLeft, ChevronRight, Expand, Filter,
  Heart, Home, MapPin, Menu, MessageCircle, Play, Ruler, Search, ShieldCheck, X,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { FilterOptions, Media, Property, SiteSettings } from "./types";
import { api } from "./api";

export const fallback = "/assets/property/WhatsApp Image 2026-06-08 at 13.57.42.jpeg";
const favoriteKey = "inmare-favorites";
export const getFavorites = () => JSON.parse(localStorage.getItem(favoriteKey) || "[]") as string[];
export const toggleFavorite = (id: string) => {
  const current = getFavorites();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  localStorage.setItem(favoriteKey, JSON.stringify(next));
  window.dispatchEvent(new Event("favorites-changed"));
  return next.includes(id);
};

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [favorites, setFavorites] = useState(0);
  const location = useLocation();
  useEffect(() => {
    const update = () => setFavorites(getFavorites().length);
    const scroll = () => setScrolled(window.scrollY > 45);
    update(); scroll();
    window.addEventListener("favorites-changed", update);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => { window.removeEventListener("favorites-changed", update); window.removeEventListener("scroll", scroll); };
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <header className={`header ${scrolled ? "scrolled" : ""} ${location.pathname !== "/" ? "inner" : ""}`}>
      <Link className="brand" to="/"><img src="/assets/brand/logo.jpeg" alt="In Mare" /></Link>
      <button className="menu" type="button" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-controls="site-menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      <nav id="site-menu" className={open ? "open" : ""}>
        {[["/", "Início"], ["/imobiliaria", "A Imobiliária"], ["/imoveis", "Imóveis"], ["/anuncie-seu-imovel", "Anuncie seu imóvel"], ["/empreendimentos", "Empreendimentos"], ["/contato", "Contato"]].map(([to, label]) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}</NavLink>
        ))}
        <NavLink className="favorite-nav" to="/favoritos" onClick={() => setOpen(false)}><Heart /> Favoritos {favorites > 0 && <b>{favorites}</b>}</NavLink>
      </nav>
    </header>
  );
}

export function Footer({ settings = {} }: { settings?: SiteSettings }) {
  const socials = [["Instagram", settings.instagram], ["Facebook", settings.facebook], ["LinkedIn", settings.linkedin], ["YouTube", settings.youtube], ["TikTok", settings.tiktok]].filter((item) => item[1]);
  return <footer>
    <div><img src="/assets/brand/logo.jpeg" alt="In Mare" /><p>Conectando pessoas a imóveis únicos com transparência, segurança e excelência.</p></div>
    <div><b>Navegação</b><Link to="/imoveis">Imóveis</Link><Link to="/favoritos">Favoritos</Link><Link to="/anuncie-seu-imovel">Anuncie seu imóvel</Link><Link to="/contato">Contato</Link></div>
    <div><b>Atendimento e redes</b>{settings.phone && <a href={`tel:${settings.phone}`}>{settings.phone}</a>}{settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}{socials.map(([label, url]) => <a key={label} href={url} target="_blank">{label}</a>)}</div>
  </footer>;
}

function tagLabels(property: Property) {
  const tags = [property.purpose === "rent" ? "Aluguel" : property.purpose === "season" ? "Temporada" : "Venda"];
  if (property.featured) tags.push("Destaque");
  if (property.is_launch) tags.push("Lançamento");
  if (property.exclusive) tags.push("Exclusivo");
  if (property.status === "negotiating") tags.push("Em atendimento");
  return tags;
}

export function PropertyCard({ property }: { property: Property }) {
  const images = property.media.filter((media) => media.kind === "image");
  const primary = images.find((media) => media.is_primary) || images[0];
  const [favorite, setFavorite] = useState(() => getFavorites().includes(property.public_id));
  return <article className="property-card">
    <div className="card-image">
      <img src={primary?.url || fallback} alt={property.title} loading="lazy" onError={(event) => { event.currentTarget.src = fallback; }} />
      <div className="card-tags">{tagLabels(property).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <button className={`favorite-button ${favorite ? "active" : ""}`} aria-label="Favoritar imóvel" onClick={() => setFavorite(toggleFavorite(property.public_id))}><Heart /></button>
      {!!images.length && <div className="card-counter">1/{images.length}</div>}
    </div>
    <div className="card-body">
      <small>Cód: {property.public_id}</small><h3>{property.title}</h3>
      <p className="location"><MapPin size={14} />{property.neighborhood}, {property.city}</p>
      <strong>{property.price_on_request ? "Consulte" : property.price ? Number(property.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Valor sob consulta"}</strong>
      <div className="facts">
        {property.bedrooms != null && <span><BedDouble /> {property.bedrooms}</span>}
        {property.suites != null && <span><Bath /> {property.suites} suítes</span>}
        {property.parking_spaces != null && <span><Car /> {property.parking_spaces}</span>}
        {property.private_area && <span><Ruler /> {property.private_area} m²</span>}
      </div>
      <a className="outline card-details" href={`/imoveis/${property.slug}`} target="_blank" rel="noreferrer">Ver detalhes <ChevronRight size={16} /></a>
    </div>
  </article>;
}

export function MediaCarousel({ media, title }: { media: Media[]; title: string }) {
  const items = media.filter((item) => item.kind === "image" || item.kind === "video");
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const fn = () => setFullscreen(document.fullscreenElement === ref.current); document.addEventListener("fullscreenchange", fn); return () => document.removeEventListener("fullscreenchange", fn); }, []);
  if (!items.length) return <img className="modal-hero" src={fallback} alt={title} />;
  const current = items[index];
  const next = items[(index + 1) % items.length];
  const move = (amount: number) => setIndex((value) => (value + amount + items.length) % items.length);
  return <div className={`detail-gallery ${fullscreen ? "is-fullscreen" : ""}`} ref={ref}>
    <div className="gallery-main">{current.kind === "video" ? <video src={current.url} controls playsInline /> : <img src={current.url} alt={current.caption || title} />}
      {current.kind === "video" && <span className="video-badge"><Play /> Vídeo</span>}
      <button className="carousel-prev" onClick={() => move(-1)}><ChevronLeft /></button><button className="carousel-next" onClick={() => move(1)}><ChevronRight /></button>
      <button className="carousel-fullscreen" onClick={() => document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen()}>{fullscreen ? <X /> : <Expand />} {fullscreen ? "Sair" : "Tela cheia"}</button>
    </div>
    <button className="gallery-next" onClick={() => move(1)}>{next.kind === "video" ? <video src={next.url} /> : <img src={next.url} alt="" />}<span>{index + 1}/{items.length} <ChevronRight /></span></button>
  </div>;
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return <div className="property-grid">{Array.from({ length: count }, (_, index) => <div className="property-card skeleton-card" key={index}><i /><span /><span /><span /></div>)}</div>;
}
export function Empty({ title = "Nenhum imóvel encontrado" }: { title?: string }) { return <div className="empty"><Home /><h3>{title}</h3><p>Ajuste os filtros ou volte em breve.</p></div>; }
export const benefits = [
  { icon: ShieldCheck, title: "Segurança", text: "Negociações transparentes e acompanhamento completo." },
  { icon: Building2, title: "Experiência", text: "Curadoria de imóveis e oportunidades únicas." },
  { icon: MapPin, title: "Presença local", text: "Conhecimento profundo da região e do litoral." },
  { icon: MessageCircle, title: "Atendimento", text: "Relacionamento próximo em cada etapa." },
];

export function SearchBar({ properties = [], sticky = false }: { properties?: Property[]; sticky?: boolean }) {
  const [advanced, setAdvanced] = useState(false);
  const location = useLocation();
  const current = new URLSearchParams(location.search);
  const prices = properties.map((property) => Number(property.price ?? 0)).filter(Boolean);
  const localMaxPrice = prices.length ? Math.ceil(Math.max(...prices)) : 0;
  const [selectedPrice, setSelectedPrice] = useState(localMaxPrice);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  useEffect(() => { api.get("/public/filter-options/").then((response) => setOptions(response.data)).catch(() => undefined); }, []);
  const values = (key: "bedrooms" | "suites") => [...new Set(properties.map((p) => p[key]).filter((v): v is number => v != null))].sort((a, b) => a - b);
  const types = [...new Set(properties.map((p) => p.property_type).filter(Boolean))].sort();
  const cities = [...new Set(properties.map((p) => p.city).filter(Boolean))].sort();
  const neighborhoods = [...new Set(properties.map((p) => p.neighborhood).filter(Boolean))].sort();
  const optionTypes = options?.property_types ?? types;
  const optionCities = options?.cities ?? cities;
  const optionNeighborhoods = options?.neighborhoods ?? neighborhoods;
  const optionBedrooms = options?.bedrooms ?? values("bedrooms");
  const optionSuites = options?.suites ?? values("suites");
  const effectiveMaxPrice = options?.max_price ?? localMaxPrice;
  const requestedMaxPrice = Number(current.get("max_price"));
  useEffect(() => setSelectedPrice(requestedMaxPrice || effectiveMaxPrice), [effectiveMaxPrice, requestedMaxPrice]);
  const target = "/imoveis";
  const selected = (name: string) => current.get(name) || "";
  const fields = <><label>Tipo de imóvel<select name="property_type" defaultValue={selected("property_type")}><option value="">Todos os tipos</option>{optionTypes.map((v) => <option key={v}>{v}</option>)}</select></label><label>Finalidade<select name="purpose" defaultValue={selected("purpose")}><option value="">Todas</option><option value="sale">Venda</option><option value="rent">Aluguel</option><option value="season">Temporada</option></select></label><label>Cidade<select name="city" defaultValue={selected("city")}><option value="">Todas</option>{optionCities.map((v) => <option key={v}>{v}</option>)}</select></label></>;
  return <><form className={`search-bar ${sticky ? "sticky-search" : ""}`} action={target}>{fields}<button><Search /> Buscar imóveis</button><button type="button" className="advanced-toggle" onClick={() => setAdvanced(true)}><Filter /> Mais filtros</button></form>
    {advanced && <div className="filter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdvanced(false)}><form className="filter-modal" action={target}><button type="button" className="filter-close" onClick={() => setAdvanced(false)}><X /></button><h2>Encontre seu imóvel</h2><div className="filter-grid">{fields}<label>Bairro<select name="neighborhood" defaultValue={selected("neighborhood")}><option value="">Todos</option>{optionNeighborhoods.map((v) => <option key={v}>{v}</option>)}</select></label><label>Dormitórios<select name="bedrooms" defaultValue={selected("bedrooms")}><option value="">Todos</option>{optionBedrooms.map((v) => <option key={v}>{v}</option>)}</select></label><label>Suítes<select name="suites" defaultValue={selected("suites")}><option value="">Todas</option>{optionSuites.map((v) => <option key={v}>{v}</option>)}</select></label><label>Banheiros (mínimo)<select name="bathrooms" defaultValue={selected("bathrooms")}><option value="">Todos</option>{options?.bathrooms.map((v) => <option key={v}>{v}</option>)}</select></label><label>Vagas (mínimo)<select name="parking_spaces" defaultValue={selected("parking_spaces")}><option value="">Todas</option>{options?.parking_spaces.map((v) => <option key={v}>{v}</option>)}</select></label><label>Código ou palavra-chave<input name="search" defaultValue={selected("search")} /></label><label>Área mínima (m²)<input name="min_area" type="number" min="0" defaultValue={selected("min_area")} /></label><label>Área máxima (m²)<input name="max_area" type="number" min="0" defaultValue={selected("max_area")} /></label><label className="price-range"><span>Preço máximo <b>{selectedPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</b></span><input name="max_price" type="range" min="0" max={effectiveMaxPrice || 1} step={Math.max(10000, Math.round(effectiveMaxPrice / 100) || 10000)} value={selectedPrice} onChange={(e) => setSelectedPrice(Number(e.target.value))} /></label><fieldset className="filter-checks"><legend>Características</legend><label><input name="has_video" value="true" type="checkbox" defaultChecked={selected("has_video") === "true"} /> Com vídeo</label><label><input name="accepts_financing" value="true" type="checkbox" defaultChecked={selected("accepts_financing") === "true"} /> Aceita financiamento</label><label><input name="accepts_exchange" value="true" type="checkbox" defaultChecked={selected("accepts_exchange") === "true"} /> Aceita permuta</label>{options?.features.slice(0, 12).map((feature) => <label key={feature}><input name="feature" value={feature} type="checkbox" defaultChecked={current.getAll("feature").includes(feature)} /> {feature}</label>)}</fieldset></div><button className="gold-button"><Search /> Aplicar filtros</button></form></div>}
  </>;
}
