<div align="center">

# ✦ Kravix AI Studio

### Next-Generation AI Media Production Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-Private-red?style=for-the-badge)](#)

<br />

> **Build AI-powered videos, clone voices, generate avatars — all from one unified workspace.**

<br />

[Get Started](#-quick-start) · [Features](#-features) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack) · [Environment](#-environment-variables) · [Contributing](#-contributing)

</div>

---

## ⚡ Quick Start

```bash
# 1 — Clone the repository
git clone https://github.com/GiorgiKavtaradze-prog/kravix-Ai.git
cd kravix-Ai

# 2 — Install dependencies
npm install

# 3 — Configure environment
cp .env.example .env.local
#     → Fill in the required keys (see Environment Variables below)

# 4 — Start the dev server
npm run dev
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** — you're in.

> [!TIP]
> Use `npm run dev:turbo` to launch with **Turbopack** for faster HMR during development.

---

## 🧠 Features

| Module | Description | Status |
|:---|:---|:---:|
| **AI Video Agent** | End-to-end video creation pipeline — scripting → scene breakdown → B-roll generation → Remotion rendering | ✅ Live |
| **AI Video Avatar** | Generate presenter-style talking-head videos from script or AI-generated topics | ✅ Live |
| **AI Avatars** | Create and manage custom branded avatars using Replicate's generative models | ✅ Live |
| **AI Voice Cloning** | Clone any voice from a short audio sample, generate TTS with cloned or preset voices | ✅ Live |
| **My Library** | Unified media library — browse all generated videos, avatars, voices, and assets | ✅ Live |
| **Credits System** | Token-based usage system with Stripe-powered top-ups and real-time balance tracking | ✅ Live |
| **Auth & Profiles** | Email/password + OAuth sign-in with user profile management | ✅ Live |

---

## 🏗 Architecture

```
kravix-ai-studio-2.0/
├── app/                          # Next.js App Router
│   ├── api/                      # API route handlers
│   │   ├── ai-video-agent/       #   → Video agent pipeline endpoints
│   │   ├── avatar-videos/        #   → Avatar video generation
│   │   ├── avatars/              #   → Avatar CRUD
│   │   ├── credits/              #   → Credit balance & transactions
│   │   ├── stripe/               #   → Payment webhooks
│   │   ├── users/                #   → User profile management
│   │   └── voices/               #   → Voice cloning & TTS
│   ├── auth/callback/            # OAuth callback handler
│   ├── dashboard/                # Protected dashboard routes
│   │   ├── ai-video-agent/       #   → Full video agent workspace
│   │   ├── ai-video-avatar/      #   → Avatar video creator
│   │   ├── ai-voice-cloning/     #   → Voice lab
│   │   ├── avatar/               #   → Avatar generator
│   │   └── profile/              #   → User settings
│   ├── sign-in/                  # Authentication pages
│   └── sign-up/
├── components/
│   ├── auth/                     # Auth forms & OAuth buttons
│   ├── dashboard/                # Dashboard feature clients
│   │   ├── ai-video-agent-client.tsx
│   │   ├── ai-video-avatars-client.tsx
│   │   ├── ai-voice-cloning-client.tsx
│   │   ├── ai-avatars-client.tsx
│   │   ├── dashboard-sidebar.tsx
│   │   └── profile-settings-client.tsx
│   └── ui/                       # 55+ shadcn/ui components
├── hooks/                        # Custom React hooks
├── lib/
│   ├── auth/                     # Auth middleware & validation
│   ├── insforge/                 # InsForge SDK client/server setup
│   ├── ai-video-agent.ts         # Video agent business logic
│   ├── ai-video-agent-composition.ts
│   ├── avatar-videos.ts
│   ├── avatars.ts
│   ├── credits.ts                # Credit system logic
│   ├── users.ts
│   └── voices.ts                 # Voice cloning utilities
├── src/trigger/                  # Trigger.dev background tasks
│   ├── generate-ai-video-agent.ts
│   ├── edit-ai-video-agent.ts
│   ├── render-ai-video-agent.ts
│   ├── generate-avatar-video.ts
│   ├── generate-avatar.ts
│   └── voice-cloning.ts
└── public/                       # Static assets & demo media
```

---

## 🛠 Tech Stack

### Core Framework

| Layer | Technology | Version |
|:---|:---|:---|
| Framework | **Next.js** (App Router, RSC) | `16.2` |
| Runtime | **React** | `19.2` |
| Language | **TypeScript** | `5.x` |
| Styling | **Tailwind CSS** | `4.x` |
| UI Library | **shadcn/ui** (base-vega theme) | `4.8` |

### AI & Media

| Service | Purpose |
|:---|:---|
| **Google GenAI** (`@google/genai`) | Script generation, scene planning, visual prompts |
| **Replicate** | Avatar generation via diffusion models |
| **Remotion** | Programmatic video composition & rendering |
| **InsForge SDK** (`@insforge/sdk`) | Auth, database, storage, edge functions |
| **Trigger.dev** | Durable background jobs for long-running AI pipelines |

### Payments & Infrastructure

| Service | Purpose |
|:---|:---|
| **Stripe** | Credit purchases & webhook-based fulfillment |
| **InsForge (Supabase-compatible)** | PostgreSQL, Row Level Security, Auth |
| **Vercel** | Hosting & edge deployment |

---

## 🔐 Environment Variables

Create a `.env.local` file in the project root with the following keys:

```env
# ── InsForge (Auth & Database) ──────────────────────────
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
INSFORGE_URL=
INSFORGE_ANON_KEY=
INSFORGE_SERVICE_ROLE_KEY=

# ── AI Services ─────────────────────────────────────────
GOOGLE_GENAI_API_KEY=
REPLICATE_API_TOKEN=

# ── Payments ────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ── Background Jobs ────────────────────────────────────
TRIGGER_SECRET_KEY=
```

> [!IMPORTANT]
> Server-side variables (`INSFORGE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, etc.) must **never** be prefixed with `NEXT_PUBLIC_`.

---

## 📜 Available Scripts

| Command | Description |
|:---|:---|
| `npm run dev` | Start dev server (webpack) on `127.0.0.1:3000` |
| `npm run dev:turbo` | Start dev server with **Turbopack** |
| `npm run build` | Create optimized production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint checks |

---

## 🗄 Database

The project uses **InsForge** (Supabase-compatible) with PostgreSQL and Row Level Security.

Schema migrations are located in the project root:

| File | Tables |
|:---|:---|
| `insforge-ai-video-agent-schema.sql` | `ai_video_projects`, `ai_video_scenes`, `ai_video_assets` |
| `insforge-voice-schema.sql` | `voice_clones`, `voice_tts_generations`, `avatar_videos`, `user_credits`, `credit_transactions` |

All tables enforce **RLS policies** — users can only access their own data via `auth.uid() = user_id`.

---

## 🧩 Background Jobs

Long-running AI pipelines are offloaded to **[Trigger.dev](https://trigger.dev)** v4:

| Task | Function |
|:---|:---|
| `generate-ai-video-agent` | Full video agent pipeline (script → scenes → assets → compose) |
| `edit-ai-video-agent` | Re-process individual scenes or regenerate assets |
| `render-ai-video-agent` | Remotion render to final MP4 |
| `generate-avatar-video` | Avatar talking-head video generation |
| `generate-avatar` | Static avatar image generation via Replicate |
| `voice-cloning` | Voice clone creation & TTS generation |

Configuration: `trigger.config.ts` — max duration **3600s**, retries with exponential backoff.

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/amazing-feature`
3. **Commit** your changes: `git commit -m "feat: add amazing feature"`
4. **Push** to the branch: `git push origin feat/amazing-feature`
5. **Open** a Pull Request

> [!NOTE]
> Please follow [Conventional Commits](https://www.conventionalcommits.org) for commit messages.

---

<div align="center">

**Built with ❤️ by the Kravix team**

<sub>© 2026 Kravix AI Studio — All rights reserved.</sub>

</div>
