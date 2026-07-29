import { describe, expect, it, vi } from "vitest";
import { collectPages, paginateItems } from "./pagination";

describe("collectPages", () => {
  it("carrega todos os registros de uma API paginada", async () => {
    const getPage = vi.fn(async (url: string) => {
      if (url === "/admin/properties/") {
        return {
          count: 3,
          next: "http://inmareimoveis.com/api/v1/admin/properties/?page=2",
          previous: null,
          results: [{ id: "1" }, { id: "2" }],
        };
      }
      return {
        count: 3,
        next: null,
        previous: "/admin/properties/",
        results: [{ id: "3" }],
      };
    });

    await expect(collectPages("/admin/properties/", getPage)).resolves.toEqual([
      { id: "1" },
      { id: "2" },
      { id: "3" },
    ]);
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenLastCalledWith("/admin/properties/?page=2");
  });

  it("interrompe links repetidos para evitar um loop infinito", async () => {
    const getPage = vi.fn(async () => ({
      count: 1,
      next: "/admin/properties/",
      previous: null,
      results: [{ id: "1" }],
    }));

    await expect(collectPages("/admin/properties/", getPage)).resolves.toEqual([{ id: "1" }]);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it("exibe dez imóveis por página e limita páginas fora do intervalo", () => {
    const properties = Array.from({ length: 32 }, (_, index) => index + 1);
    expect(paginateItems(properties, 1, 10)).toMatchObject({
      page: 1,
      pageCount: 4,
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(paginateItems(properties, 4, 10).items).toEqual([31, 32]);
    expect(paginateItems(properties, 99, 10).page).toBe(4);
  });
});
