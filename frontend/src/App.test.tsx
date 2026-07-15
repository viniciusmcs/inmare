import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import App from "./App";
import { MediaCarousel } from "./components";
test("renders premium home", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Seu próximo/i)).toBeInTheDocument();
});

test("renders favorites route without requiring login", () => {
  localStorage.setItem("inmare-favorites", JSON.stringify(["ABC"]));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/favoritos"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "Favoritos" })).toBeInTheDocument();
});

test("uses the mobile fullscreen fallback when the native API is unavailable", () => {
  const media = [{ id: "1", kind: "image" as const, url: "/photo.jpg", caption: "", position: 0, is_primary: true, status: "ready" }];
  const { container } = render(<MediaCarousel media={media} title="Imóvel" />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir em tela cheia" }));
  expect(container.querySelector(".detail-gallery")).toHaveClass("is-fullscreen");
  fireEvent.click(screen.getByRole("button", { name: "Sair da tela cheia" }));
  expect(container.querySelector(".detail-gallery")).not.toHaveClass("is-fullscreen");
});
