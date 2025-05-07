#!/bin/bash

# Create shared network if it doesn't exist
if ! docker network ls | grep -q orvio-bundl-network; then
  echo "Creating shared Docker network 'orvio-bundl-network'..."
  docker network create orvio-bundl-network
else
  echo "Shared network 'orvio-bundl-network' already exists."
fi

echo "Shared network setup complete!"
echo ""
echo "To start Orvio Backend:"
echo "cd refrence/orvio-backend && docker-compose up -d"
echo ""
echo "To start Bundl Backend:"
echo "docker-compose up -d"
echo ""
echo "Note: Start Orvio first since Bundl depends on the same Postgres/Redis services" 