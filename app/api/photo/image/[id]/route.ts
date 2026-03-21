import { NextRequest, NextResponse } from "next/server";
import { getImage } from "../../../../../lib/photoStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const entry = getImage(id);
  if (!entry) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const mime = entry.mime || "application/octet-stream";
  const body = new Uint8Array(entry.buffer);
  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=60",
    },
  });
}
