import { NextResponse } from "next/server";
import { technextRequest, type TicketLookupResponse } from "@/app/lib";

export async function GET(_: Request, { params }: { params: { code: string } }) {
  try {
    const ticket = await technextRequest<TicketLookupResponse>(`/tickets/${params.code}`);
    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro ao buscar ticket" },
      { status: 500 }
    );
  }
}
