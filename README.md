# Jarvis

Jarvis is a Vercel-ready AI chatbot built with Next.js and the Vercel AI SDK, protected by a password gate so only authorized users can access it. Conversations are persisted across sessions using Supabase.

## Features

- Next.js App Router
- Streaming AI responses
- Simple modern dark chat interface
- Password-protected access (auth gate + session cookie)
- **Persistent chat history across sessions** (Supabase)
- Ready for Vercel deployment
- Easy to customize

## Stack

- [Next.js](https://nextjs.org/) App Router
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- OpenAI (`gpt-4o-mini`)
- [Supabase](https://supabase.com/) (Postgres — for chat persistence)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Add environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in all values in `.env.local`:

```bash
# Your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here

# The password users must enter to access the app
APP_PASSWORD=your_app_password_here

# A long random secret used to sign the session cookie — keep this private
# Generate one with: openssl rand -hex 32
SESSION_SECRET=a_long_random_secret_string_here

# Supabase project URL and anon key — required for persistent chat history
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

> **Important:** `APP_PASSWORD` and `SESSION_SECRET` are required. `AUTH_SECRET` is still supported as a legacy alias for `SESSION_SECRET`.  
> `SUPABASE_URL` and `SUPABASE_ANON_KEY` are optional — the app runs without them but chat history will not be persisted.

### 3. Set up Supabase (for persistent history)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in the Supabase dashboard and run the following schema:

```sql
-- Stores one conversation per browser session
create table conversations (
  id   uuid primary key default gen_random_uuid(),
  session_id text not null,
  created_at timestamptz default now()
);

-- Stores every user/assistant message
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz default now()
);

-- Indexes for fast history lookups
create index on conversations(session_id, created_at);
create index on messages(conversation_id, created_at);
```

3. In your Supabase project go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **`anon` / `public` key** → `SUPABASE_ANON_KEY`

> **Row-Level Security (RLS):** The app uses server-side API routes to talk to Supabase; the keys are never exposed to the browser. RLS can be left off for a private, password-protected app.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page — enter the password you set in `APP_PASSWORD`.

## How Persistent History Works

- On first visit a random `sessionId` UUID is created and saved in `localStorage`.
- When the chat page loads, Jarvis fetches prior messages for that session from Supabase (`/api/history`) and restores them to the chat.
- After every exchange, the new user message and Jarvis's response are saved to Supabase so they appear on the next visit.
- Clearing browser `localStorage` (or using a different browser) starts a fresh conversation.

## Password Protection

Jarvis uses a lightweight password gate implemented with:

- **Next.js Middleware** — redirects unauthenticated requests to `/login`.
- **Signed session cookie** — an HMAC-SHA-256 token derived from `SESSION_SECRET` (or `AUTH_SECRET` legacy alias) is stored as an `httpOnly` cookie (valid for 7 days).
- **Environment variables** — no secrets are hardcoded. Change `APP_PASSWORD` or `SESSION_SECRET` at any time to invalidate existing sessions.
- **Logout** — the "Sign out" button in the chat header clears the session cookie and returns you to the login page.

### Changing the password

Update `APP_PASSWORD` in your environment and redeploy (or restart the dev server). Existing sessions will be invalidated automatically if you also rotate `SESSION_SECRET`.

### Revoking all sessions

Change `SESSION_SECRET` to a new random value and redeploy.

## Project Structure

```
jarvis/
├─ app/
│  ├─ api/
│  │  ├─ auth/
│  │  │  ├─ login/
│  │  │  │  └─ route.ts     # Validates password, sets session cookie
│  │  │  └─ logout/
│  │  │     └─ route.ts     # Clears session cookie
│  │  ├─ chat/
│  │  │  └─ route.ts        # Streaming chat API route (saves messages)
│  │  └─ history/
│  │     └─ route.ts        # Returns conversation history for a session
│  ├─ login/
│  │  └─ page.tsx           # Login page
│  ├─ globals.css            # Global styles (dark theme)
│  ├─ layout.tsx             # Root layout with metadata
│  └─ page.tsx               # Home page (protected)
├─ components/
│  └─ chat.tsx               # Chat UI component (loads history, logout button)
├─ lib/
│  ├─ auth.ts                # Auth helpers (token, password, session secret)
│  └─ supabase.ts            # Server-side Supabase client
├─ middleware.ts              # Route protection middleware
├─ .env.example              # Environment variable template
├─ next-env.d.ts
├─ next.config.ts
├─ package.json
└─ tsconfig.json
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
3. Import this repository.
4. Add the following environment variables in the Vercel project settings:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `APP_PASSWORD` — required password for login
   - `SESSION_SECRET` — required session signing secret (generate with `openssl rand -hex 32`)
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_ANON_KEY` — your Supabase anon/public key
   - (`AUTH_SECRET` is an optional legacy alias for `SESSION_SECRET`)
5. Save the variables for the **Production** environment.
6. Redeploy the app (or trigger a new production deployment) so the new env vars are applied.

## File & Image Upload

Jarvis supports attaching files and images to your messages.

### How to use
Click the **📎** button in the chat input to select one or more files. A preview appears before you send. The file is sent alongside your message to the AI.

### Supported types (end-to-end)
| Type | Extensions | AI processing |
|------|-----------|--------------|
| Images | JPEG / JPG, PNG, GIF, WEBP | ✅ Full – model sees the image |
| Plain text | .txt, .csv, .md | ✅ Full – text is read by the model |
| Other binary (PDF, DOCX, …) | — | ⚠️ Not supported by `gpt-4o-mini` |

### Limits
- **Maximum file size:** 10 MB per file
- **Accepted MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `text/plain`, `text/csv`, `text/markdown`
- Files that exceed the size limit or have an unsupported type are rejected with a user-friendly error before being sent.

### Notes
- `gpt-4o-mini` supports image inputs natively. Images are base64-encoded in the browser and sent as multimodal content via the Vercel AI SDK's `experimental_attachments` API.
- Unsupported file types (e.g. PDFs) are blocked on the client so they never reach the server, avoiding model errors.
- Attachments are not persisted to Supabase (only the text content of messages is stored).

## Customization Ideas

- Add multiple conversations / conversation switcher
- Add multiple AI model support
- Add markdown rendering for assistant responses
- Add voice input/output

## Notes

The API route uses `gpt-4o-mini` by default. You can change the model in `app/api/chat/route.ts`.

