const config = {
    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    
    // Webhook Configuration
    WEBHOOK_URL: process.env.WEBHOOK_URL || process.env.REPL_URL || `https://${process.env.REPL_SLUG}-${process.env.REPL_OWNER}.repl.co`,
    
    // Flipkart API Configuration (Optional)
    FLIPKART_AFFILIATE_ID: process.env.FLIPKART_AFFILIATE_ID || '',
    FLIPKART_AFFILIATE_TOKEN: process.env.FLIPKART_AFFILIATE_TOKEN || '',
    
    // API Endpoints
    FLIPKART_API_BASE: 'https://affiliate-api.flipkart.net/affiliate/api',
    FLIPKART_PRODUCT_API: 'https://affiliate-api.flipkart.net/affiliate/1.0/search.json',
    
    // Bot Settings
    MAX_RESULTS: 25,
    CACHE_TTL: 300000, // 5 minutes
    
    // Features
    ENABLE_LOGGING: true,
    ENABLE_ANALYTICS: false
};

// Validate required environment variables
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(envVar => !config[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set the following environment variables:');
    console.error('- TELEGRAM_BOT_TOKEN: Your Telegram bot token from @BotFather');
    console.error('\nOptional (for Flipkart product search):');
    console.error('- FLIPKART_AFFILIATE_ID: Your Flipkart affiliate ID');
    console.error('- FLIPKART_AFFILIATE_TOKEN: Your Flipkart affiliate token');
    console.error('- WEBHOOK_URL: Your webhook URL (auto-detected on Replit)');
}

module.exports = config;
