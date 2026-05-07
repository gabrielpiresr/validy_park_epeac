import { NextResponse } from "next/server";
import { createFakePlateFromName, fetchTicket, validateTicket } from "@/src/lib/technext";

export async function PUT(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = (await request.json()) as { fullName?: string };

    if (!body.fullName || body.fullName.trim().split(" ").length < 2) {
      return NextResponse.json({ message: "Informe o nome completo." }, { status: 400 });
    }

    const ticket = await fetchTicket(params.code);
    const fakePlate = createFakePlateFromName(body.fullName);
    const result = await validateTicket(ticket, fakePlate);

    return NextResponse.json({ ...result, fakePlate });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro ao aprovar ticket" },
      { status: 500 }
    );
  }
}
