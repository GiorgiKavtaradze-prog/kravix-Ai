import { NextResponse } from "next/server"
import Stripe from "stripe"

import { addCredits, getCreditPurchasePlan } from "@/lib/credits"
import { createInsForgeServerClient } from "@/lib/insforge/server"

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.")
  }

  return new Stripe(secretKey)
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET." }, { status: 500 })
  }

  const stripe = getStripe()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)
  } catch (webhookError) {
    return NextResponse.json(
      {
        error:
          webhookError instanceof Error
            ? webhookError.message
            : "Invalid Stripe webhook.",
      },
      { status: 400 }
    )
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object
  const userId = session.metadata?.userId
  const plan = getCreditPurchasePlan(session.metadata?.planId)

  if (!userId || !plan || session.payment_status !== "paid") {
    return NextResponse.json({ received: true })
  }

  const client = createInsForgeServerClient()
  const { data: existingTransaction, error: existingError } = await client.database
    .from("credit_transactions")
    .select("id")
    .eq("reference_id", session.id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (!existingTransaction) {
    await addCredits({
      client,
      userId,
      credits: plan.credits,
      type: "purchase",
      description: `Stripe purchase: ${plan.name} package`,
      referenceId: session.id,
    })
  }

  return NextResponse.json({ received: true })
}
