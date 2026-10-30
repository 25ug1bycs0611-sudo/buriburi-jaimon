import React from "react";
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

function setSession(role, extra = {}) {
  localStorage.setItem("northstar-session", JSON.stringify({
    name: role === "admin" ? "Northstar Admin" : "Taylor Example",
    email: role === "admin" ? "admin@example.com" : "taylor@example.com",
    role,
    demo: true,
    ...(role === "staff" ? { department: "Computer Science" } : {}),
    ...extra,
  }));
}

describe("complaint portal demo workflows", () => {
  it("shows a personalized demo complaint and lets a student submit a new one", async () => {
    setSession("student");
    renderApp("/complaints");

    expect(await screen.findByText(/Campus Wi-Fi disconnects in the study area/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Submit a complaint/ })[0]);

    fireEvent.change(screen.getByLabelText("Complaint title *"), { target: { value: "Classroom projector does not turn on" } });
    fireEvent.change(screen.getByLabelText(/Full description/), { target: { value: "The projector in room 204 has not powered on during the last two scheduled lectures." } });
    fireEvent.change(screen.getByLabelText("Category *"), { target: { value: "Technical" } });
    fireEvent.change(screen.getByLabelText("Department *"), { target: { value: "Computer Science" } });
    fireEvent.change(screen.getByLabelText("Location *"), { target: { value: "Room 204" } });
    fireEvent.submit(screen.getByRole("button", { name: /Submit complaint/ }).closest("form"));

    expect(await screen.findByText(/Complaint CMP-\d{4}-\d+ was submitted/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-complaints-demo")).complaints)
      .toEqual(expect.arrayContaining([expect.objectContaining({ title: "Classroom projector does not turn on", status: "Submitted" })]));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("limits the staff dashboard to the assigned department in demo mode", async () => {
    setSession("staff");
    renderApp("/complaints");

    expect(await screen.findByText(/Campus Wi-Fi disconnects in the study area/)).toBeTruthy();
    expect(screen.queryByText(/Request for quieter library study space/)).toBeNull();
    expect(screen.getByText("Your department, in focus.")).toBeTruthy();
  });

  it("does not duplicate sample complaints when React StrictMode replays effects", async () => {
    setSession("student");
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={["/complaints"]}><App /></MemoryRouter>
      </React.StrictMode>,
    );

    expect(await screen.findByText(/Campus Wi-Fi disconnects in the study area/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("northstar-complaints-demo")).complaints;
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((item) => item.id)).size).toBe(2);
  });

  it("lets administrators update complaint status and publish a response", async () => {
    setSession("admin");
    renderApp("/complaints");
    fireEvent.click(await screen.findByRole("button", { name: "View CMP-2026-000001" }));
    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "Resolved" } });
    fireEvent.change(screen.getByLabelText("Response or internal update"), { target: { value: "The department has corrected the issue." } });
    fireEvent.submit(screen.getByRole("button", { name: "Save update" }).closest("form"));

    expect(await screen.findByText("Complaint update saved.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-complaints-demo")).complaints)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        complaint_code: "CMP-2026-000001",
        status: "Resolved",
        updates: expect.arrayContaining([expect.objectContaining({ message: "The department has corrected the issue." })]),
      })]));
  });

  it("lets a student rate a resolved complaint once", async () => {
    setSession("student");
    renderApp("/complaints");
    fireEvent.click(await screen.findByRole("button", { name: "View CMP-2026-000002" }));
    fireEvent.click(await screen.findByRole("button", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "The library resolved this promptly." } });
    fireEvent.submit(screen.getByRole("button", { name: "Send feedback" }).closest("form"));

    expect(await screen.findByText("Thanks for sharing your feedback.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-complaints-demo")).complaints)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        complaint_code: "CMP-2026-000002",
        feedback_rating: 5,
        feedback_comment: "The library resolved this promptly.",
      })]));
  });

  it("lets administrators create a department staff account in the demo workspace", async () => {
    setSession("admin");
    renderApp("/complaints");
    fireEvent.click(await screen.findByRole("button", { name: "People" }));
    fireEvent.click(screen.getByRole("button", { name: /Add department staff/ }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Lee" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Computer Science" } });
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "secure-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create staff account" }).closest("form"));

    expect(await screen.findByText("Department staff account created.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("northstar-complaints-demo")).staff)
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: "Jordan Lee", department: "Computer Science" })]));
    expect(JSON.parse(localStorage.getItem("northstar-complaints-demo")).staff[0]).not.toHaveProperty("password");
  });
});
