import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.PIX_COPY_PASTE) {
    return NextResponse.json({ message: "Variável PIX_COPY_PASTE não configurada." }, { status: 500 });
  }

  return NextResponse.json({ pixCopyPaste: process.env.PIX_COPY_PASTE });
}
