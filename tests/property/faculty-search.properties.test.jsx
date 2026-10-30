import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { MemoryRouter } from "react-router-dom";
import App from "../../src/App.jsx";
import { faculty } from "../../src/data.js";

const renderFacultyDirectory = () => render(
  <MemoryRouter initialEntries={["/faculty"]}>
    <App />
  </MemoryRouter>,
);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("faculty directory search properties", () => {
  it("returns exactly the faculty profiles matching generated case-insensitive queries", () => {
    const searchableFields = faculty.flatMap((person) => [person.name, person.field, person.role]);
    const queries = searchableFields.map((value) => value.slice(0, Math.max(1, Math.floor(value.length / 2))));
    const queryArbitrary = fc.constantFrom(...queries);
    const { container } = renderFacultyDirectory();
    const search = screen.getByRole("textbox", { name: "Search faculty" });

    fc.assert(
      fc.property(queryArbitrary, (query) => {
        const variedCaseQuery = query.split("").map((character, index) => (
          index % 2 === 0 ? character.toUpperCase() : character.toLowerCase()
        )).join("");
        fireEvent.change(search, { target: { value: variedCaseQuery } });

        const expectedNames = faculty
          .filter((person) => `${person.name} ${person.field} ${person.role}`.toLowerCase().includes(query.toLowerCase()))
          .map((person) => person.name);
        const actualNames = [...container.querySelectorAll(".faculty-card h3")].map((heading) => heading.textContent);
        expect(actualNames).toEqual(expectedNames);
      }),
      { numRuns: 40 },
    );
  });

  it("handles arbitrary long, empty, whitespace, and special-character searches without crashing", () => {
    const { container } = renderFacultyDirectory();
    const search = screen.getByRole("textbox", { name: "Search faculty" });

    fc.assert(
      fc.property(fc.string({ maxLength: 160 }), (query) => {
        fireEvent.change(search, { target: { value: query } });
        const expectedNames = faculty
          .filter((person) => `${person.name} ${person.field} ${person.role}`.toLowerCase().includes(query.toLowerCase()))
          .map((person) => person.name);
        const actualNames = [...container.querySelectorAll(".faculty-card h3")].map((heading) => heading.textContent);
        expect(actualNames).toEqual(expectedNames);
      }),
      { numRuns: 40 },
    );
  });
});
