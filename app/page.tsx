"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Step = "lookup" | "identify" | "payment" | "done";

type TicketData = {
  n_ticket: string;
  tp_ticket?: string;
  placa?: string;
  dt_entrada?: string;
  tolerancia?: string;
  usuario?: string;
  status?: string;
};

type ValidationOutcome =
  | { success: true; generatedPlate: string; newTolerance: string }
  | { success: false; message: string };

type BarcodeDetectorLike = {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructorLike = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const PAYMENT_WAIT_SECONDS = 10;
const AUTO_COUNTDOWN_DELAY_SECONDS = 10;
const TICKET_CODE_PATTERN = /^01\d{10}$/;

function extractTicketCodeFromQr(rawValue: string) {
  const cleaned = rawValue.trim();
  if (TICKET_CODE_PATTERN.test(cleaned)) return cleaned;

  const match = cleaned.match(/01\d{10}/);
  return match?.[0] ?? null;
}

function estimateTolerancePlusOneDay(tolerance?: string) {
  if (!tolerance) return "-";
  const date = new Date(tolerance);
  if (Number.isNaN(date.getTime())) return `${tolerance} (+1 dia)`;
  date.setDate(date.getDate() + 1);
  return date.toLocaleString("pt-BR");
}

function formatDateTime(dateValue?: string) {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString("pt-BR");
}

function removeDiacritics(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function createFakePlateFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstNameRaw = parts[0] ?? "";
  const secondNameRaw = parts[1] ?? "";

  const firstName = removeDiacritics(firstNameRaw).replace(/[^a-zA-Z]/g, "");
  const secondName = removeDiacritics(secondNameRaw).replace(/[^a-zA-Z]/g, "");

  const source = firstName.length >= 4 ? firstName : secondName || firstName;
  const base = source.slice(0, 4).toUpperCase().padEnd(4, "X");

  return `${base}123`;
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const isTestMode = searchParams.get("is_test") === "true";

  const [step, setStep] = useState<Step>("lookup");
  const [ticketCode, setTicketCode] = useState("");
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentStart, setPaymentStart] = useState<number | null>(null);
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [generatedPlate, setGeneratedPlate] = useState("");
  const [newTolerance, setNewTolerance] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraPanelVisible, setIsCameraPanelVisible] = useState(false);
  const [cameraPanelAnimationState, setCameraPanelAnimationState] = useState<"enter" | "exit">("enter");
  const [cameraError, setCameraError] = useState("");
  const [qrFeedback, setQrFeedback] = useState("");
  const [visibleStep, setVisibleStep] = useState<Step>("lookup");
  const [stepAnimationState, setStepAnimationState] = useState<"enter" | "exit">("enter");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerLoopRef = useRef<number | null>(null);
  const autoValidationStartedRef = useRef(false);
  const validationRequestRef = useRef<Promise<ValidationOutcome> | null>(null);

  useEffect(() => {
    if (step !== "payment" || !paymentStart) return;

    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [paymentStart, step]);

  useEffect(() => {
    if (step !== "payment" || hasCopiedPix || paymentStart) return;

    const fallbackTimer = setTimeout(() => {
      const startedAt = Date.now();
      setPaymentStart(startedAt);
      setNow(startedAt);
    }, AUTO_COUNTDOWN_DELAY_SECONDS * 1000);

    return () => clearTimeout(fallbackTimer);
  }, [hasCopiedPix, paymentStart, step]);

  const remainingSeconds = useMemo(() => {
    if (!paymentStart) return PAYMENT_WAIT_SECONDS;
    const elapsed = Math.floor((now - paymentStart) / 1000);
    return Math.max(PAYMENT_WAIT_SECONDS - elapsed, 0);
  }, [now, paymentStart]);

  useEffect(() => {
    if (step === visibleStep) {
      setStepAnimationState("enter");
      return;
    }

    setStepAnimationState("exit");
    const animationTimer = setTimeout(() => {
      setVisibleStep(step);
      setStepAnimationState("enter");
    }, 170);

    return () => clearTimeout(animationTimer);
  }, [step, visibleStep]);

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

      setTicketData(payload.ticket);
      setFullName("");
      setPixCopyPaste("");
      setPaymentStart(null);
      setHasCopiedPix(false);
      autoValidationStartedRef.current = false;
      validationRequestRef.current = null;
      setStep("identify");
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

  function startTicketValidation(ticket: TicketData, confirmedFullName: string) {
    if (validationRequestRef.current) return validationRequestRef.current;

    if (isTestMode) {
      validationRequestRef.current = Promise.resolve({
        success: true,
        generatedPlate: createFakePlateFromName(confirmedFullName),
        newTolerance: estimateTolerancePlusOneDay(ticket.tolerancia)
      });
      return validationRequestRef.current;
    }

    validationRequestRef.current = fetch("/api/tickets/validate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, fullName: confirmedFullName })
    })
      .then(async (response): Promise<ValidationOutcome> => {
        const payload = await response.json();
        if (!response.ok) {
          return { success: false, message: payload.message || "Não foi possível validar o ticket" };
        }

        return {
          success: true,
          generatedPlate: payload.placaGerada || "-",
          newTolerance: payload.nova_tolerancia || "-"
        };
      })
      .catch((): ValidationOutcome => ({ success: false, message: "Não foi possível validar o ticket" }));

    return validationRequestRef.current;
  }

  async function handleConfirmFullName() {
    setError("");

    const confirmedFullName = fullName.trim();
    if (confirmedFullName.split(/\s+/).length < 2) {
      setError("Digite seu nome completo para continuar.");
      return;
    }

    if (!ticketData) {
      setError("Não foi possível validar o ticket");
      return;
    }

    startTicketValidation(ticketData, confirmedFullName);

    setLoading(true);
    try {
      const pixRes = await fetch("/api/pix");
      const pixPayload = await pixRes.json();
      if (!pixRes.ok) throw new Error(pixPayload.message || "Erro ao carregar PIX.");

      setPixCopyPaste(pixPayload.pixCopyPaste || "");
      setPaymentStart(null);
      setHasCopiedPix(false);
      autoValidationStartedRef.current = false;
      setNow(Date.now());
      setStep("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar PIX.");
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateTicket() {
    setError("");

    if (!ticketData) {
      setError("Não foi possível validar o ticket");
      return;
    }

    const confirmedFullName = fullName.trim();
    if (confirmedFullName.split(/\s+/).length < 2) {
      setError("Digite seu nome completo para continuar.");
      return;
    }

    setLoading(true);
    const outcome = await startTicketValidation(ticketData, confirmedFullName);

    if (outcome.success) {
      setGeneratedPlate(outcome.generatedPlate);
      setNewTolerance(outcome.newTolerance);
      setStep("done");
    } else {
      setError(outcome.message);
    }

    setLoading(false);
  }

  async function handleCopyPix() {
    if (!pixCopyPaste || loading) return;
    await navigator.clipboard.writeText(pixCopyPaste);
    const copiedAt = Date.now();
    setHasCopiedPix(true);
    setPaymentStart((current) => current ?? copiedAt);
    setNow(copiedAt);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  }

  useEffect(() => {
    if (step !== "payment" || !paymentStart || remainingSeconds > 0 || autoValidationStartedRef.current) {
      return;
    }

    autoValidationStartedRef.current = true;
    handleValidateTicket();
  }, [hasCopiedPix, paymentStart, remainingSeconds, step]);

  function stopScanner() {
    if (scannerLoopRef.current) {
      cancelAnimationFrame(scannerLoopRef.current);
      scannerLoopRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (scannerVideoRef.current) {
      scannerVideoRef.current.pause();
      scannerVideoRef.current.srcObject = null;
    }
  }

  async function handleOpenCamera() {
    setCameraError("");
    setQrFeedback("");

    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setCameraError("Leitura de QR Code não suportada neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      scannerStreamRef.current = stream;
      setCameraPanelAnimationState("exit");
      setIsCameraOpen(true);
    } catch {
      setCameraError("Permissão de câmera negada. Digite o código manualmente.");
    }
  }

  function handleCloseCamera() {
    stopScanner();
    setCameraPanelAnimationState("exit");
    setTimeout(() => {
      setIsCameraOpen(false);
      setIsCameraPanelVisible(false);
    }, 200);
  }

  useEffect(() => {
    if (!isCameraOpen) return;
    setIsCameraPanelVisible(true);
    const timer = setTimeout(() => setCameraPanelAnimationState("enter"), 10);
    return () => clearTimeout(timer);
  }, [isCameraOpen]);

  useEffect(() => {
    if (!isCameraOpen || !isCameraPanelVisible || !scannerVideoRef.current || !scannerStreamRef.current) return;

    let isCancelled = false;
    const video = scannerVideoRef.current;
    const stream = scannerStreamRef.current;
    const BarcodeDetectorApi = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructorLike }).BarcodeDetector;
    if (!BarcodeDetectorApi) {
      setCameraError("Leitura de QR Code não suportada neste navegador.");
      handleCloseCamera();
      return;
    }
    const detector = new BarcodeDetectorApi({ formats: ["qr_code"] });

    async function runScanner() {
      try {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();

        const scan = async () => {
          if (isCancelled) return;

          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue ?? "";
              const extractedCode = extractTicketCodeFromQr(rawValue);

              if (extractedCode && TICKET_CODE_PATTERN.test(extractedCode)) {
                setTicketCode(extractedCode);
                setQrFeedback("QR Code lido com sucesso.");
                handleCloseCamera();
                return;
              }

              setQrFeedback("QR Code inválido. Digite o código manualmente.");
              handleCloseCamera();
              return;
            }
          } catch {
            setQrFeedback("QR Code inválido. Digite o código manualmente.");
            handleCloseCamera();
            return;
          }

          scannerLoopRef.current = requestAnimationFrame(scan);
        };

        scannerLoopRef.current = requestAnimationFrame(scan);
      } catch {
        setCameraError("Não foi possível iniciar a câmera.");
        handleCloseCamera();
      }
    }

    runScanner();

    return () => {
      isCancelled = true;
      stopScanner();
    };
  }, [isCameraOpen, isCameraPanelVisible]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 rounded-xl bg-[#0F2D63] px-4 py-3">
          <Image
            src="https://epeac.com.br/wp-content/uploads/2025/07/Camada_1-8-1.png"
            alt="Logo EPEAC"
            width={180}
            height={48}
            className="h-10 w-auto"
            priority
          />
        </div>
        <h1 className="text-xl font-semibold">Pagamento e validação do ticket</h1>
        <p className="mt-1 text-sm text-slate-500">
          Você parceiro da EPEAC garante R$25 pela diária. Siga as etapas para validar o seu ticket.
        </p>

        <div
          className={`transition-all duration-200 ease-out ${
            stepAnimationState === "enter" ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
        {visibleStep === "lookup" && (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Código do ticket</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Ex: 010705110149"
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
            />
            <button
              onClick={handleOpenCamera}
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2 font-medium transition-colors duration-200 hover:bg-slate-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h3l1.5-2.25h7.5l1.5 2.25h3A1.5 1.5 0 0 1 21.75 9v9A1.5 1.5 0 0 1 20.25 19.5H3.75A1.5 1.5 0 0 1 2.25 18V9a1.5 1.5 0 0 1 1.5-1.5Z" />
                <circle cx="12" cy="13.5" r="3.25" />
              </svg>
              Ler QR Code
            </button>
            {isCameraPanelVisible && (
              <div
                className={`space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3 transition-all duration-200 ease-out ${
                  cameraPanelAnimationState === "enter"
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-1 scale-[0.98] opacity-0"
                }`}
              >
                <video ref={scannerVideoRef} className="h-64 w-full rounded-lg bg-black object-cover" muted />
                <button
                  onClick={handleCloseCamera}
                  type="button"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 text-sm font-medium"
                >
                  Cancelar leitura
                </button>
              </div>
            )}
            {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
            {qrFeedback && <p className="text-sm text-slate-600">{qrFeedback}</p>}
            <button
              onClick={handleLookup}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Buscando..." : "Buscar ticket"}
            </button>
          </div>
        )}

        {visibleStep === "identify" && ticketData && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
              Ticket encontrado: <strong>{ticketData.n_ticket}</strong>
              <br />
              Entrada: <strong>{formatDateTime(ticketData.dt_entrada)}</strong>
            </p>
            <p className="text-sm text-slate-600">Informe seu nome completo para liberar o PIX.</p>
            <label className="block text-sm font-medium">Nome completo</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Digite seu nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <button
              onClick={handleConfirmFullName}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Carregando PIX..." : "Confirmar nome e ver PIX"}
            </button>
          </div>
        )}

        {visibleStep === "payment" && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
              Ticket encontrado: <strong>{ticketData?.n_ticket}</strong>
              <br />
              Nome: <strong>{fullName}</strong>
              <br />
              Entrada: <strong>{formatDateTime(ticketData?.dt_entrada)}</strong>
            </p>
            <label className="block text-sm font-medium">PIX copia e cola</label>
            <div className="break-all rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs">
              {pixCopyPaste || "PIX indisponível no momento."}
            </div>
            <p className="text-xs text-slate-500">Copie o PIX. A validação será automática.</p>
            <button
              onClick={handleCopyPix}
              disabled={loading || !pixCopyPaste}
              className="w-full rounded-xl border border-slate-300 py-2 disabled:opacity-60"
            >
              {copiedFeedback ? "Copiado para a área de transferência!" : "Copiar PIX"}
            </button>
            {copiedFeedback && <p className="text-center text-xs text-emerald-600">Código PIX copiado com sucesso.</p>}
            {!paymentStart && (
              <p className="text-center text-xs text-slate-500">
                Se não copiar, a contagem começa em {AUTO_COUNTDOWN_DELAY_SECONDS}s.
              </p>
            )}
            {paymentStart && remainingSeconds > 0 && (
              <p className="text-center text-xs text-slate-500">Validando automaticamente em {remainingSeconds}s.</p>
            )}
            {paymentStart && remainingSeconds === 0 && (
              <p className="text-center text-xs text-emerald-700">
                {loading ? "Validando ticket automaticamente..." : "Iniciando validação automática..."}
              </p>
            )}
          </div>
        )}

        {visibleStep === "done" && (
          <div className="mt-6 space-y-2 rounded-xl bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-800">Ticket validado com sucesso. Basta utilizar ele na saída.</p>
            <p>Nova placa gerada: <strong>{generatedPlate}</strong></p>
            <p>Nova tolerância aplicada: <strong>{newTolerance}</strong></p>
          </div>
        )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
