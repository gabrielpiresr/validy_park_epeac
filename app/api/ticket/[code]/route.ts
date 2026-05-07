import { NextResponse } from "next/server";
import { fetchTicket } from "@/src/lib/technext";

export async function GET(_: Request, { params }: { params: { code: string } }) {
  try {
    const ticket = await fetchTicket(params.code);
    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro ao buscar ticket" },
      { status: 500 }
    );
  }
}
