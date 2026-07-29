import type { Page } from "./types";

export async function collectPages<T>(
  initialUrl: string,
  getPage: (url: string) => Promise<Page<T>>,
) {
  const results: T[] = [];
  const visited = new Set<string>();
  let url: string | null = initialUrl;

  while (url && !visited.has(url)) {
    visited.add(url);
    const page = await getPage(url);
    results.push(...page.results);
    if (page.next?.startsWith("http")) {
      const next = new URL(page.next);
      const apiPrefix = "/api/v1";
      const path = next.pathname.startsWith(`${apiPrefix}/`)
        ? next.pathname.slice(apiPrefix.length)
        : next.pathname;
      url = `${path}${next.search}`;
    } else {
      url = page.next;
    }
  }

  return results;
}

export function paginateItems<T>(items: T[], requestedPage: number, perPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * perPage;
  return {
    page,
    pageCount,
    items: items.slice(start, start + perPage),
  };
}
