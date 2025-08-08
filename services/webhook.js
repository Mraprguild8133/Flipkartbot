const config = require('../config/config');
const logger = require('../utils/logger');

class WebhookService {
    constructor() {
        this.webhookUrl = config.WEBHOOK_URL;
        this.isConfigured = false;
    }

    // Initialize webhook
    async initialize(bot) {
        try {
            if (!this.webhookUrl || this.webhookUrl.includes('your-repl-url')) {
                logger.warn('Webhook URL not properly configured. Bot may not receive updates.');
                return false;
            }

            const webhookPath = `/webhook/${config.TELEGRAM_BOT_TOKEN}`;
            const fullWebhookUrl = `${this.webhookUrl}${webhookPath}`;

            await bot.setWebHook(fullWebhookUrl);
            logger.info(`Webhook set successfully: ${fullWebhookUrl}`);
            
            this.isConfigured = true;
            return true;

        } catch (error) {
            logger.error('Failed to set webhook:', error);
            return false;
        }
    }

    // Get webhook info
    async getWebhookInfo(bot) {
        try {
            const info = await bot.getWebHookInfo();
            return {
                success: true,
                info: {
                    url: info.url,
                    hasCustomCertificate: info.has_custom_certificate,
                    pendingUpdateCount: info.pending_update_count,
                    lastErrorDate: info.last_error_date,
                    lastErrorMessage: info.last_error_message,
                    maxConnections: info.max_connections,
                    allowedUpdates: info.allowed_updates
                }
            };
        } catch (error) {
            logger.error('Failed to get webhook info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Remove webhook
    async removeWebhook(bot) {
        try {
            await bot.deleteWebHook();
            logger.info('Webhook removed successfully');
            this.isConfigured = false;
            return true;
        } catch (error) {
            logger.error('Failed to remove webhook:', error);
            return false;
        }
    }

    // Check webhook status
    getStatus() {
        return {
            configured: this.isConfigured,
            url: this.webhookUrl,
            path: `/webhook/${config.TELEGRAM_BOT_TOKEN}`
        };
    }

    // Validate webhook URL
    validateWebhookUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return {
                valid: parsedUrl.protocol === 'https:',
                error: parsedUrl.protocol !== 'https:' ? 'Webhook URL must use HTTPS' : null
            };
        } catch (error) {
            return {
                valid: false,
                error: 'Invalid webhook URL format'
            };
        }
    }

    // Setup webhook with validation
    async setupWebhook(bot, customUrl = null) {
        try {
            const webhookUrl = customUrl || this.webhookUrl;
            
            const validation = this.validateWebhookUrl(webhookUrl);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            // Update webhook URL if custom URL provided
            if (customUrl) {
                this.webhookUrl = customUrl;
            }

            const success = await this.initialize(bot);
            if (success) {
                logger.info('Webhook setup completed successfully');
                return {
                    success: true,
                    url: `${webhookUrl}/webhook/${config.TELEGRAM_BOT_TOKEN}`
                };
            } else {
                throw new Error('Failed to initialize webhook');
            }

        } catch (error) {
            logger.error('Webhook setup failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new WebhookService();
