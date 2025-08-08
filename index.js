const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const logger = require('./utils/logger');
const webhookService = require('./services/webhook');
const commandHandlers = require('./bot/commands');
const messageHandlers = require('./bot/handlers');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'templates')));

// Initialize Telegram Bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {
    webHook: false, // Start with polling for development
    polling: true
});

// Set webhook for production (will be configured on deployment)
const webhookUrl = `${config.WEBHOOK_URL}/webhook/${config.TELEGRAM_BOT_TOKEN}`;

// Try to set webhook, fallback to polling if it fails
try {
    if (process.env.NODE_ENV === 'production' || process.env.WEBHOOK_URL) {
        bot.setWebHook(webhookUrl);
        logger.info('Webhook mode enabled');
    } else {
        logger.info('Development mode: Using polling instead of webhook');
    }
} catch (error) {
    logger.warn('Webhook setup failed, using polling mode:', error.message);
}

// Main dashboard route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Webhook endpoint
app.post(`/webhook/${config.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.sendStatus(500);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Bot status endpoint
app.get('/bot-status', async (req, res) => {
    try {
        const botInfo = await bot.getMe();
        res.json({
            status: 'active',
            bot: botInfo,
            webhook: webhookUrl,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Bot status check failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Set bot instance for handlers
commandHandlers.setBot(bot);
messageHandlers.setBot(bot);

// Command handlers
bot.onText(/\/start/, commandHandlers.start);
bot.onText(/\/help/, commandHandlers.help);
bot.onText(/\/search (.+)/, commandHandlers.search);
bot.onText(/\/deals/, commandHandlers.deals);
bot.onText(/\/status/, commandHandlers.status);

// Message handlers
bot.on('message', messageHandlers.handleMessage);
bot.on('callback_query', messageHandlers.handleCallbackQuery);

// Error handling
bot.on('error', (error) => {
    logger.error('Bot error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Start server  
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Webhook URL: ${webhookUrl}`);
    logger.info('Telegram bot is ready!');
});

module.exports = { app, bot };
