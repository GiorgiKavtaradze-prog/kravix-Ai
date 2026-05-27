import type { generateAvatarVideoTask } from "@/src/trigger/generate-avatar-video"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  calculateAvatarVideoCredits,
  isAvatarVideoDuration,
  type AvatarVideoRecord,
} from "@/lib/avatar-videos"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { id } = await context.params
  const { data: video, error: videoError } = await client.database
    .from("avatar_videos")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (videoError || !video) {
    return NextResponse.json({ error: "Avatar video not found." }, { status: 404 })
  }

  const record = video as AvatarVideoRecord

  if (record.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed avatar videos can be retried." },
      { status: 400 }
    )
  }

  if (!isAvatarVideoDuration(record.duration_seconds)) {
    return NextResponse.json(
      { error: "Saved avatar video duration is invalid." },
      { status: 400 }
    )
  }

  const credits = calculateAvatarVideoCredits(record.duration_seconds)
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (creditError || !creditRow) {
    return NextResponse.json(
      { error: "Credit balance is not ready. Refresh and try again." },
      { status: 400 }
    )
  }

  const currentBalance = Number(creditRow.balance ?? 0)

  if (currentBalance < credits) {
    return NextResponse.json(
      { error: "Not enough credits to retry this avatar video." },
      { status: 402 }
    )
  }

  const { data: debitedCredits, error: debitError } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance - credits })
    .eq("user_id", user.id)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (debitError || !debitedCredits) {
    return NextResponse.json(
      { error: debitError?.message ?? "Unable to deduct credits. Try again." },
      { status: 409 }
    )
  }

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    amount: -credits,
    type: "debit",
    description: `Retry avatar video generation: ${record.title}`,
    reference_id: record.id,
  })

  await client.database
    .from("avatar_videos")
    .update({
      status: "queued",
      credits_charged: credits,
      error_message: null,
      domo_task_id: null,
      domo_credits: null,
      video_url: null,
      video_mime_type: null,
    })
    .eq("id", record.id)
    .eq("user_id", user.id)

  const handle = await tasks.trigger<typeof generateAvatarVideoTask>(
    "generate-avatar-video",
    {
      videoId: record.id,
      userId: user.id,
      creditsCharged: credits,
    },
    {
      tags: [`user:${user.id}`, `avatar-video:${record.id}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  await client.database
    .from("avatar_videos")
    .update({ trigger_run_id: handle.id })
    .eq("id", record.id)
    .eq("user_id", user.id)

  return NextResponse.json({
    videoId: record.id,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    balance: Number(debitedCredits.balance ?? currentBalance - credits),
  })
}
