#!/bin/bash

# Telegram Bot Status Check Script
# This script checks if the Telegram bot is running

echo "📊 Telegram Bot Status Check"
echo "================================"

# Find bot processes
BOT_PROCESSES=$(pgrep -f "telegram/bot.js")

if [ -z "$BOT_PROCESSES" ]; then
    echo "❌ Telegram bot is NOT running"
    echo ""
    echo "🚀 To start the bot, run: ./start_telegram_bot.sh"
else
    echo "✅ Telegram bot is running!"
    echo ""
    echo "📋 Process Details:"
    for PID in $BOT_PROCESSES; do
        echo "   Process ID: $PID"
        echo "   Command: $(ps -p $PID -o command=)"
        echo "   Started: $(ps -p $PID -o lstart=)"
        echo "   Memory: $(ps -p $PID -o rss=) KB"
        echo ""
    done

    echo "📱 Bot is ready to use!"
    echo "   - Open Telegram"
    echo "   - Find your bot"
    echo "   - Send /start"
    echo ""
    echo "🔧 To stop the bot, run: ./stop_telegram_bot.sh"
fi

echo ""
echo "🔍 Additional Information:"
echo "   - Bot file: src/ingestion/telegram/bot.js"
echo "   - Environment: Development"
echo "   - Available projects: 8 active projects"
