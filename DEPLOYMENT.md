# Deployment Guide for spaceflag.online

## Quick Deploy to Render (Recommended - FREE)

### Step 1: Push to GitHub

```bash
# Create a new repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/spaceflag.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select your `spaceflag` repository
5. Configure:
   - **Name**: `spaceflag`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
6. Click "Create Web Service"

### Step 3: Add Custom Domain

1. In Render dashboard, go to your service
2. Click "Settings" → "Custom Domains"
3. Add `spaceflag.online`
4. Update your DNS records:

#### At your domain registrar (Namecheap, GoDaddy, etc.):

**For root domain (spaceflag.online):**
- Type: A
- Host: @
- Value: (Render will provide this)

**For www subdomain (www.spaceflag.online):**
- Type: CNAME
- Host: www
- Value: `spaceflag.onrender.com`

### Step 4: Enable HTTPS

Render automatically provisions SSL certificates once DNS is configured (may take up to 24 hours).

---

## Alternative: Deploy to Fly.io

### Step 1: Install Fly CLI

```bash
# macOS
brew install flyctl

# or via curl
curl -L https://fly.io/install.sh | sh
```

### Step 2: Deploy

```bash
# Login to Fly
fly auth login

# Launch app (first time only)
fly launch --name spaceflag

# Deploy
fly deploy

# Add custom domain
fly certs add spaceflag.online
```

### Step 3: Update DNS

Add these records at your domain registrar:
- Type: A
- Host: @
- Value: (Fly will provide the IP)

---

## Alternative: DigitalOcean App Platform

### Step 1: Create App

1. Go to [DigitalOcean](https://www.digitalocean.com)
2. Create account (get $200 credit with new account)
3. Click "Create" → "Apps"
4. Choose GitHub repository
5. Configure:
   - **Run Command**: `node server.js`
   - **HTTP Port**: 3000
   - **Instance Size**: Basic ($5/month)

### Step 2: Add Domain

1. In app settings, add domain `spaceflag.online`
2. Update DNS with provided records

---

## DNS Configuration Tips

### Cloudflare (Recommended for free CDN)

1. Add site to Cloudflare (free plan)
2. Update nameservers at your registrar
3. Add records:
   ```
   A     @     [your-server-ip]
   CNAME www   @
   ```
4. Enable "Proxied" for CDN benefits

### Testing DNS

```bash
# Check if DNS is propagated
dig spaceflag.online
nslookup spaceflag.online

# Test the site
curl -I https://spaceflag.online
```

---

## Post-Deployment Checklist

- [ ] Site loads at https://spaceflag.online
- [ ] WebSocket connections work (test creating a room)
- [ ] SSL certificate is valid
- [ ] www.spaceflag.online redirects to main domain
- [ ] Multiple players can join rooms
- [ ] Game state syncs properly

---

## Monitoring

### Free Options

1. **UptimeRobot**: Monitor uptime
2. **Render Dashboard**: Built-in metrics
3. **Cloudflare Analytics**: If using Cloudflare

### Commands to Check Status

```bash
# Check if site is up
curl -I https://spaceflag.online

# Test WebSocket
wscat -c wss://spaceflag.online/socket.io/
```

---

## Troubleshooting

### Socket.IO not connecting
- Ensure WebSocket support is enabled on your hosting
- Check CORS settings if using separate domains

### Site not loading
- Check DNS propagation (can take up to 48 hours)
- Verify A/CNAME records are correct
- Check server logs in hosting dashboard

### Performance issues
- Enable Cloudflare CDN
- Upgrade hosting plan if needed
- Check server resource usage

---

## Support

For issues specific to the game, check the server logs:
- Render: Dashboard → Logs
- Fly: `fly logs`
- DigitalOcean: App → Runtime Logs
