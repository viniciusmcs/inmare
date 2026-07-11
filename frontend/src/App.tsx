import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bath, BedDouble, Building2, CalendarDays, Car, CheckCircle2, ChevronDown, Heart, Home, List, Map as MapIcon, MapPin, MessageCircle, Printer, Ruler, Send, Share2, X } from "lucide-react";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { benefits, Empty, Footer, getFavorites, Header, MediaCarousel, PropertyCard, SearchBar, SkeletonCards, toggleFavorite } from "./components";
import type { Page, Property, PublicContent, SiteSettings } from "./types";
import AdminPanel from "./AdminPanel";

function useSettings() { return useQuery<SiteSettings>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings/")).data }); }
function useContent() { return useQuery<PublicContent>({ queryKey: ["public-content"], queryFn: async () => (await api.get("/public/content/")).data }); }
function usePropertyPage(params = "") { return useQuery<Page<Property>>({ queryKey: ["properties", params], refetchInterval: 5000, queryFn: async () => (await api.get(`/public/properties/?${params}`)).data }); }
function Shell({ children }: { children: React.ReactNode }) { const { data } = useSettings(); return <><Header /><main>{children}</main><Footer settings={data} /></>; }
const formatMoney = (value?: string | null) => value ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Sob consulta";

function HeroSlider({ content }: { content?: PublicContent }) {
  const slides = content?.hero_slides?.length ? content.hero_slides : [{ id: "default", title: "Seu próximo imóvel começa aqui", subtitle: "Compra, venda e oportunidades com segurança, transparência e excelência.", image_src: "/assets/brand/imobiliaria4.jpg", link_url: "/imoveis", link_label: "Ver imóveis" }];
  const [index, setIndex] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setIndex((value) => (value + 1) % slides.length), 5000); return () => window.clearInterval(timer); }, [slides.length]);
  const slide = slides[index];
  return <section className="hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(3,18,33,.94),rgba(3,18,33,.25)),url("${slide.image_src}")` }}><div><small>IN MARE NEGÓCIOS IMOBILIÁRIOS</small><h1>{slide.title}</h1><p>{slide.subtitle}</p><div className="hero-actions"><Link className="gold-button" to={slide.link_url || "/imoveis"}>{slide.link_label || "Ver imóveis"} <ArrowRight /></Link><Link className="dark-button" to="/contato"><MessageCircle /> Fale conosco</Link></div></div><div className="hero-dots">{slides.map((item, itemIndex) => <button aria-label={`Banner ${itemIndex + 1}`} className={itemIndex === index ? "active" : ""} key={item.id} onClick={() => setIndex(itemIndex)} />)}</div></section>;
}

function HomePage() {
  const { data, isLoading } = usePropertyPage("page_size=20&ordering=-created_at");
  const { data: featuredData } = usePropertyPage("page_size=20&featured=true");
  const { data: launchData } = usePropertyPage("page_size=10&launches=true");
  const { data: content } = useContent();
  const properties = data?.results ?? [];
  return <Shell><HeroSlider content={content} /><SearchBar properties={properties} />
    <PropertySection eyebrow="SELEÇÃO ESPECIAL" title="Imóveis em destaque" properties={(featuredData?.results ?? []).slice(0, 4)} loading={isLoading} href="/imoveis?featured=true" />
    <PropertySection eyebrow="RECÉM-CADASTRADOS" title="Lançamentos" properties={(launchData?.results ?? []).slice(0, 4)} loading={isLoading} href="/imoveis?ordering=-created_at" />
    <section className="benefits">{benefits.map(({ icon: Icon, title, text }) => <div key={title}><Icon /><span><b>{title}</b><p>{text}</p></span></div>)}</section>
    {!!content?.testimonials.length && <section className="section testimonials"><div className="section-title"><div><small>EXPERIÊNCIAS</small><h2>Relatos de clientes</h2></div></div><div className="testimonial-grid">{content.testimonials.map((item) => <blockquote key={item.id}><header>{item.photo_src ? <img src={item.photo_src} alt={item.name} /> : <span className="testimonial-avatar">{item.name.slice(0, 1)}</span>}<div><b>{item.name}</b><small>{item.role}</small></div></header><p>“{item.text}”</p></blockquote>)}</div></section>}
    <section className="section service-choices"><div><small>ATENDIMENTO PERSONALIZADO</small><h2>Ainda não encontrou?</h2><p>Conte o que procura e a equipe In Mare fará uma busca sob medida.</p><Link className="gold-button" to="/encontrar-imovel">Encontrar meu imóvel</Link></div><div><small>CAPTAÇÃO IN MARE</small><h2>Quer anunciar?</h2><p>Envie as informações do seu imóvel para nossa equipe avaliar.</p><Link className="outline" to="/anuncie-seu-imovel">Anuncie seu imóvel</Link></div></section>
  </Shell>;
}
function PropertySection({ eyebrow, title, properties, loading, href }: { eyebrow: string; title: string; properties: Property[]; loading: boolean; href: string }) { return <section className="section"><div className="section-title"><div><small>{eyebrow}</small><h2>{title}</h2></div><Link to={href}>Ver todos <ArrowRight /></Link></div>{loading ? <SkeletonCards /> : properties.length ? <div className="property-grid">{properties.map((p) => <PropertyCard key={p.slug} property={p} />)}</div> : <Empty />}</section>; }

function PropertiesPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"list" | "map">("list");
  const page = params.get("page") || "1";
  const query = new URLSearchParams(params); query.set("page", page); query.set("page_size", "20");
  const { data, isLoading } = usePropertyPage(query.toString());
  const all = data?.results ?? [];
  const list = all;
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / 20));
  const updateParam = (name: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(name, value); else next.delete(name); next.delete("page"); setParams(next); };
  return <Shell><PageHero eyebrow="OPORTUNIDADES" title="Imóveis disponíveis" text="Encontre o imóvel ideal para viver ou investir." /><section className="section listing-section"><SearchBar properties={all} sticky /><div className="results-head"><b>{data?.count ?? 0} imóvel(is) encontrado(s)</b><div className="result-controls"><label>Ordenar por <select value={params.get("ordering") || "-created_at"} onChange={(e) => updateParam("ordering", e.target.value)}><option value="-created_at">Mais recentes</option><option value="-featured">Destaques</option><option value="price">Menor preço</option><option value="-price">Maior preço</option><option value="-private_area">Maior área</option><option value="-bedrooms">Mais dormitórios</option></select></label><div className="view-toggle"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List /> Lista</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><MapIcon /> Mapa</button></div></div></div>{isLoading ? <SkeletonCards count={8} /> : list.length ? view === "map" ? <ApproximateMap properties={list} /> : <div className="property-grid">{list.map((p) => <PropertyCard key={p.slug} property={p} />)}</div> : <Empty />}{view === "list" && totalPages > 1 && <div className="pagination">{Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => <button className={String(number) === page ? "active" : ""} key={number} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(number)); setParams(next); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{number}</button>)}</div>}</section></Shell>;
}

function ApproximateMap({ properties }: { properties: Property[] }) {
  const located = properties.filter((p) => p.approximate_latitude && p.approximate_longitude);
  const source = located.length ? located : properties;
  const coordinates = source.map((property, index) => ({ property, lat: Number(property.approximate_latitude) || index, lng: Number(property.approximate_longitude) || index }));
  const lats = coordinates.map((item) => item.lat); const lngs = coordinates.map((item) => item.lng);
  const range = (values: number[]) => Math.max(Math.max(...values) - Math.min(...values), 0.001);
  return <div className="catalog-map"><div className="map-note"><MapPin /> Localizações aproximadas para preservar a privacidade dos imóveis.</div>{coordinates.map(({ property, lat, lng }, index) => <a key={property.slug} href={`/imoveis/${property.slug}`} target="_blank" rel="noreferrer" className="map-pin" style={{ left: `${8 + ((lng - Math.min(...lngs)) / range(lngs)) * 84}%`, top: `${12 + (1 - (lat - Math.min(...lats)) / range(lats)) * 72}%` }}><MapPin /><span><b>{index + 1}. {property.title}</b><small>{property.neighborhood}, {property.city}</small><strong>{formatMoney(property.price)}</strong></span></a>)}</div>;
}

function FavoritesPage() {
  const [ids, setIds] = useState(getFavorites());
  useEffect(() => { const update = () => setIds(getFavorites()); window.addEventListener("favorites-changed", update); return () => window.removeEventListener("favorites-changed", update); }, []);
  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["favorite-properties", ids],
    queryFn: async () => (await Promise.all(ids.map(async (id) => (await api.get<Page<Property>>(`/public/properties/?public_id=${id}`)).data.results[0]))).filter(Boolean),
  });
  return <Shell><PageHero eyebrow="SUA SELEÇÃO" title="Favoritos" text="Os imóveis que você separou para consultar novamente." /><section className="section">{isLoading ? <SkeletonCards /> : properties.length ? <div className="property-grid">{properties.map((p) => <PropertyCard key={p.slug} property={p} />)}</div> : <Empty title="Você ainda não favoritou imóveis" />}</section></Shell>;
}

function PropertyDetailPage() {
  const { slug = "" } = useParams();
  const [favorite, setFavorite] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { data: property, isLoading } = useQuery<Property>({ queryKey: ["property", slug], queryFn: async () => (await api.get(`/public/properties/${slug}/`)).data });
  const { data: page } = usePropertyPage("page_size=20");
  const { data: settings = {} } = useSettings();
  useEffect(() => { if (property) setFavorite(getFavorites().includes(property.public_id)); }, [property]);
  if (isLoading || !property) return <Shell><section className="detail-page section"><SkeletonCards count={1} /></section></Shell>;
  const similar = (page?.results ?? []).filter((p) => p.slug !== property.slug && (p.city === property.city || p.property_type === property.property_type)).slice(0, 4);
  const mapQuery = property.approximate_latitude && property.approximate_longitude ? `${property.approximate_latitude},${property.approximate_longitude}` : `${property.neighborhood}, ${property.city}`;
  const facts = [
    { Icon: BedDouble, value: property.bedrooms, label: "Dormitórios" },
    { Icon: Bath, value: property.suites, label: "Suítes" },
    { Icon: Bath, value: property.bathrooms, label: "Banheiros" },
    { Icon: Car, value: property.parking_spaces, label: "Vagas" },
    { Icon: Ruler, value: property.private_area, label: "Área privativa" },
    { Icon: Building2, value: property.total_area, label: "Área total" },
  ];
  const whatsapp = settings.whatsapp?.replace(/\D/g, "");
  const areaLabel = (label: string) => label.includes("Área") ? " m²" : "";
  return <Shell>{confirmation && <PublicConfirmation onClose={() => setConfirmation(false)} />}{schedule && <VisitSchedule property={property} onClose={() => setSchedule(false)} onSuccess={() => { setSchedule(false); setConfirmation(true); }} />}<article className="property-detail"><MediaCarousel media={property.media} title={property.title} /><section className="property-overview"><div className="overview-main"><small>Cód: {property.public_id}</small><h1>{property.title}</h1><p className="overview-location"><MapPin /> {property.neighborhood}, {property.city}</p><p className={`overview-description ${showMore ? "expanded" : ""}`}>{property.public_description}</p>{property.public_description.length > 180 && <button className="read-more" onClick={() => setShowMore(!showMore)}>{showMore ? "Ver menos" : "Ver mais"} <ChevronDown /></button>}<div className="overview-costs"><div><span>{property.purpose === "rent" ? "Aluguel" : property.purpose === "season" ? "Temporada" : "Venda"}</span><strong>{formatMoney(property.price)}</strong></div>{property.condominium_fee && <div><span>Condomínio</span><b>{formatMoney(property.condominium_fee)}</b></div>}{property.iptu && <div><span>IPTU</span><b>{formatMoney(property.iptu)}</b></div>}</div><div className="overview-facts">{facts.map(({ Icon, value, label }) => value != null && <div key={label}><Icon /><span><b>{value}{areaLabel(label)}</b>{label}</span></div>)}</div>{!!property.features.length && <div className="overview-features">{property.features.slice(0, showMore ? property.features.length : 6).map((feature) => <span key={feature}>{feature}</span>)}</div>}</div><aside className="overview-actions"><div className="quick-actions"><button className={favorite ? "active" : ""} onClick={() => setFavorite(toggleFavorite(property.public_id))}><Heart /> {favorite ? "Favoritado" : "Favoritar"}</button><button onClick={() => navigator.share?.({ title: property.title, url: location.href })}><Share2 /> Enviar para alguém</button></div><button className="gold-button" onClick={() => setSchedule(true)}><CalendarDays /> Quero visitar</button><Link className="overview-outline" to={`/contato?imovel=${property.public_id}`}><MessageCircle /> Tenho interesse</Link><a className="overview-outline" href="#mais-informacoes">Mais informações</a>{whatsapp && <a className="overview-outline" target="_blank" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá, gostaria de saber mais sobre o imóvel ${property.title} - código ${property.public_id}.`)}`}><MessageCircle /> Começar conversa no WhatsApp</a>}<button className="overview-print" onClick={() => window.print()}><Printer /> Imprimir ficha</button></aside></section><section className="detail-content compact-detail" id="mais-informacoes"><div><h2>Características e condições</h2><div className="feature-list">{property.features.map((feature) => <span key={feature}>{feature}</span>)}</div>{property.accepts_financing != null && <p><b>Financiamento:</b> {property.accepts_financing ? "Aceita" : "Não aceita"}</p>}{property.accepts_exchange != null && <p><b>Permuta:</b> {property.accepts_exchange ? "Aceita" : "Não aceita"}</p>}</div><aside><h2>Localização aproximada</h2><p>Por privacidade, mostramos apenas a região do imóvel.</p><iframe title="Localização aproximada" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} /></aside></section>{!!similar.length && <PropertySection eyebrow="VEJA TAMBÉM" title="Imóveis similares" properties={similar} loading={false} href="/imoveis" />}</article></Shell>;
}

function VisitSchedule({ property, onClose, onSuccess }: { property: Property; onClose: () => void; onSuccess: () => void }) {
  const mutation = useMutation({ mutationFn: (body: object) => api.post("/public/leads/", body), onSuccess });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return <div className="filter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="visit-modal" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ ...Object.fromEntries(new FormData(event.currentTarget)), property_public_id: property.public_id, origin: "visit", consent: true, message: `Solicitação de visita para ${property.title}.` }); }}><button type="button" className="filter-close" onClick={onClose}><X /></button><CalendarDays /><h2>Agendar visita</h2><p>Escolha sua preferência. A equipe confirmará o melhor horário com você.</p><label>Imóvel<input value={property.title} readOnly /></label><label>Nome *<input name="name" required /></label><label>WhatsApp com DDD *<input name="phone" required /></label><label>E-mail<input name="email" type="email" /></label><div className="visit-row"><label>Data preferida *<input name="preferred_visit_date" type="date" min={tomorrow} required /></label><label>Período *<select name="preferred_visit_period" required defaultValue=""><option value="" disabled>Escolha</option><option>Manhã</option><option>Tarde</option><option>Noite</option></select></label></div>{mutation.isError && <p className="form-error">Não foi possível enviar. Confira os dados e tente novamente.</p>}<button className="gold-button" disabled={mutation.isPending}><Send /> Solicitar agendamento</button></form></div>;
}

function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  const { data: content } = useContent();
  const slides = content?.hero_slides?.length ? content.hero_slides : [{ id: "default", image_src: "/assets/brand/imobiliaria4.jpg" }];
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [slides.length]);
  useEffect(() => { const timer = window.setInterval(() => setIndex((value) => (value + 1) % slides.length), 5000); return () => window.clearInterval(timer); }, [slides.length]);
  return <section className="page-hero rotating-page-hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(2,18,34,.96),rgba(3,24,44,.52)),url("${slides[index]?.image_src}")` }}><small>{eyebrow}</small><h1>{title}</h1><p>{text}</p><div className="page-hero-dots">{slides.map((slide, slideIndex) => <button key={slide.id} aria-label={`Imagem ${slideIndex + 1}`} className={slideIndex === index ? "active" : ""} onClick={() => setIndex(slideIndex)} />)}</div></section>;
}
function AboutPage() {
  const { data: settings = {} } = useSettings();
  const { data: content } = useContent();
  const companyImages = content?.institutional_images?.filter((item) => item.section === "company") ?? [];
  const teamImages = content?.institutional_images?.filter((item) => item.section === "team") ?? [];
  const gallery = companyImages.length ? companyImages : [1, 2, 3, 4].map((n) => ({ id: String(n), image_src: `/assets/brand/imobiliaria${n}.jpg`, title: "Ambiente In Mare", text: "" }));
  return <Shell><PageHero eyebrow="A IMOBILIÁRIA" title="Conectando pessoas a imóveis únicos" text="Atendimento humano, consultivo e altamente qualificado." />
    <section className="section institutional"><div><small>NOSSA HISTÓRIA</small><h2>{settings.about_title || "Sobre a In Mare"}</h2><p className="institutional-copy">{settings.about_text || "Nascemos com o propósito de transformar o mercado imobiliário através de confiança, tranquilidade e experiências memoráveis."}</p>{benefits.map(({ title, text }) => <p key={title}><b>{title}:</b> {text}</p>)}</div><div className="photo-grid">{gallery.map((item) => <figure key={item.id}><img src={item.image_src} alt={item.title || "Ambiente In Mare"} />{item.text && <figcaption><b>{item.title}</b><span>{item.text}</span></figcaption>}</figure>)}</div></section>
    <section className="section institutional team-institutional"><div><small>QUEM FAZ ACONTECER</small><h2>{settings.team_title || "Nossa Equipe"}</h2><p className="institutional-copy">{settings.team_text || "Profissionais preparados para entender seus objetivos e cuidar de cada detalhe da sua jornada imobiliária."}</p></div>{teamImages.length ? <div className="photo-grid">{teamImages.map((item) => <figure key={item.id}><img src={item.image_src} alt={item.title || "Equipe In Mare"} />{(item.title || item.text) && <figcaption>{item.title && <b>{item.title}</b>}{item.text && <span>{item.text}</span>}</figcaption>}</figure>)}</div> : <div className="team-empty">As fotos da equipe aparecerão aqui após serem adicionadas no painel administrativo.</div>}</section>
  </Shell>;
}
function DevelopmentsPage() { return <Shell><PageHero eyebrow="EMPREENDIMENTOS" title="Projetos para viver o extraordinário" text="Uma seleção preparada para quem busca localização, qualidade e exclusividade." /><Empty title="Empreendimentos em preparação" /></Shell>; }

function LeadLanding({ kind }: { kind: "find" | "announce" }) {
  const { data: content } = useContent(); const [confirmation, setConfirmation] = useState(false);
  const mutation = useMutation({ mutationFn: (body: object) => api.post("/public/leads/", body), onSuccess: () => setConfirmation(true) });
  useEffect(() => { if (!confirmation) return; const timer = setTimeout(() => setConfirmation(false), 3000); return () => clearTimeout(timer); }, [confirmation]);
  return <Shell>{confirmation && <PublicConfirmation onClose={() => setConfirmation(false)} />}<PageHero eyebrow={kind === "find" ? "BUSCA PERSONALIZADA" : "CAPTAÇÃO"} title={kind === "find" ? "Encontrar meu imóvel" : "Anuncie seu imóvel"} text={kind === "find" ? "Conte o que procura e nossa equipe fará uma busca personalizada." : "Apresente seu imóvel para a curadoria da In Mare."} /><section className="contact"><form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; mutation.mutate({ ...Object.fromEntries(new FormData(form)), origin: kind, consent: true }, { onSuccess: () => form.reset() }); }}><h2>{kind === "find" ? "O imóvel que você procura" : "Informações do seu imóvel"}</h2><label>Nome *<input name="name" required /></label><label>WhatsApp com DDD *<input name="phone" required /></label><label>E-mail<input name="email" type="email" /></label><label>Descreva localização, características e valor *<textarea name="message" required rows={8} /></label><button className="gold-button" disabled={mutation.isPending}><Send /> Enviar solicitação</button></form><aside><Home /><h2>Atendimento consultivo</h2><p>Nossa equipe avaliará sua solicitação e entrará em contato.</p></aside></section>{kind === "announce" && !!content?.faqs.length && <section className="section faq"><div className="section-title"><div><small>DÚVIDAS FREQUENTES</small><h2>Antes de anunciar</h2></div></div>{content.faqs.map((faq) => <details key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}</Shell>;
}
function PublicConfirmation({ onClose }: { onClose: () => void }) { return <div className="public-toast confirmation-toast" role="status"><CheckCircle2 /><div><b>Solicitação enviada!</b><p>Recebemos suas informações e entraremos em contato.</p></div><button aria-label="Fechar aviso" onClick={onClose}><X /></button><i /></div>; }
function ContactPage() {
  const { data: properties } = usePropertyPage("page_size=20"); const [params] = useSearchParams(); const [confirmation, setConfirmation] = useState(false); const { data: settings = {} } = useSettings();
  const mutation = useMutation({ mutationFn: (body: object) => api.post("/public/leads/", body), onSuccess: () => setConfirmation(true) });
  useEffect(() => { if (!confirmation) return; const timer = setTimeout(() => setConfirmation(false), 3000); return () => clearTimeout(timer); }, [confirmation]);
  return <Shell>{confirmation && <PublicConfirmation onClose={() => setConfirmation(false)} />}<PageHero eyebrow="CONTATO" title="Fale com a In Mare" text="Nossa equipe está pronta para entender o que você procura." /><section className="contact"><form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; mutation.mutate(Object.fromEntries(new FormData(form)), { onSuccess: () => form.reset() }); }}><h2>Envie sua mensagem</h2><label>Nome<input name="name" required /></label><label>Imóvel de interesse<select name="property_public_id" defaultValue={params.get("imovel") || ""}><option value="">Atendimento geral</option>{properties?.results.map((p) => <option key={p.public_id} value={p.public_id}>{p.title}</option>)}</select></label><label>WhatsApp com DDD<input name="phone" /></label><label>E-mail<input name="email" type="email" /></label><label>Mensagem<textarea name="message" required rows={6} /></label><button className="gold-button"><Send /> Enviar mensagem</button></form><aside><MessageCircle /><h2>Atendimento personalizado</h2>{settings.whatsapp && <a className="gold-button" target="_blank" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>Quero entrar em contato pelo WhatsApp</a>}</aside></section></Shell>;
}
function CookieConsent() { const [visible, setVisible] = useState(() => localStorage.getItem("inmare-cookie-consent") !== "accepted"); return visible ? <div className="cookie-consent"><button onClick={() => setVisible(false)}><X /></button><div><b>Privacidade e cookies</b><p>Utilizamos dados essenciais para melhorar sua navegação.</p></div><button className="gold-button" onClick={() => { localStorage.setItem("inmare-cookie-consent", "accepted"); setVisible(false); }}>Aceitar e continuar</button></div> : null; }

export default function App() { return <><Routes><Route path="/" element={<HomePage />} /><Route path="/imoveis" element={<PropertiesPage />} /><Route path="/imoveis/:slug" element={<PropertyDetailPage />} /><Route path="/favoritos" element={<FavoritesPage />} /><Route path="/imobiliaria" element={<AboutPage />} /><Route path="/empreendimentos" element={<DevelopmentsPage />} /><Route path="/encontrar-imovel" element={<LeadLanding kind="find" />} /><Route path="/anuncie-seu-imovel" element={<LeadLanding kind="announce" />} /><Route path="/contato" element={<ContactPage />} /><Route path="/admin/*" element={<AdminPanel />} /></Routes><CookieConsent /></>; }
