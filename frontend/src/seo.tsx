import { useEffect } from "react";

const siteName = "In Mare Negocios Imobiliarios";
const defaultDescription =
  "Imoveis para comprar, vender e investir com atendimento consultivo, seguranca e curadoria especializada da In Mare Negocios Imobiliarios.";
const defaultImage = "/assets/brand/imobiliaria4.jpg";

type SeoProps = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
  structuredData?: object | object[];
};

function absoluteUrl(path = "/") {
  const base = import.meta.env.VITE_SITE_URL || window.location.origin;
  return new URL(path, base).toString();
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: siteName,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/assets/brand/logo-transparent.png"),
    image: absoluteUrl(defaultImage),
    areaServed: "Brasil",
  };
}

export function Seo({
  title = siteName,
  description = defaultDescription,
  path = window.location.pathname,
  image = defaultImage,
  type = "website",
  noindex = false,
  structuredData,
}: SeoProps) {
  useEffect(() => {
    const fullTitle = title === siteName ? title : `${title} | ${siteName}`;
    const canonical = absoluteUrl(path);
    const imageUrl = absoluteUrl(image);
    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noindex ? "noindex,nofollow" : "index,follow" });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: siteName });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: imageUrl });
    upsertLink("canonical", canonical);

    document.querySelectorAll('script[data-seo-json="true"]').forEach((item) => item.remove());
    const data = structuredData ? (Array.isArray(structuredData) ? structuredData : [structuredData]) : [];
    data.forEach((entry) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seoJson = "true";
      script.text = JSON.stringify(entry);
      document.head.appendChild(script);
    });
  }, [title, description, path, image, type, noindex, structuredData]);

  return null;
}
