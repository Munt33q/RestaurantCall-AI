# Deployment Status

- **Vercel:** Not deployed. A local deployment token exists outside the project, but deployment was not attempted because npm cannot reach the registry and the frontend build has not completed successfully.
- **Render:** Not deployed. A local Render token exists outside the project, but deployment was not attempted because the database credentials, installable runtime dependencies, and live provider checks are incomplete.
- **Twilio webhooks:** Not configured. The service needs the deployed HTTPS `/twilio/voice` and `/twilio/gather` URLs.
- **Stripe webhook:** Not configured. Set the deployed `/stripe/webhook` URL in Stripe test mode and store the resulting signing secret in `STRIPE_WEBHOOK_SECRET`.
- **Database:** Not ready. Supply the Neon pooled `DATABASE_URL` and direct `DIRECT_DATABASE_URL`, run the migration against a disposable Neon branch, then verify persistence before production deployment.
- **Paid or destructive actions:** None performed.
