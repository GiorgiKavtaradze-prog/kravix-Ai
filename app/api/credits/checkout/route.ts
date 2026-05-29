import { NextResponse } from "next/server"
import Stripe from "stripe"

import { getCreditPurchasePlan } from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.")
  }

  return new Stripe(secretKey)
}

function getOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    request.headers.get("origin") ??
    new URL(request.url).origin
  )
}

export async function POST(request: Request) {
  const { user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { planId } = (await request.json()) as { planId?: string }
  const plan = getCreditPurchasePlan(planId)

  if (!plan) {
    return NextResponse.json({ error: "Choose a valid credit package." }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const origin = getOrigin(request)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/dashboard/profile?checkout=success#credits`,
      cancel_url: `${origin}/dashboard/profile?checkout=cancelled#credits`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        planId: plan.id,
        credits: String(plan.credits),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: plan.priceCents,
            product_data: {
              name: `${plan.credits.toLocaleString()} Kravix credits`,
              description: `${plan.name} credit package`,
            },
          },
        },
      ],
    })

    return NextResponse.json({ url: session.url })
  } catch (checkoutError) {
    return NextResponse.json(
      {
        error:
          checkoutError instanceof Error
            ? checkoutError.message
            : "Unable to start Stripe checkout.",
      },
      { status: 500 }
    )
  }
}
