import { NextResponse } from "next/server";
import { DEFAULT_MODEL, isAIConfigured } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({
    configured: isAIConfigured(),
    model: DEFAULT_MODEL,
    provider: process.env.AI_PROVIDER_NAME || "custom",
    api: "json"
  });
}
