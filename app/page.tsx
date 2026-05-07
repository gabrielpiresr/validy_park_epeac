"use client";

import { useEffect, useState } from "react";

type Step = "lookup" | "payment" | "confirm" | "done";

export default function HomePage() {
  const [step, setStep] = useState<Step>("lookup");
  const [ticketCode, setTicketCode] = useState("");
  const [ticketData, setTicketData] = useState<unknown>(null);
  const [fullName, setFullName] = useState("");
  const [plate, setPlate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentStart, setPaymentStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pixCopyPaste, setPixCopyPaste] = useState("");

  const canConfirmPayment = paymentStart ? now - paymentStart >= 10000 : false;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  async function handleLookup() {
    setError("");
    if (!ticketCode.trim()) {
      setError("Digite o código do ticket.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/ticket/${ticketCode.trim()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível buscar o ticket.");
      setTicketData(payload.ticket);
      const pixRes = await fetch("/api/pix");
      const pixPayload = await pixRes.json();
      if (!pixRes.ok) throw new Error(pixPayload.message || "Erro ao carregar PIX.");
      setPixCopyPaste(pixPayload.pixCopyPaste || "");
      setStep("payment");
      setPaymentStart(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setError("");
    if (fullName.trim().split(" ").length < 2) {
      setError("Digite nome completo.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/ticket/${ticketCode.trim()}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Erro na aprovação.");

      setPlate(payload.fakePlate);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Validação de Ticket</h1>
        <p className="mt-1 text-sm text-slate-500">Fluxo rápido para confirmar pagamento via PIX.</p>

        {step === "lookup" && (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Código do ticket</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Ex: TKT-12345"
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
            />
            <button
              onClick={handleLookup}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Buscando..." : "Buscar ticket"}
            </button>
          </div>
        )}

        {step === "payment" && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
              Ticket localizado: {JSON.stringify(ticketData)}
            </p>
            <label className="block text-sm font-medium">PIX copia e cola</label>
            <div className="rounded-xl border border-slate-300 p-3 text-xs break-all">{pixCopyPaste || "PIX indisponível"}</div>
            <button
              onClick={() => navigator.clipboard.writeText(pixCopyPaste)}
              className="w-full rounded-xl border border-slate-300 py-2"
            >
              Copiar PIX
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!canConfirmPayment}
              className="w-full rounded-xl bg-emerald-600 py-2 font-medium text-white disabled:opacity-50"
            >
              Já fiz o Pix {canConfirmPayment ? "" : "(aguarde 10s)"}
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Nome completo</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Digite seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <button
              onClick={handleApprove}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Confirmando..." : "Confirmar validação"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 space-y-2 rounded-xl bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-800">Validação concluída!</p>
            <p>Placa gerada: <strong>{plate}</strong></p>
            <p>Tolerância de +1 dia aplicada no ticket.</p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
