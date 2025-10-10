#!/bin/bash

# Docker + Tailscale + MongoDB Connectivity Checker
# Usage: ./scripts/check-docker-connectivity.sh

set -e

echo "════════════════════════════════════════════════════════════"
echo "  Docker + Tailscale + MongoDB Connectivity Check"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load .env.docker to get MongoDB host
if [ -f .env.docker ]; then
    export $(cat .env.docker | grep MONGODB_URI | xargs)
    # Extract hostname from MONGODB_URI
    MONGO_HOST=$(echo $MONGODB_URI | sed -E 's|mongodb://([^:/@]+:[^:/@]+@)?([^:/]+).*|\2|')
    MONGO_PORT=27017
else
    echo -e "${RED}✗${NC} .env.docker not found"
    exit 1
fi

echo -e "${BLUE}🔍 Checking components...${NC}\n"

# 1. Check Tailscale
echo -e "${BLUE}1. Tailscale Status${NC}"
if command -v tailscale &> /dev/null; then
    if tailscale status > /dev/null 2>&1; then
        echo -e "   ${GREEN}✓${NC} Tailscale is running"

        # Check if target host is in Tailscale network
        if tailscale status | grep -q "$MONGO_HOST"; then
            echo -e "   ${GREEN}✓${NC} MongoDB host is in Tailscale network"
            TAILSCALE_IP=$(tailscale status | grep "$MONGO_HOST" | awk '{print $1}')
            echo -e "   ${BLUE}→${NC} Tailscale IP: $TAILSCALE_IP"
        else
            echo -e "   ${YELLOW}⚠${NC}  MongoDB host not found in Tailscale status"
            echo -e "   ${BLUE}→${NC} Hostname: $MONGO_HOST"
        fi
    else
        echo -e "   ${RED}✗${NC} Tailscale is not connected"
        echo -e "   ${YELLOW}💡${NC} Run: tailscale up"
        exit 1
    fi
else
    echo -e "   ${RED}✗${NC} Tailscale is not installed"
    exit 1
fi

echo ""

# 2. Check network connectivity
echo -e "${BLUE}2. Network Connectivity${NC}"
if ping -c 2 -W 3 "$MONGO_HOST" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Can ping MongoDB host"
else
    echo -e "   ${RED}✗${NC} Cannot ping MongoDB host"
    echo -e "   ${YELLOW}💡${NC} Check Tailscale connection and hostname"
    exit 1
fi

echo ""

# 3. Check MongoDB port
echo -e "${BLUE}3. MongoDB Port${NC}"
if command -v nc &> /dev/null; then
    if nc -zv -w 3 "$MONGO_HOST" "$MONGO_PORT" 2>&1 | grep -q "succeeded\|open"; then
        echo -e "   ${GREEN}✓${NC} MongoDB port $MONGO_PORT is accessible"
    else
        echo -e "   ${RED}✗${NC} Cannot connect to MongoDB port $MONGO_PORT"
        echo -e "   ${YELLOW}💡${NC} Check if MongoDB is running on remote server"
        exit 1
    fi
else
    echo -e "   ${YELLOW}⚠${NC}  netcat (nc) not installed, skipping port check"
fi

echo ""

# 4. Check Docker
echo -e "${BLUE}4. Docker Status${NC}"
if docker info > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Docker is running"
else
    echo -e "   ${RED}✗${NC} Docker is not running"
    exit 1
fi

# Check if container is running
if docker-compose --env-file .env.docker ps | grep -q "scxmcl-app.*Up"; then
    echo -e "   ${GREEN}✓${NC} Application container is running"

    # Get container health
    HEALTH=$(docker inspect scxmcl-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    if [ "$HEALTH" = "healthy" ]; then
        echo -e "   ${GREEN}✓${NC} Container is healthy"
    else
        echo -e "   ${YELLOW}⚠${NC}  Container health: $HEALTH"
    fi
else
    echo -e "   ${RED}✗${NC} Application container is not running"
    echo -e "   ${YELLOW}💡${NC} Run: docker-compose --env-file .env.docker up -d"
    exit 1
fi

echo ""

# 5. Check container connectivity to MongoDB
echo -e "${BLUE}5. Container → MongoDB${NC}"
if docker-compose --env-file .env.docker exec -T app ping -c 2 -W 3 "$MONGO_HOST" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Container can ping MongoDB host"
else
    echo -e "   ${RED}✗${NC} Container cannot ping MongoDB host"
    echo -e "   ${YELLOW}💡${NC} Check Docker network configuration"
    exit 1
fi

if command -v nc &> /dev/null; then
    if docker-compose --env-file .env.docker exec -T app nc -zv -w 3 "$MONGO_HOST" "$MONGO_PORT" 2>&1 | grep -q "open"; then
        echo -e "   ${GREEN}✓${NC} Container can reach MongoDB port"
    else
        echo -e "   ${RED}✗${NC} Container cannot reach MongoDB port"
        exit 1
    fi
fi

echo ""

# 6. Check application health endpoint
echo -e "${BLUE}6. Application Health${NC}"
if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo -e "   ${GREEN}✓${NC} Health endpoint responding"
else
    echo -e "   ${RED}✗${NC} Health endpoint not responding"
    exit 1
fi

echo ""

# 7. Check database status endpoint
echo -e "${BLUE}7. Database Connection${NC}"
DB_STATUS=$(curl -sf http://localhost:3000/api/db-status 2>/dev/null)
if [ $? -eq 0 ]; then
    CONNECTED=$(echo $DB_STATUS | grep -o '"connected":[^,}]*' | cut -d':' -f2)
    if [ "$CONNECTED" = "true" ]; then
        echo -e "   ${GREEN}✓${NC} MongoDB connection successful"

        # Extract details
        EXAM_COUNT=$(echo $DB_STATUS | grep -o '"examCount":[0-9]*' | cut -d':' -f2)
        QUESTION_COUNT=$(echo $DB_STATUS | grep -o '"questionCount":[0-9]*' | cut -d':' -f2)
        RESPONSE_TIME=$(echo $DB_STATUS | grep -o '"responseTime":[0-9]*' | cut -d':' -f2)

        if [ ! -z "$EXAM_COUNT" ]; then
            echo -e "   ${BLUE}→${NC} Exams: $EXAM_COUNT"
        fi
        if [ ! -z "$QUESTION_COUNT" ]; then
            echo -e "   ${BLUE}→${NC} Questions: $QUESTION_COUNT"
        fi
        if [ ! -z "$RESPONSE_TIME" ]; then
            echo -e "   ${BLUE}→${NC} Response time: ${RESPONSE_TIME}ms"
        fi
    else
        echo -e "   ${RED}✗${NC} MongoDB connection failed"
        ERROR=$(echo $DB_STATUS | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$ERROR" ]; then
            echo -e "   ${RED}→${NC} Error: $ERROR"
        fi
        exit 1
    fi
else
    echo -e "   ${RED}✗${NC} Cannot reach database status endpoint"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ All checks passed!${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Your application is fully connected to MongoDB via Tailscale."
echo ""
