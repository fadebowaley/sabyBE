#!/bin/bash

echo "🚀 Setting up Halo Data Migration System..."

# Navigate to migration data directory
cd migration_data

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "📋 Available commands:"
    echo "  npm run migrate    - Run the migration"
    echo "  npm run install-deps - Reinstall dependencies"
    echo ""
    echo "📁 CSV templates are ready in the migration_data directory"
    echo "📖 Read README.md for detailed instructions"
    echo ""
    echo "🎯 To run migration:"
    echo "  cd scripts/migration_data"
    echo "  npm run migrate"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
