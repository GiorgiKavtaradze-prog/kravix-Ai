This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## AI Image Generation Setup

The `/ai-images` workspace uses InsForge for auth, database, AI, and storage,
plus Trigger.dev for background generation. Configure these environment
variables before running jobs:

```bash
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
INSFORGE_URL=
INSFORGE_ANON_KEY=
INSFORGE_SERVICE_ROLE_KEY=
INSFORGE_EDGE_FUNCTION_TOKEN=
TRIGGER_PROJECT_REF=
TRIGGER_SECRET_KEY=
REPLICATE_API_TOKEN=
REPLICATE_OPENAI_API_KEY=
```

`INSFORGE_URL` and `INSFORGE_ANON_KEY` fall back to their `NEXT_PUBLIC_*`
equivalents in local development. Use either `INSFORGE_SERVICE_ROLE_KEY` or
`INSFORGE_EDGE_FUNCTION_TOKEN` when the server needs privileged database and
storage access. `REPLICATE_OPENAI_API_KEY` is optional and is only passed to
Replicate's OpenAI image models when you want to bring your own verified OpenAI
key.

For local testing, run the Next.js app and the Trigger.dev worker in separate
terminals:

```bash
npm run dev
npm run trigger:dev
```

If runs stay queued in the Trigger.dev dashboard, the task worker is not
running or the latest task version has not been deployed. Deploy tasks with:

```bash
npm run trigger:deploy
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
