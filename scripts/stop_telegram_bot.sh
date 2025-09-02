#!/bin/bash

# Telegram Bot Stop Script
# This script stops the Telegram bot cleanly

echo "🛑 Stopping Telegram Bot..."
echo "================================"

# Find and kill bot processes
BOT_PROCESSES=$(pgrep -f "telegram/bot.js")

if [ -z "$BOT_PROCESSES" ]; then
    echo "ℹ️  No Telegram bot processes found running"
else
    echo "🔄 Stopping bot processes..."
    for PID in $BOT_PROCESSES; do
        echo "   Stopping process $PID..."
        kill $PID 2>/dev/null
    done

    # Wait a moment for processes to stop
    sleep 2

    # Check if any processes are still running
    REMAINING=$(pgrep -f "telegram/bot.js")
    if [ -z "$REMAINING" ]; then
        echo "✅ All Telegram bot processes stopped successfully"
    else
        echo "⚠️  Some processes may still be running. Force killing..."
        pkill -9 -f "telegram/bot.js" 2>/dev/null
        echo "✅ Force stopped remaining processes"
    fi
fi

echo ""
echo "📱 The Telegram bot is now stopped"
echo "🚀 To start it again, run: ./start_telegram_bot.sh"
