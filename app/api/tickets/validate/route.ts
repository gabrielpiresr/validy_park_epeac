import { NextResponse } from "next/server";
import { createFakePlateFromName, validateTicket } from "@/src/lib/technext";

type TicketPayload = {
  n_ticket: string;
  tp_ticket: string;
  placa?: string;
  dt_entrada: string;
  tolerancia: string;
  usuario: string;
  status: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ticket?: TicketPayload; fullName?: string };

    if (!body.ticket?.n_ticket) {
      return NextResponse.json({ message: "Ticket inválido para validação." }, { status: 400 });
    }

    if (!body.fullName || body.fullName.trim().split(" ").length < 2) {
      return NextResponse.json({ message: "Informe o nome completo." }, { status: 400 });
    }

    const placaGerada = createFakePlateFromName(body.fullName);
    const result = await validateTicket(body.ticket, placaGerada);

    return NextResponse.json({
      success: true,
      message: "Ticket validado com sucesso.",
      placaGerada,
      nova_tolerancia: result.novaTolerancia
    });
  } catch (error) {
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
