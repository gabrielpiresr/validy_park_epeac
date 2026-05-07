"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Step = "lookup" | "payment" | "confirm" | "done";

type TicketData = {
  n_ticket: string;
  tp_ticket?: string;
  placa?: string;
  dt_entrada?: string;
  tolerancia?: string;
  usuario?: string;
  status?: string;
};

type BarcodeDetectorLike = {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructorLike = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const PAYMENT_WAIT_SECONDS = 10;
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

function addOneDayToTolerance(tolerancia?: string) {
  if (!tolerancia) return "";

  const baseDate = new Date(tolerancia);
  if (Number.isNaN(baseDate.getTime())) return "";

  const oneDayMs = 24 * 60 * 60 * 1000;
  const updated = new Date(baseDate.getTime() + oneDayMs);

  const tzOffsetMinutes = -3 * 60;
  const localMs = updated.getTime() + tzOffsetMinutes * 60 * 1000;
  const localDate = new Date(localMs);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(localDate.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
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
  const [now, setNow] = useState(Date.now());
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [generatedPlate, setGeneratedPlate] = useState("");
  const [newTolerance, setNewTolerance] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [testPreview, setTestPreview] = useState<{ url: string; payload: string; backendPayload: string } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [qrFeedback, setQrFeedback] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerLoopRef = useRef<number | null>(null);

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

  async function handleValidateTicket() {
    setError("");

    if (!ticketData) {
      setError("Não foi possível validar o ticket");
      return;
    }

    if (fullName.trim().split(" ").length < 2) {
      setError("Digite seu nome completo para continuar.");
      return;
    }

    const requestUrl = "/api/tickets/validate";
    const requestBody = { ticket: ticketData, fullName: fullName.trim() };

    if (isTestMode) {
      const placaGerada = createFakePlateFromName(fullName.trim());
      const backendPayload = {
        n_ticket: ticketData.n_ticket,
        tp_ticket: "A",
        placa: placaGerada,
        dt_entrada: ticketData.dt_entrada,
        tolerancia: ticketData.tolerancia,
        add_min: 0,
        add_hora: 0,
        add_dia: 1,
        indeterminado: false,
        nova_tolerancia: addOneDayToTolerance(ticketData.tolerancia),
        id_patio: 35,
        usuario: "epeac.leandro.carvalho",
        status: "V"
      };

      setTestPreview({
        url: requestUrl,
        payload: JSON.stringify(requestBody, null, 2),
        backendPayload: JSON.stringify(backendPayload, null, 2)
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível validar o ticket");

      setGeneratedPlate(payload.placaGerada || "-");
      setNewTolerance(payload.nova_tolerancia || "-");
      setStep("done");
    } catch {
      setError("Não foi possível validar o ticket");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyPix() {
    if (!pixCopyPaste) return;
    await navigator.clipboard.writeText(pixCopyPaste);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  }

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
      setIsCameraOpen(true);
    } catch {
      setCameraError("Permissão de câmera negada. Digite o código manualmente.");
    }
  }

  function handleCloseCamera() {
    stopScanner();
    setIsCameraOpen(false);
  }

  useEffect(() => {
    if (!isCameraOpen || !scannerVideoRef.current || !scannerStreamRef.current) return;

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
  }, [isCameraOpen]);

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

        {step === "lookup" && (
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
              className="w-full rounded-xl border border-slate-300 py-2 font-medium"
            >
              Ler QR Code
            </button>
            {isCameraOpen && (
              <div className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
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

        {step === "payment" && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
              Ticket encontrado: <strong>{ticketData?.n_ticket}</strong>
              <br />
              Entrada: <strong>{formatDateTime(ticketData?.dt_entrada)}</strong>
            </p>
            <label className="block text-sm font-medium">PIX copia e cola</label>
            <div className="break-all rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs">
              {pixCopyPaste || "PIX indisponível no momento."}
            </div>
            <p className="text-xs text-slate-500">
              O PIX não será validado pelo sistema. O pagamento será conferido presencialmente ao lado do fiscal.
            </p>
            <button onClick={handleCopyPix} className="w-full rounded-xl border border-slate-300 py-2">
              {copiedFeedback ? "Copiado para a área de transferência!" : "Copiar PIX"}
            </button>
            {copiedFeedback && <p className="text-center text-xs text-emerald-600">Código PIX copiado com sucesso.</p>}
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

        {step === "confirm" && ticketData && (
          <div className="mt-6 space-y-3">
            {isTestMode && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Modo teste ativo</p>
                <p>Ao clicar em <strong>Confirmar validação</strong>, nenhuma chamada de validação será enviada e nenhum dado será alterado externamente.</p>
              </div>
            )}
            <label className="block text-sm font-medium">Nome completo</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Digite seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <button
              onClick={handleValidateTicket}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Validando..." : "Confirmar validação"}
            </button>

            {isTestMode && testPreview && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="font-semibold text-amber-800">Modo teste ativo: validação externa ignorada.</p>
                <p><strong>URL:</strong> {testPreview.url}</p>
                <p><strong>Payload:</strong></p>
                <pre className="overflow-x-auto rounded bg-white p-2">{testPreview.payload}</pre>
                <p><strong>Payload exato da chamada do backend:</strong></p>
                <pre className="overflow-x-auto rounded bg-white p-2">{testPreview.backendPayload}</pre>
                <button
                  onClick={() => {
                    setGeneratedPlate("MODO-TESTE");
                    setNewTolerance(estimateTolerancePlusOneDay(ticketData.tolerancia));
                    setStep("done");
                  }}
                  className="w-full rounded-xl bg-amber-600 py-2 font-medium text-white"
                >
                  Seguir para tela de sucesso
                </button>
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 space-y-2 rounded-xl bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-800">Ticket validado com sucesso. Basta utilizar ele na saída.</p>
            <p>Nova placa gerada: <strong>{generatedPlate}</strong></p>
            <p>Nova tolerância aplicada: <strong>{newTolerance}</strong></p>
          </div>
        )}

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
