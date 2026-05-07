import { NextResponse } from "next/server";
import { fetchTicket } from "@/src/lib/technext";

export async function GET(_: Request, { params }: { params: { code: string } }) {
  try {
    const ticket = await fetchTicket(params.code);
    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json(
      { message: "Não foi possível consultar o ticket no momento. Tente novamente." },
      { status: 500 }
    );
  }
}
