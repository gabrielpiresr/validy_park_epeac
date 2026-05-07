import { NextResponse } from "next/server";
import { fetchTicket } from "@/src/lib/technext";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ticketCode?: string };
    const ticketCode = body.ticketCode?.trim();

    if (!ticketCode) {
      return NextResponse.json({ message: "Informe o código do ticket." }, { status: 400 });
    }

    const ticket = await fetchTicket(ticketCode);

    if (!ticket?.n_ticket) {
      return NextResponse.json({ message: "Ticket não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ticket: {
        n_ticket: ticket.n_ticket,
        tp_ticket: ticket.tp_ticket,
        placa: ticket.placa,
        dt_entrada: ticket.dt_entrada,
        tolerancia: ticket.tolerancia,
        usuario: ticket.usuario,
        status: ticket.status
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error && error.message.includes("buscar ticket")
            ? "Não encontramos esse ticket. Verifique o código e tente novamente."
            : "Erro ao consultar ticket. Tente novamente em instantes."
      },
      { status: 500 }
    );
  }
}
