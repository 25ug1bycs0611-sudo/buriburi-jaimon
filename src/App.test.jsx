import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";

const renderApp = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <App />
  </MemoryRouter>,
);

function fillRegistrationForm(password, confirm = password) {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Taylor Example" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "taylor@example.com" } });
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2000-01-01" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "1234567890" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Computer Science" } });
  fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "Year 1" } });
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "10 Example Street" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
}

function submitRegistrationForm() {
  fireEvent.submit(screen.getByRole("button", { name: /Create my account/ }).closest("form"));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

describe("student registration", () => {
  it("rejects passwords that do not match without making an API request", () => {
    renderApp("/register");
    fillRegistrationForm("long-enough-password", "different-password");

    submitRegistrationForm();

    expect(screen.getByRole("alert").textContent).toBe("Those passwords don't match. Give it another try.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than eight characters", () => {
    renderApp("/register");
    fillRegistrationForm("1234567");

    submitRegistrationForm();

    expect(screen.getByRole("alert").textContent).toBe("Choose a password with at least 8 characters.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts an eight-character password", async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    renderApp("/register");
    fillRegistrationForm("12345678");

    submitRegistrationForm();

    expect(await screen.findByText("Welcome to Northstar.")).toBeTruthy();
  });

  it("creates a local demo profile when the API is unavailable", async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    renderApp("/register");
    fillRegistrationForm("correct-horse");

    submitRegistrationForm();

    expect(await screen.findByText("Welcome to Northstar.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-session"))).toMatchObject({
      name: "Taylor Example",
      email: "taylor@example.com",
      role: "student",
      demo: true,
    });
  });

  it("displays API registration errors instead of silently switching to demo mode", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "An account with this email already exists." }),
    });
    renderApp("/register");
    fillRegistrationForm("correct-horse");

    submitRegistrationForm();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("An account with this email already exists.");
    expect(localStorage.getItem("northstar-session")).toBeNull();
  });

  it("sends the registration fields and saves the API session", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        token: "signed-token",
        user: { id: 17, name: "Taylor Example", email: "taylor@example.com", role: "student" },
      }),
    });
    renderApp("/register");
    fillRegistrationForm("correct-horse");

    submitRegistrationForm();

    expect(await screen.findByText("Welcome to Northstar.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Taylor Example",
        email: "taylor@example.com",
        password: "correct-horse",
        role: "student",
        department: "Computer Science",
        year: "Year 1",
        phone: "1234567890",
        dateOfBirth: "2000-01-01",
        address: "10 Example Street",
      }),
    }));
    expect(JSON.parse(localStorage.getItem("northstar-session"))).toMatchObject({
      token: "signed-token",
      role: "student",
    });
  });

  it("accepts every generated password of at least eight characters in demo mode", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8, maxLength: 32 }), async (password) => {
        fetch.mockResolvedValue({ ok: false, status: 503 });
        const { unmount } = renderApp("/register");
        try {
          fillRegistrationForm(password);
          submitRegistrationForm();

          expect(await screen.findByText("Welcome to Northstar.")).toBeTruthy();
          expect(fetch).toHaveBeenCalledTimes(1);
        } finally {
          unmount();
          localStorage.clear();
          vi.clearAllMocks();
        }
      }),
      { numRuns: 20 },
    );
  });

  it("rejects every generated password shorter than eight characters", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 7 }), (password) => {
        const { unmount } = renderApp("/register");
        try {
          fillRegistrationForm(password);
          submitRegistrationForm();

          expect(screen.getByRole("alert").textContent).toBe("Choose a password with at least 8 characters.");
          expect(fetch).not.toHaveBeenCalled();
        } finally {
          unmount();
          localStorage.clear();
          vi.clearAllMocks();
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe("login", () => {
  it("uses the demo dashboard when the API cannot be reached", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp("/login/faculty");
    fireEvent.change(screen.getByLabelText("Email address or faculty ID"), { target: { value: "taylor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });

    fireEvent.submit(screen.getByRole("button", { name: /Sign in as Faculty/ }).closest("form"));

    expect(await screen.findByText("YOUR WORKSPACE")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-session"))).toMatchObject({
      name: "Taylor",
      email: "taylor@example.com",
      role: "faculty",
      demo: true,
    });
  });

  it("shows authentication errors returned by the API", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ message: "Email or password is incorrect." }),
    });
    renderApp("/login/student");
    fireEvent.change(screen.getByLabelText("Email address or student ID"), { target: { value: "taylor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });

    fireEvent.submit(screen.getByRole("button", { name: /Sign in as Student/ }).closest("form"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Email or password is incorrect.");
    expect(localStorage.getItem("northstar-session")).toBeNull();
  });

  it("stores an API login session and opens the dashboard", async () => {
    fetch.mockImplementation((url) => Promise.resolve(url === "/api/auth/login" ? {
      ok: true,
      status: 200,
      json: async () => ({
        token: "signed-token",
        user: { id: 17, name: "Taylor Example", email: "taylor@example.com", role: "student" },
      }),
    } : {
      ok: true,
      status: 200,
      json: async () => [],
    }));
    renderApp("/login/student");
    fireEvent.change(screen.getByLabelText("Email address or student ID"), { target: { value: "taylor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });

    fireEvent.submit(screen.getByRole("button", { name: /Sign in as Student/ }).closest("form"));

    expect(await screen.findByText("YOUR WORKSPACE")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-session"))).toMatchObject({
      token: "signed-token",
      role: "student",
    });
    expect(document.querySelector(".demo-pill")?.textContent.trim()).toBe("API CONNECTED");
  });
});
