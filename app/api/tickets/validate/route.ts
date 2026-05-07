import { NextResponse } from "next/server";
import { createFakePlateFromName, validateTicket, type TechnextTicket } from "@/src/lib/technext";

export async function POST(request: Request) {
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
      usuario: "epeac.leandro.carvalho",
      status: "V"
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
