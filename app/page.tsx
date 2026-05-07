"use client";

import { useEffect, useMemo, useState } from "react";

type Step = "lookup" | "payment" | "confirm" | "done";

type TicketData = {
  n_ticket: string;
  tp_ticket?: string;
  dt_entrada?: string;
  tolerancia?: number;
  usuario?: string;
  status?: string;
};

const PAYMENT_WAIT_SECONDS = 10;

export default function HomePage() {
  const [step, setStep] = useState<Step>("lookup");
  const [ticketCode, setTicketCode] = useState("");
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [fullName, setFullName] = useState("");
  const [plate, setPlate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentStart, setPaymentStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pixCopyPaste, setPixCopyPaste] = useState("");

  useEffect(() => {
    if (step !== "payment") return;

    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [step]);

  const remainingSeconds = useMemo(() => {
    if (!paymentStart) return PAYMENT_WAIT_SECONDS;
    const elapsed = Math.floor((now - paymentStart) / 1000);
    return Math.max(PAYMENT_WAIT_SECONDS - elapsed, 0);
  }, [now, paymentStart]);

  const canConfirmPayment = remainingSeconds === 0;

  async function handleLookup() {
    setError("");

    const normalizedCode = ticketCode.trim();
    if (!normalizedCode) {
      setError("Digite o código do ticket para continuar.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/tickets/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketCode: normalizedCode })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível buscar o ticket.");

      const pixRes = await fetch("/api/pix");
      const pixPayload = await pixRes.json();
      if (!pixRes.ok) throw new Error(pixPayload.message || "Erro ao carregar PIX.");

      setTicketData(payload.ticket);
      setPixCopyPaste(pixPayload.pixCopyPaste || "");
      setPaymentStart(Date.now());
      setStep("payment");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não conseguimos buscar seu ticket agora. Tente novamente em instantes."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setError("");
    if (fullName.trim().split(" ").length < 2) {
      setError("Digite seu nome completo para continuar.");
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

  async function handleCopyPix() {
    if (!pixCopyPaste) return;
    await navigator.clipboard.writeText(pixCopyPaste);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Pagamento e validação do ticket</h1>
        <p className="mt-1 text-sm text-slate-500">Digite o código do seu ticket</p>

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
              Ticket encontrado: <strong>{ticketData?.n_ticket}</strong>
            </p>
            <label className="block text-sm font-medium">PIX copia e cola</label>
            <div className="break-all rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs">
              {pixCopyPaste || "PIX indisponível no momento."}
            </div>
            <p className="text-xs text-slate-500">
              O PIX não será validado pelo sistema. O pagamento será conferido presencialmente ao lado do fiscal.
            </p>
            <button
              onClick={handleCopyPix}
              className="w-full rounded-xl border border-slate-300 py-2"
            >
              Copiar PIX
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!canConfirmPayment}
              className="w-full rounded-xl bg-emerald-600 py-2 font-medium text-white disabled:opacity-50"
            >
              Já fiz o Pix
            </button>
            {!canConfirmPayment && (
              <p className="text-center text-xs text-slate-500">
                Aguarde {remainingSeconds}s para liberar a próxima etapa.
              </p>
            )}
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
            <p>
              Placa gerada: <strong>{plate}</strong>
            </p>
            <p>Tolerância de +1 dia aplicada no ticket.</p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
