# BlogStack email DNS status

The selected sender is mail.boldlaunchstudio.com, configured and verified in Resend on November 19, 2026.

The operator explicitly authorized Vercel use for these email DNS additions. All four records, including the DKIM TXT at resend._domainkey.mail.boldlaunchstudio.com, are installed and verified. Existing root Zoho MX, SPF and DKIM records are preserved. BlogStack hosting stays on Cloudflare.

Installed records in the authoritative boldlaunchstudio.com zone (relative names):

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| MX | send.mail | feedback-smtp.us-east-1.amazonses.com | 10 |
| TXT | send.mail | v=spf1 include:amazonses.com ~all | — |
| CNAME | rsend.mail | send.forge.rmta.net | — |

A send-only API key restricted to this sender domain is stored privately and installed in the Cloudflare app. Actual Cloudflare signup, verification resend, reset, invitation and hourly-scheduled trial-ending messages were confirmed delivered to the operator's approved test mailbox. Verification/invitation acceptance and reset-session revocation also passed. Evidence: artifacts/verification/auth-email.json. Repeat sender verification when moving to the product domain.

No DNS migration or new domain purchase has been performed.
