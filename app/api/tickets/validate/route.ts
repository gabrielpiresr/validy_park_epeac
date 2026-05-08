import { NextResponse } from "next/server";
import { createFakePlateFromName, validateTicket, type TechnextTicket } from "@/src/lib/technext";
import { appendValidationLog } from "@/src/lib/googleSheets";


function getSaoPauloDateTime() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return formatter.format(new Date()).replace("T", " ");
}

export async function PUT(request: Request) {
  try {
    console.info("[api/tickets/validate] Início da validação de ticket.");
    const body = (await request.json()) as { ticket?: Partial<TechnextTicket>; fullName?: string };

    if (!body.ticket?.n_ticket) {
      console.warn("[api/tickets/validate] Ticket ausente no payload.");
      return NextResponse.json({ message: "Ticket inválido para validação." }, { status: 400 });
    }

    if (!body.fullName || body.fullName.trim().split(" ").length < 2) {
      console.warn("[api/tickets/validate] Nome completo inválido.", { fullName: body.fullName });
      return NextResponse.json({ message: "Informe o nome completo." }, { status: 400 });
    }

    const placaGerada = createFakePlateFromName(body.fullName);

    if (!body.ticket.dt_entrada || !body.ticket.tolerancia) {
      console.warn("[api/tickets/validate] Ticket sem dados completos para validação.", {
        n_ticket: body.ticket.n_ticket
      });
      return NextResponse.json({ message: "Dados do ticket incompletos para validação." }, { status: 400 });
    }

    const ticket: TechnextTicket = {
      n_ticket: body.ticket.n_ticket,
      tp_ticket: "A",
      placa: body.ticket.placa ?? "",
      dt_entrada: body.ticket.dt_entrada,
      tolerancia: body.ticket.tolerancia,
      usuario: body.ticket.usuario ?? "",
      status: body.ticket.status ?? ""
    };

    console.info("[api/tickets/validate] Chamando validateTicket.", {
      n_ticket: ticket.n_ticket,
      placaGerada
    });
    const result = await validateTicket(ticket, placaGerada);

    console.info("[api/tickets/validate] Validação concluída.", {
      n_ticket: ticket.n_ticket,
      nova_tolerancia: result.novaTolerancia
    });

    try {
      const dataValidacao = getSaoPauloDateTime();
      await appendValidationLog({
        dataEntrada: ticket.dt_entrada,
        dataValidacao,
        numeroTicket: ticket.n_ticket,
        nomeCompleto: body.fullName.trim()
      });
      console.info("[api/tickets/validate] Registro enviado para Google Sheets.", {
        n_ticket: ticket.n_ticket,
        data_validacao: dataValidacao
      });
    } catch (sheetsError) {
      console.error("[api/tickets/validate] Falha ao registrar no Google Sheets.", {
        n_ticket: ticket.n_ticket,
        error: sheetsError instanceof Error ? sheetsError.message : "Erro desconhecido"
      });
    }

    return NextResponse.json({
      success: true,
      message: "Ticket validado com sucesso.",
      placaGerada,
      nova_tolerancia: result.novaTolerancia
    });
  } catch (error) {
    console.error("[api/tickets/validate] Erro ao validar ticket.", {
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? "Não foi possível validar o ticket agora. Tente novamente em instantes."
            : "Erro inesperado na validação do ticket."
      },
      { status: 500 }
    );
  }
}
