import { NextResponse } from "next/server"

import {
  creditPurchasePlans,
  ensureCreditBalance,
  type CreditTransaction,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function GET(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const [credits, transactionsResult] = await Promise.all([
      ensureCreditBalance(client, user.id),
      client.database
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ])

    if (transactionsResult.error) {
      throw new Error(transactionsResult.error.message)
    }

    return NextResponse.json({
      credits,
      transactions: (transactionsResult.data ?? []) as CreditTransaction[],
      plans: creditPurchasePlans,
    })
  } catch (creditsError) {
    return NextResponse.json(
      {
        error:
          creditsError instanceof Error
            ? creditsError.message
            : "Unable to load credits.",
      },
      { status: 500 }
    )
  }
}
