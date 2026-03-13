#!/bin/bash
set -e

# Vulu Agent Runner - Complete Automated Setup
# This script sets up everything it can automatically

echo "═══════════════════════════════════════════════════════════════════"
echo "  VULU AGENT RUNNER - COMPLETE SETUP"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check requirements
echo -e "${BLUE}Checking environment...${NC}"
MISSING=0

if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found${NC}"
  MISSING=1
fi

if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm not found${NC}"
  MISSING=1
fi

if ! command -v git &> /dev/null; then
  echo -e "${RED}✗ git not found${NC}"
  MISSING=1
fi

if [ $MISSING -eq 1 ]; then
  echo -e "${RED}Please install missing tools and try again${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Node.js, npm, git found${NC}"
echo ""

# Check optional tools
NGROK_AVAILABLE=0

if command -v ngrok &> /dev/null; then
  NGROK_AVAILABLE=1
  echo -e "${GREEN}✓ ngrok found${NC}"
else
  echo -e "${YELLOW}⊘ ngrok not found - will skip tunnel setup${NC}"
fi

echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Prompt for secrets
echo -e "${BLUE}Enter your API keys and secrets:${NC}"
echo ""

read -sp "OPENAI_API_KEY: " OPENAI_API_KEY
echo ""

read -sp "LINEAR_API_KEY: " LINEAR_API_KEY
echo ""

read -sp "VULU_AGENT_TASK_TOKEN (or press enter to generate): " VULU_AGENT_TASK_TOKEN
if [ -z "$VULU_AGENT_TASK_TOKEN" ]; then
  VULU_AGENT_TASK_TOKEN=$(openssl rand -hex 32)
  echo -e "${GREEN}Generated: $VULU_AGENT_TASK_TOKEN${NC}"
fi
echo ""

read -sp "LINEAR_WEBHOOK_SECRET (from Linear webhooks, or press enter to skip): " LINEAR_WEBHOOK_SECRET
echo ""

echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Export for use
export OPENAI_API_KEY
export LINEAR_API_KEY
export VULU_AGENT_TASK_TOKEN
export LINEAR_WEBHOOK_SECRET
export VULU_AGENT_RUNNER_CONFIG="$PWD/config.local.json"

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies...${NC}"
if npm install > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Dependencies installed${NC}"
else
  echo -e "${RED}✗ Failed to install dependencies${NC}"
  exit 1
fi
echo ""

# Step 2: Write local env guidance
echo -e "${BLUE}Step 2: Local runner environment...${NC}"
echo -e "${GREEN}✓ Using local runner execution only${NC}"
echo "  GitHub fallback workflows are deprecated and disabled."
echo ""

# Step 3: Start ngrok if available
TUNNEL_URL=""
if [ $NGROK_AVAILABLE -eq 1 ]; then
  echo -e "${BLUE}Step 3: Starting ngrok tunnel...${NC}"

  ngrok http 8788 --log=stdout > /tmp/ngrok.log 2>&1 &
  NGROK_PID=$!
  echo "ngrok process: $NGROK_PID"

  sleep 3

  # Extract URL from ngrok
  TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*' | grep -o 'https://[^"]*' | head -1)

  if [ -n "$TUNNEL_URL" ]; then
    echo -e "${GREEN}✓ ngrok tunnel started${NC}"
    echo -e "  Public URL: ${BLUE}$TUNNEL_URL${NC}"
  else
    echo -e "${RED}✗ Failed to get ngrok URL${NC}"
    kill $NGROK_PID 2>/dev/null || true
  fi
else
  echo -e "${YELLOW}⊘ Step 3: Skipped (ngrok not available)${NC}"
  echo "  To expose publicly, run in another terminal:"
  echo "    ngrok http 8788"
  echo "  Then use the public URL for Linear/OpenClaw webhooks"
fi
echo ""

# Step 4: Create Linear webhook
if [ -n "$LINEAR_API_KEY" ] && [ -n "$TUNNEL_URL" ]; then
  echo -e "${BLUE}Step 4: Creating Linear webhook...${NC}"

  WEBHOOK_URL="${TUNNEL_URL}/webhooks/linear"

  # Note: Linear webhook creation requires workspace context
  # This is a placeholder - actual creation might need manual setup
  echo -e "${YELLOW}⊘ Linear webhook creation requires workspace context${NC}"
  echo "  Manually create webhook in Linear:"
  echo "    URL: ${BLUE}$WEBHOOK_URL${NC}"
  echo "    Events: Issue.updated"
  echo "    Secret: (Linear generates this)"
else
  echo -e "${YELLOW}⊘ Step 4: Skipped${NC}"
fi
echo ""

# Step 5: Start the runner
echo -e "${BLUE}Step 5: Starting Vulu Agent Runner...${NC}"
echo ""

npm run serve &
RUNNER_PID=$!
echo -e "Runner process: $RUNNER_PID"

sleep 2

# Test health endpoint
if curl -s http://localhost:8788/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Runner started and health check passed${NC}"
else
  echo -e "${RED}✗ Runner health check failed${NC}"
  kill $RUNNER_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ SETUP COMPLETE${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "Status:"
echo -e "  Runner:     ${GREEN}Running (PID: $RUNNER_PID)${NC}"
[ -n "$TUNNEL_URL" ] && echo -e "  Tunnel:     ${GREEN}Running (PID: $NGROK_PID)${NC}" || echo -e "  Tunnel:     ${YELLOW}Not started${NC}"
echo -e "  GitHub:     ${YELLOW}Deprecated for auto-loop execution${NC}"
echo ""

echo "Next steps:"
echo "  1. Keep this terminal running"
echo "  2. In Linear, create/update an issue with 'agent-ready' label"
echo "  3. Move issue to 'In Review' state"
echo "  4. Watch the local runner logs / run files for progress"
echo ""

if [ -n "$TUNNEL_URL" ]; then
  echo "Public webhook URL:"
  echo -e "  ${BLUE}${TUNNEL_URL}/webhooks/linear${NC}"
  echo ""
  echo "To manually create Linear webhook:"
  echo "  1. Go to Linear workspace settings"
  echo "  2. Developer → Webhooks → New webhook"
  echo "  3. URL: ${BLUE}${TUNNEL_URL}/webhooks/linear${NC}"
  echo "  4. Events: Issue.updated"
  echo "  5. Copy the secret and set LINEAR_WEBHOOK_SECRET"
else
  echo -e "${YELLOW}⚠️  No public URL - tunnel not available${NC}"
  echo "  Install ngrok (brew install ngrok) and run again"
fi

echo ""
echo "To stop:"
echo "  Press Ctrl+C to stop the runner"

# Keep the script running
wait
