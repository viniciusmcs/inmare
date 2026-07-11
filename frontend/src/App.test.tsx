import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import App from "./App";
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
