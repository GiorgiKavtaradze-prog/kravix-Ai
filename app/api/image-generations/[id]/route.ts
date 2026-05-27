import { NextResponse } from "next/server"
import { z } from "zod"

import { createInsForgeServerClient } from "@/lib/insforge/server"

export const dynamic = "force-dynamic"

const statusQuerySchema = z.object({
  userId: z.string().min(1),
})

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/image-generations/[id]">
) {
  const { id } = await context.params
  const url = new URL(request.url)
  const query = statusQuerySchema.safeParse({
    userId: url.searchParams.get("userId"),
  })

  if (!query.success) {
    return jsonError("Missing user id.")
  }

  const insforge = createInsForgeServerClient()
  const { data, error } = await insforge.database
    .from("image_generations")
    .select("*")
    .eq("id", id)
    .eq("user_id", query.data.userId)
    .single()

  if (error || !data) {
    return jsonError("Generation was not found.", 404)
  }

  return NextResponse.json({ generation: data })
}
