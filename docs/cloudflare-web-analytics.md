## Cloudflare Web Analytics Setup

1. **Create a site beacon**
   - In the Cloudflare dashboard, open **Web Analytics → Manage Beacons**.
   - Generate (or copy) the beacon for `study.matthewaberham.com`. The public token resembles `0123456789abcdef0123456789abcdef`.

2. **Expose the token to Next.js**
   - Add `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN=<your_token>` to `.env.local` for local testing and to the Ubuntu VM environment.
   - Restart the Next.js process so the runtime picks up the updated environment value.

3. **Verify locally**
   - Run `pnpm dev` and open the app.
   - Inspect the Network tab for `https://static.cloudflareinsights.com/beacon.min.js` and confirm a subsequent POST to `https://.../beacon/`.

4. **Verify through the tunnel**
   - Bring the Cloudflare Tunnel online, load the production URL, and ensure the beacon requests still succeed (no 4xx/5xx responses).

5. **Dashboard confirmation**
   - Return to the Cloudflare Web Analytics dashboard and confirm pageviews appear in the real-time or daily metrics.

The integration automatically skips loading the beacon if the token is absent, so analytics can be toggled per-environment by omitting the env variable.
