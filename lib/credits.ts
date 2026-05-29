import type { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export type CreditBalance = {
  user_id: string
  balance: number
  created_at: string
  updated_at: string
}

export type CreditTransaction = {
  id: string
  user_id: string
  amount: number
  type: string
  description: string
  reference_id: string | null
  created_at: string
}

export type CreditPurchasePlan = {
  id: "starter" | "creator" | "studio"
  name: string
  price: number
  priceCents: number
  credits: number
}

type InsForgeClient = NonNullable<
  Awaited<ReturnType<typeof getAuthenticatedInsForgeClient>>["client"]
>

export const STARTING_CREDITS = 2480
export const AVATAR_GENERATION_CREDITS = 20
export const VOICE_CLONING_CREDITS = 10
export const TTS_CREDITS_PER_BLOCK = 10
export const TTS_WORD_BLOCK_SIZE = 500
export const AI_VIDEO_AGENT_IMAGE_CREDITS = 10
export const AI_VIDEO_AGENT_VIDEO_CREDITS = 30

export const creditPurchasePlans: CreditPurchasePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 9.99,
    priceCents: 999,
    credits: 1000,
  },
  {
    id: "creator",
    name: "Creator",
    price: 19.99,
    priceCents: 1999,
    credits: 2200,
  },
  {
    id: "studio",
    name: "Studio",
    price: 29.99,
    priceCents: 2999,
    credits: 5000,
  },
]

export function getCreditPurchasePlan(planId: string | null | undefined) {
  return creditPurchasePlans.find((plan) => plan.id === planId)
}

export function calculateTtsCreditsForWords(wordCount: number) {
  if (wordCount <= 0) return 0
  return Math.ceil(wordCount / TTS_WORD_BLOCK_SIZE) * TTS_CREDITS_PER_BLOCK
}

export function countBillableWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function calculateTtsCreditsForText(text: string) {
  return calculateTtsCreditsForWords(countBillableWords(text))
}

export function calculateAvatarVideoCredits(durationSeconds: number) {
  if (durationSeconds <= 0) return 0
  if (durationSeconds <= 5) return 40
  if (durationSeconds <= 10) return 100
  return Math.ceil(durationSeconds / 10) * 100
}

export async function ensureCreditBalance(
  client: InsForgeClient,
  userId: string
) {
  const { data, error } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (!error && data) return data as CreditBalance

  const { data: created, error: insertError } = await client.database
    .from("user_credits")
    .insert({
      user_id: userId,
      balance: STARTING_CREDITS,
    })
    .select("*")
    .single()

  if (insertError) {
    const { data: retryData, error: retryError } = await client.database
      .from("user_credits")
      .select("*")
      .eq("user_id", userId)
      .single()

    if (!retryError && retryData) return retryData as CreditBalance
    throw new Error(insertError.message ?? "Unable to create credit balance.")
  }

  if (!created) throw new Error("Unable to create credit balance.")
  return created as CreditBalance
}

export async function assertHasCredits(
  client: InsForgeClient,
  userId: string,
  credits: number,
  message: string
) {
  const balance = await ensureCreditBalance(client, userId)

  if (Number(balance.balance ?? 0) < credits) {
    const error = new Error(message)
    error.name = "InsufficientCreditsError"
    throw error
  }

  return balance
}

export async function debitCredits({
  client,
  userId,
  credits,
  description,
  referenceId,
}: {
  client: InsForgeClient
  userId: string
  credits: number
  description: string
  referenceId: string
}) {
  if (credits <= 0) return ensureCreditBalance(client, userId)

  const creditRow = await ensureCreditBalance(client, userId)
  const currentBalance = Number(creditRow.balance ?? 0)

  if (currentBalance < credits) {
    const error = new Error(`Not enough credits. This action costs ${credits} credits.`)
    error.name = "InsufficientCreditsError"
    throw error
  }

  const { data: debitedCredits, error: debitError } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance - credits })
    .eq("user_id", userId)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (debitError || !debitedCredits) {
    throw new Error(debitError?.message ?? "Unable to deduct credits. Try again.")
  }

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: -credits,
    type: "debit",
    description,
    reference_id: referenceId,
  })

  return debitedCredits as CreditBalance
}

export async function addCredits({
  client,
  userId,
  credits,
  description,
  referenceId,
  type = "purchase",
}: {
  client: InsForgeClient
  userId: string
  credits: number
  description: string
  referenceId: string
  type?: "purchase" | "refund" | "credit"
}) {
  if (credits <= 0) return ensureCreditBalance(client, userId)

  const creditRow = await ensureCreditBalance(client, userId)
  const currentBalance = Number(creditRow.balance ?? 0)
  const { data, error } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance + credits })
    .eq("user_id", userId)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to add credits.")
  }

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: credits,
    type,
    description,
    reference_id: referenceId,
  })

  return data as CreditBalance
}
