import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { supabase } from "../api/supabase";
import { createCampaign, updateCampaignStatus } from "../api/campaigns";
import { generateCampaignReport } from "../api/reports";

export default function Admin() {
  const [campaigns, setCampaigns] = useState([]);
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);

  // Form state
  const [form, setForm] = useState({
    brandName: "",
    title: "",
    budgetUsdc: "",
    payoutPerVote: "0.05",
    injectionRate: "0.30",
    selectedItems: [],
    endsAt: "",
  });

  useEffect(() => {
    loadCampaigns();
    loadItems();
  }, []);

  const loadCampaigns = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns(data ?? []);
  };

  const loadItems = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("items")
      .select("id, name, cat")
      .order("name");
    setItems(data ?? []);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const result = await createCampaign({
      brandName: form.brandName,
      title: form.title,
      budgetUsdc: parseFloat(form.budgetUsdc),
      payoutPerVote: parseFloat(form.payoutPerVote),
      injectionRate: parseFloat(form.injectionRate),
      itemIds: form.selectedItems,
      endsAt: form.endsAt || null,
    });
    if (result) {
      setForm({
        brandName: "",
        title: "",
        budgetUsdc: "",
        payoutPerVote: "0.05",
        injectionRate: "0.30",
        selectedItems: [],
        endsAt: "",
      });
      loadCampaigns();
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await updateCampaignStatus(id, newStatus);
    loadCampaigns();
  };

  const handleViewReport = async (id) => {
    const data = await generateCampaignReport(id);
    setReport(data);
  };

  const toggleItem = (itemId) => {
    setForm((f) => ({
      ...f,
      selectedItems: f.selectedItems.includes(itemId)
        ? f.selectedItems.filter((id) => id !== itemId)
        : [...f.selectedItems, itemId],
    }));
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${T.line}`,
    fontSize: 14,
    outline: "none",
    background: T.card,
  };

  const sectionStyle = {
    background: T.card,
    border: `1px solid ${T.line}`,
    borderRadius: 18,
    padding: "20px 24px",
    marginBottom: 20,
  };

  if (!supabase) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "40px 22px" }}>
        <h2 className="disp" style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
          Admin
        </h2>
        <p style={{ color: T.soft }}>
          Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "20px 22px 52px" }}>
      <h2 className="disp" style={{ fontSize: 36, fontWeight: 800, marginBottom: 24 }}>
        Campaign Admin
      </h2>

      {/* Create Campaign */}
      <div style={sectionStyle}>
        <h3 className="disp" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          Create Campaign
        </h3>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            style={inputStyle}
            placeholder="Brand name"
            value={form.brandName}
            onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
            required
          />
          <input
            style={inputStyle}
            placeholder="Campaign title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              placeholder="Budget (USDC)"
              value={form.budgetUsdc}
              onChange={(e) => setForm((f) => ({ ...f, budgetUsdc: e.target.value }))}
              required
            />
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              placeholder="Payout/vote"
              value={form.payoutPerVote}
              onChange={(e) => setForm((f) => ({ ...f, payoutPerVote: e.target.value }))}
            />
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="Injection rate"
              value={form.injectionRate}
              onChange={(e) => setForm((f) => ({ ...f, injectionRate: e.target.value }))}
            />
          </div>
          <input
            style={inputStyle}
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          />

          {/* Item selector */}
          <div>
            <div className="mono" style={{ fontSize: 10, color: T.soft, letterSpacing: "0.14em", marginBottom: 8 }}>
              SELECT ITEMS ({form.selectedItems.length} selected)
            </div>
            <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    border: `1px solid ${form.selectedItems.includes(item.id) ? T.pop : T.line}`,
                    background: form.selectedItems.includes(item.id) ? T.pop : "transparent",
                    color: form.selectedItems.includes(item.id) ? "#fff" : T.ink,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            style={{
              background: T.ink,
              color: T.paper,
              border: "none",
              padding: "12px 20px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create Campaign
          </button>
        </form>
      </div>

      {/* Active Campaigns Table */}
      <div style={sectionStyle}>
        <h3 className="disp" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          Campaigns
        </h3>
        {campaigns.length === 0 ? (
          <p style={{ color: T.soft, fontSize: 14 }}>No campaigns yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {campaigns.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: T.paper,
                  borderRadius: 12,
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: T.soft }}>
                    {c.brand_name} · ${Number(c.spent_usdc).toFixed(2)} / ${Number(c.budget_usdc).toFixed(2)} USDC
                  </div>
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 99,
                    background: c.status === "active" ? "#4ade80" : T.line,
                    color: c.status === "active" ? T.ink : T.soft,
                    fontWeight: 700,
                  }}
                >
                  {c.status.toUpperCase()}
                </span>
                <button
                  onClick={() => handleToggleStatus(c.id, c.status)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${T.line}`,
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {c.status === "active" ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => handleViewReport(c.id)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${T.line}`,
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Report
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report View */}
      {report && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="disp" style={{ fontSize: 20, fontWeight: 700 }}>
              Report: {report.campaign.title}
            </h3>
            <button
              onClick={() => setReport(null)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                color: T.soft,
              }}
            >
              ×
            </button>
          </div>
          <pre
            style={{
              background: T.paper,
              padding: 16,
              borderRadius: 10,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 400,
            }}
          >
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
