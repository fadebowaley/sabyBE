# WhatsApp Webhook Configuration Guide for Meta Dashboard

This guide will help you configure the WhatsApp Business API webhook on the Meta (Facebook) Business Dashboard.

## Prerequisites

- Access to Meta Business Suite or Facebook Developers Console
- WhatsApp Business API account set up
- Your staging server is accessible from the internet (public URL)

## Webhook Information

### Staging Environment

- **Webhook URL**: `https://bot.saby.ai/webhook`
  - Clean URL without port number (uses nginx reverse proxy on dedicated domain)
- **Verify Token**: `halo-whatsapp-20250823-96959023`
- **Phone Number ID**: `761797300344847`

### Local Development

- **Webhook URL**: `http://your-ngrok-url.ngrok.io/webhook` (using ngrok)
- **Verify Token**: `halo-whatsapp-20250823-96959023`

## Step-by-Step Configuration

### Step 1: Access Meta Business Dashboard

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Log in with your Facebook account
3. Select your Business Account

### Step 2: Navigate to WhatsApp Configuration

1. In the left sidebar, click on **"WhatsApp Accounts"** or **"WhatsApp Manager"**
2. Select your WhatsApp Business Account
3. Click on **"API Setup"** or **"Configuration"** tab
4. Look for **"Webhooks"** section

### Alternative: Facebook Developers Console

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Select your App (or create one if needed)
3. Navigate to **"WhatsApp"** → **"Configuration"**
4. Find the **"Webhooks"** section

### Step 3: Add Webhook URL

1. Click **"Add Callback URL"** or **"Edit"** button
2. Enter your webhook URL:

   ```
   https://bot.saby.ai/webhook
   ```

   **Note**: If port 4001 is not publicly accessible, you'll need to:

   - Set up nginx reverse proxy to forward `/webhook` to `localhost:4001/webhook`
   - Or use a tunnel service like ngrok for testing

3. Click **"Verify and Save"**

### Step 4: Verify Webhook

When you click "Verify", Meta will send a GET request to your webhook with these parameters:

- `hub.mode=subscribe`
- `hub.verify_token=halo-whatsapp-20250823-96959023`
- `hub.challenge=<random_string>`

Your server should:

1. Check if `hub.verify_token` matches: `halo-whatsapp-20250823-96959023`
2. Return the `hub.challenge` value as plain text

**Expected Response**: The challenge string (e.g., `test123`)

### Step 5: Subscribe to Webhook Fields

After verification, subscribe to the following webhook fields:

#### Required Fields:

- ✅ **messages** - Incoming messages from users
- ✅ **message_status** - Delivery status updates (sent, delivered, read, failed)
- ✅ **message_template_status_update** - Template message status

#### Optional but Recommended:

- ✅ **messaging_handovers** - Handover protocol events
- ✅ **message_echoes** - Echo messages (messages sent via API)

### Step 6: Test Webhook

1. **Test Verification**:

   ```bash
   curl "https://bot.saby.ai/webhook?hub.mode=subscribe&hub.verify_token=halo-whatsapp-20250823-96959023&hub.challenge=test123"
   ```

   Expected response: `test123`

2. **Send Test Message**:

   - Use Meta's test tool in the dashboard
   - Or send a message from your WhatsApp Business number to a test number
   - Check server logs: `docker logs saby-staging-whatsapp --tail 50`

3. **Check Webhook Status**:
   - In Meta dashboard, check webhook status (should show "Active" or "Verified")
   - Look for recent webhook calls in the dashboard

## Troubleshooting

### Issue: Webhook Verification Fails

**Symptoms**: Meta shows "Verification Failed"

**Solutions**:

1. Check if webhook URL is publicly accessible:

   ```bash
   curl -I https://bot.saby.ai/webhook
   ```

2. Verify the verify token matches exactly:

   - Token: `halo-whatsapp-20250823-96959023`
   - Case-sensitive, no extra spaces

3. Check server logs:

   ```bash
   docker logs saby-staging-whatsapp --tail 50 | grep -i webhook
   ```

4. Ensure HTTPS is used (Meta requires HTTPS for production)

### Issue: Port 4001 Not Accessible

**Status**: ✅ **Already Configured!**

The webhook is now accessible via clean URL without port: `https://bot.saby.ai/webhook`

The nginx reverse proxy automatically forwards requests to the WhatsApp service on port 4001.

### Issue: Webhook Not Receiving Messages

**Check**:

1. Webhook is verified and active in Meta dashboard
2. All required fields are subscribed
3. Server is running: `docker ps | grep whatsapp`
4. Check logs for incoming requests:
   ```bash
   docker logs saby-staging-whatsapp -f
   ```

### Issue: SSL Certificate Errors

**Solution**: Ensure your domain has a valid SSL certificate. Meta requires HTTPS for webhooks.

## Webhook Endpoints

### GET /webhook (Verification)

- **Purpose**: Verify webhook with Meta
- **Query Parameters**:
  - `hub.mode`: `subscribe`
  - `hub.verify_token`: `halo-whatsapp-20250823-96959023`
  - `hub.challenge`: Random string from Meta
- **Response**: Challenge string (plain text)

### POST /webhook (Message Handling)

- **Purpose**: Receive webhook events from Meta
- **Content-Type**: `application/json`
- **Body**: WhatsApp webhook payload
- **Response**: `200 OK` (plain text)

## Security Considerations

1. **Verify Token**: Keep the verify token secret. It's used to verify webhook requests are from Meta.

2. **HTTPS**: Always use HTTPS for webhook URLs in production.

3. **IP Whitelisting**: Consider whitelisting Meta's IP ranges (optional but recommended):

   - Meta provides IP ranges for their webhook servers
   - Check: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#ip-addresses

4. **Rate Limiting**: Implement rate limiting to prevent abuse.

## Monitoring

### Check Webhook Health

```bash
# Health check (via webhook endpoint)
curl https://bot.saby.ai/health

# Or directly to WhatsApp service (if accessible)
curl http://localhost:4001/health

# Expected response:
# {"status":"OK","message":"WhatsApp Bot Server is running",...}
```

### View Logs

```bash
# Real-time logs
docker logs saby-staging-whatsapp -f

# Recent logs
docker logs saby-staging-whatsapp --tail 100
```

### Test Webhook

```bash
# Test verification (via clean URL)
curl "https://bot.saby.ai/webhook?hub.mode=subscribe&hub.verify_token=halo-whatsapp-20250823-96959023&hub.challenge=test123"

# Expected: test123

# Or test locally (if accessible)
curl "http://localhost:4001/webhook?hub.mode=subscribe&hub.verify_token=halo-whatsapp-20250823-96959023&hub.challenge=test123"
```

## Additional Resources

- [Meta WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [Webhook Setup Guide](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
- [WhatsApp Webhook Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)

## Quick Reference

| Item            | Value                                                           |
| --------------- | --------------------------------------------------------------- |
| Webhook URL     | `https://bot.saby.ai/webhook`                                   |
| Verify Token    | `halo-whatsapp-20250823-96959023`                               |
| Phone Number ID | `761797300344847`                                               |
| Health Endpoint | `https://bot.saby.ai/health` (or via WhatsApp service directly) |
| Container Name  | `saby-staging-whatsapp`                                         |
| Port            | `4001`                                                          |

## Support

If you encounter issues:

1. Check server logs: `docker logs saby-staging-whatsapp`
2. Verify webhook URL is accessible
3. Confirm verify token matches exactly
4. Check Meta dashboard for webhook status and error messages
