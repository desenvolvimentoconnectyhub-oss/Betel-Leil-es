# Betel AI Credentials Checklist

Use this file as an inventory only. Do not paste secret values here.

## Cloudflare R2

- Account ID: collected
- S3 endpoint: collected
- S3 access key: collected in `.env.local`
- S3 secret key: collected in `.env.local`
- Public bucket: pending confirmation
- Private bucket: pending confirmation
- Public URL/custom domain: pending

Recommended buckets:

- `betel-ai-public`
- `betel-ai-private`

## Supabase

- Project URL: collected
- Publishable/anon key: collected in `.env.local`
- Secret/service role key: collected in `.env.local`
- Project ref: collected
- Direct database connection string template: collected in `.env.local`
- Database password: collected in `.env.local`
- Pooler connection string: pending, recommended for serverless/deploy
- Initial `app_config` migration: created, pending apply

## GitHub

- Repository owner: `desenvolvimentoconnectyhub-oss`
- Repository name: `Betel-Leil-es`
- Local remote: `git@github-betel-ai:desenvolvimentoconnectyhub-oss/Betel-Leil-es.git`
- Auth method: SSH key registered and tested with `github-betel-ai`

Recommended repository:

- Private repository for the MVP.
- Commit `.env.example`, never `.env.local`.
- Vercel should import the GitHub repository and receive secrets through Project Settings > Environment Variables.

## Vercel

- Project: pending
- GitHub import: pending
- Production domain: pending
- Environment variables: pending
- Supabase pooler URL: pending, recommended for deploy
- Cron path: `/api/admin/agentes-ia/communication/scheduler/cron`
- Cron schedule: `0 11 * * *` UTC in `vercel.json`
- `CRON_SECRET`: pending, required to authorize Vercel Cron invocations
- `BETEL_COMMUNICATION_SCHEDULER_TOKEN`: optional dedicated scheduler token

## Inngest

- App ID: `betel-ai`
- Event key: collected in `.env.local`
- Signing key: collected in `.env.local`

## WhatsApp / ConnectyHub

- Base URL: `https://www.connectyhub.com.br/api/v1`
- API token: pending in `.env.local`
- Webhook secret: pending in `.env.local`
- Fixed webhook URL: `https://guilhermepilger.ai/api/webhooks/connectyhub`
- Instance ID/name: created by ConnectyHub flow or filled after instance is linked

## Compliance Notes

- Do not store production secrets in tracked files.
- Rotate Cloudflare keys before production because the initial values were shared in chat.
- Keep auction legal documents and contracts in private storage.

## AI Provider

- Active provider: Gemini
- Default model: `gemini-2.5-flash`
- Gemini API key: pending
