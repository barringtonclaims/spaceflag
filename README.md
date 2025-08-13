# Space Capture the Flag - Online Multiplayer

🚀 Play at [spaceflag.online](https://spaceflag.online)

A real-time online multiplayer capture-the-flag game set in space. Create or join rooms with 3-9 players and compete to capture opponents' flags while defending your own.

## Features

- **Online Multiplayer**: Real-time gameplay with Socket.IO
- **Room System**: Create private rooms with 4-character codes
- **3-9 Players**: Scalable gameplay for different group sizes
- **Strategic Elements**: Asteroids, boost pads, and wormholes
- **Beautiful UI**: Space-themed design with smooth animations

## How to Play

### Goal
Capture opponents' flags and bring them to your base. Each player starts with 3 flags. You're eliminated when all your flags are captured. Last player with flags wins!

### Game Elements
- **Bases**: Your home position on the board's edge
- **Asteroids**: Blocked tiles you can't pass through
- **Boost Pads**: Land on these for +2 extra moves
- **Wormholes**: Teleport between paired portals
- **Flags**: Capture by bringing opponent's flag to your base

### Rules
1. Roll 1-6 dice to move orthogonally
2. Tag opponents by landing on them (sends them home)
3. Pick up flags from opponent bases
4. Return to your base with a flag to capture it
5. Lose all 3 flags and you're eliminated

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm start

# Server runs on http://localhost:3000
```

## Deployment

### Option 1: Render (Recommended - Free tier available)

1. Push to GitHub
2. Connect repo on [render.com](https://render.com)
3. Deploy as Web Service
4. Add custom domain in Settings

### Option 2: Fly.io (Free tier with credit card)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly deploy

# Add custom domain
fly certs add spaceflag.online
```

### Option 3: Railway (Simple but paid)

1. Push to GitHub
2. Import on [railway.app](https://railway.app)
3. Add custom domain in Settings

### Option 4: VPS (DigitalOcean, Linode, etc.)

```bash
# SSH to server
ssh user@your-server

# Clone and setup
git clone your-repo
cd chloes-game
npm install

# Use PM2 for production
npm install -g pm2
pm2 start server.js --name spaceflag
pm2 save
pm2 startup

# Setup Nginx reverse proxy
sudo nano /etc/nginx/sites-available/spaceflag
```

Nginx config:
```nginx
server {
    listen 80;
    server_name spaceflag.online;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Set to 'production' for production

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5 Canvas
- **Backend**: Node.js, Express
- **Real-time**: Socket.IO
- **Styling**: Custom CSS with space theme

## License

MIT