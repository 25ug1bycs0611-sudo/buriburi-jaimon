import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../../src/App.jsx";

const renderApp = (path) => render(
  <MemoryRouter initialEntries={[path]}>
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

function fillAdmissionForm(phone = "1234567890") {
  fireEvent.change(screen.getByLabelText("Applicant name"), { target: { value: "Taylor Example" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "taylor@example.com" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2000-01-01" } });
  fireEvent.change(screen.getByLabelText("Previous qualification"), { target: { value: "Diploma" } });
  fireEvent.change(screen.getByLabelText("Previous grade or percentage"), { target: { value: "88%" } });
  fireEvent.change(screen.getByLabelText("Preferred course"), { target: { value: "Computer Science" } });
  fireEvent.change(screen.getByLabelText("Preferred department"), { target: { value: "Technology" } });
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "10 Example Street" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("admissions workflow", () => {
  it("rejects phone numbers with fewer than seven digits before sending", () => {
    renderApp("/admissions");
    fillAdmissionForm("123-456");
    fireEvent.submit(screen.getByRole("button", { name: "Submit application" }).closest("form"));

    expect(screen.getByRole("alert").textContent).toBe("Enter a valid phone number so our team can reach you.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a valid application and confirms demo-mode submissions", async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    renderApp("/admissions");
    fillAdmissionForm();
    fireEvent.submit(screen.getByRole("button", { name: "Submit application" }).closest("form"));

    expect(await screen.findByText("You’re on your way.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/admissions", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"applicantName":"Taylor Example"'),
    }));
  });

  it("shows API validation errors without reporting a successful submission", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => "application/json" },
      json: async () => ({ message: "Check the applicant name, email, phone, and preferred course." }),
    });
    renderApp("/admissions");
    fillAdmissionForm();
    fireEvent.submit(screen.getByRole("button", { name: "Submit application" }).closest("form"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("You’re on your way.")).toBeNull();
  });
});

describe("contact and profile workflows", () => {
  it("rejects phone numbers shorter than seven digits on contact messages", () => {
    renderApp("/contact");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Taylor Example" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "taylor@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number (optional)"), { target: { value: "123-456" } });
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "I would like to learn more." } });
    fireEvent.submit(screen.getByRole("button", { name: "Send your message" }).closest("form"));

    expect(screen.getByRole("alert").textContent).toBe("Please enter a valid phone number.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves profile changes while preserving unchanged account properties", async () => {
    localStorage.setItem("northstar-session", JSON.stringify({
      name: "Taylor Example",
      email: "taylor@example.com",
      role: "student",
      id: "NS202600017",
      demo: true,
    }));
    renderApp("/profile");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Taylor Updated" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form"));

    expect(await screen.findByText("Changes saved.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-session"))).toMatchObject({
      name: "Taylor Updated",
      email: "taylor@example.com",
      role: "student",
      id: "NS202600017",
      demo: true,
    });
  });
});

describe("dashboard access and leave requests", () => {
  it("redirects visitors away from the protected dashboard", async () => {
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: /Come on in/ })).toBeTruthy();
  });

  it("lets a student submit a valid demo leave request", async () => {
    localStorage.setItem("northstar-session", JSON.stringify({
      name: "Taylor Example",
      email: "taylor@example.com",
      role: "student",
      demo: true,
    }));
    renderApp("/dashboard");
    fireEvent.click(await screen.findByRole("button", { name: "Leave requests" }));
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-11-04" } });
    fireEvent.change(screen.getByLabelText("Reason for leave"), { target: { value: "Family commitment out of town" } });
    fireEvent.submit(screen.getByRole("button", { name: /Submit leave request/ }).closest("form"));

    expect(await screen.findByText("Your leave request has been submitted.")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a reversed leave date range without creating a request", async () => {
    localStorage.setItem("northstar-session", JSON.stringify({
      name: "Taylor Example",
      email: "taylor@example.com",
      role: "student",
      demo: true,
    }));
    renderApp("/dashboard");
    fireEvent.click(await screen.findByRole("button", { name: "Leave requests" }));
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-11-04" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("Reason for leave"), { target: { value: "Family commitment out of town" } });
    fireEvent.submit(screen.getByRole("button", { name: /Submit leave request/ }).closest("form"));

    expect(screen.getByRole("alert").textContent).toBe("The end date must be on or after the start date.");
    expect(screen.getByText("No leave requests yet")).toBeTruthy();
  });

  it("does not show administrator navigation to student sessions", async () => {
    localStorage.setItem("northstar-session", JSON.stringify({
      name: "Taylor Example",
      email: "taylor@example.com",
      role: "student",
      demo: true,
    }));
    renderApp("/dashboard");

    expect(await screen.findByText("YOUR WORKSPACE")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Students" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Admissions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Faculty" })).toBeNull();
  });
});
