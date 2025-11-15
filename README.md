+--------------------------------+
|  LINUX MCP SERVER SETUP GUIDE  |
+--------------------------------+

## Overview

Would you like to control a Linux machine by using your local LLM? You can use this very very (did I say very?) simple MCP server. It uses **Redis** + **BullMQ** as a persistent queue for command execution, it also has **API-key authentication** but please don't deploy it anywhere other than your own **PRIVATE LOCAL NETWORK**.


## Prerequisites
- **Node 24** To build the server
- **Redis-server** To store the queueueueue
- **OpenSSL** generates the server secret
- **Curl** To test APIs
- **Nano** or **vi** if you are fancy
- **Ollama** or **Claude**
- **GptOSS:20b** because that's what I used!


## Installation

### 1. Clone the repository

```bash
cd ~/workspace
git clone https://github.com/aayushkumaraks/linux-mcp-redis
cd linux-mcp-redis
```

### 2. Install Dependencies

Check if you have node installed:
```bash
node -v
```
if it returned version above 18, then all good or else install Node. Better to install [NVM](https://github.com/nvm-sh/nvm)

If you have installed nvm then setup Node 24 LTS.
```bash
nvm install 24 && nvm use 24
```
Install all the required Node Packages.
```bash
npm i
```

Generate server secret and store it in the `.env` file.
```bash
openssl rand -hex 32 | xargs -I {} bash -c "echo SERVER_SECRET={} >> .env && echo SERVER_SECRET set"
```

Generate API key.
```bash
node create_api_key.js "LLM client - trusted"
```
Please save it somewhere! You will need it while setting up the client or when you are testing.

Install Pm2 to create startup services. (Alternatively you can use Systemd but I don't like it.)
```bash
npm install -g pm2@latest --location=global

# Refresh your CLI
source ~/.bash

# create services
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 pm2 startup # skip if you dont want it to run on startup.
```

Install and setup Redis.
```bash
sudo apt-get update
sudo apt-get install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 3. Setup ENV variables

Look at the .env.local file for reference. The ENV variables should look something like this.
```bash
REDIS_URL=redis://127.0.0.1:6379
MCP_NAME=linux-mcp
MCP_VERSION=1.0.0
JOB_RESULT_TTL=86400
SERVER_SECRET= #Somthing
```

### 4. Expose every service to the local network

Allow port `5379` or whatever you have used in the env variable `HTTP_PORT`
```bash
ufw allow 5379
```
Install `ufw` if you don't have it. IT IS EASYYYYYY!


**THAT'S IT!**

Now go and install the MCP bridge.
