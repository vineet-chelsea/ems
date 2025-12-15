#!/bin/bash
# Quick start script for local development

# Change to script directory (project root)
cd "$(dirname "$0")"

echo "🚀 Starting EMS for local development..."
echo "Current directory: $(pwd)"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Start services with local configuration
echo "📦 Starting Docker services (local config)..."
docker-compose -f docker-compose.local.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.local.yml ps

echo ""
echo "✅ Services started!"
echo ""
echo "🌐 Access points:"
echo "   - Backend API: http://localhost:3001"
echo "   - Kafka UI: http://localhost:8081"
echo ""
echo "📝 To view logs: docker-compose -f docker-compose.local.yml logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.local.yml down"

