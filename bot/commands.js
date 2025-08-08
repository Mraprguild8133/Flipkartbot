const flipkartService = require('../services/flipkart');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config/config');

class CommandHandlers {
    // Start command handler
    async start(msg) {
        const chatId = msg.chat.id;
        const firstName = msg.from.first_name || 'there';
        
        const welcomeMessage = `
👋 *Welcome ${firstName}!*

I'm your Flipkart Shopping Assistant Bot! 🛍️

🔍 *What I can do for you:*
• Search for products on Flipkart
• Show you the best deals and offers
• Provide detailed product information
• Display product images and links
• Find festival deals and discounts

📝 *How to use me:*
• \`/search <product name>\` - Search for products
• \`/deals\` - Get latest deals and offers
• \`/help\` - Show all available commands
• \`/status\` - Check bot status

💡 *Quick searches:*
Try searching for: smartphones, laptops, headphones, books, clothing

Ready to start shopping? 🎉
        `;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔍 Search Products', switch_inline_query_current_chat: '/search ' },
                    { text: '🎯 View Deals', callback_data: 'get_deals' }
                ],
                [
                    { text: '📱 Electronics', callback_data: 'search_category:electronics' },
                    { text: '👕 Fashion', callback_data: 'search_category:fashion' }
                ],
                [
                    { text: '💡 Help', callback_data: 'show_help' },
                    { text: '📊 Bot Status', callback_data: 'bot_status' }
                ]
            ]
        };

        try {
            await this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
            logger.info(`Start command executed for user ${firstName} (${chatId})`);
        } catch (error) {
            logger.error('Error in start command:', error);
            await this.bot.sendMessage(chatId, '❌ Welcome message failed to load. Please try /help command.');
        }
    }

    // Help command handler
    async help(msg) {
        const chatId = msg.chat.id;
        
        const helpMessage = `
📖 *Bot Commands & Features*

🔍 *Search Commands:*
• \`/search <product>\` - Search for any product
• \`/deals\` - Get latest deals and offers

📱 *Categories:*
• Electronics (smartphones, laptops, etc.)
• Fashion (clothing, shoes, accessories)
• Books & Education
• Home & Kitchen
• Sports & Fitness

💡 *Search Examples:*
• \`/search iPhone 15\`
• \`/search Nike shoes\`
• \`/search laptop under 50000\`
• \`/search Harry Potter books\`

🎯 *Special Features:*
• Product images and details
• Price comparison with discounts
• Direct Flipkart product links
• Festival deals and offers
• Stock availability status

ℹ️ *Other Commands:*
• \`/status\` - Check bot and API status
• \`/help\` - Show this help message

🚀 *Quick Tips:*
• Be specific in your search queries
• Use keywords like "under 10000" for price ranges
• Try different variations if you don't find what you're looking for

Need more help? Contact support! 🤝
        `;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔍 Try Search', switch_inline_query_current_chat: '/search ' },
                    { text: '🎯 View Deals', callback_data: 'get_deals' }
                ],
                [
                    { text: '🏠 Main Menu', callback_data: 'main_menu' }
                ]
            ]
        };

        try {
            await this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
            logger.info(`Help command executed for chat ${chatId}`);
        } catch (error) {
            logger.error('Error in help command:', error);
            await this.bot.sendMessage(chatId, '❌ Help information could not be loaded.');
        }
    }

    // Search command handler
    async search(msg, match) {
        const chatId = msg.chat.id;
        const query = match[1];

        // Validate search query
        const validation = helpers.validateSearchQuery(query);
        if (!validation.valid) {
            await this.bot.sendMessage(chatId, `❌ ${validation.error}\n\nPlease try again with a valid search term.`);
            return;
        }

        // Send "searching" message
        const searchingMsg = await this.bot.sendMessage(chatId, '🔍 Searching for products... Please wait.');

        try {
            logger.info(`Search initiated for query: ${validation.query}`);

            // Search for products
            const result = await flipkartService.searchProducts(validation.query);

            // Delete "searching" message
            await this.bot.deleteMessage(chatId, searchingMsg.message_id);

            if (!result.success) {
                await this.bot.sendMessage(chatId, `❌ ${result.error}`);
                return;
            }

            if (result.products.length === 0) {
                const noResultsMessage = `
😔 *No products found for "${validation.query}"*

💡 *Try these suggestions:*
• Check spelling and try again
• Use different keywords
• Try broader search terms
• Search for specific brands

🔍 *Popular searches:*
${helpers.getSearchSuggestions().map(s => `• ${s}`).join('\n')}
                `;

                const keyboard = {
                    inline_keyboard: [
                        [{ text: '🔄 Try Different Search', switch_inline_query_current_chat: '/search ' }]
                    ]
                };

                await this.bot.sendMessage(chatId, noResultsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Send paginated results
            await this.sendPaginatedResults(chatId, result.products, validation.query, 1);

        } catch (error) {
            logger.error('Error in search command:', error);
            
            // Delete "searching" message
            try {
                await this.bot.deleteMessage(chatId, searchingMsg.message_id);
            } catch (deleteError) {
                logger.error('Error deleting searching message:', deleteError);
            }

            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'search'));
        }
    }

    // Deals command handler
    async deals(msg) {
        const chatId = msg.chat.id;

        const loadingMsg = await this.bot.sendMessage(chatId, '🎯 Loading latest deals and offers... Please wait.');

        try {
            const result = await flipkartService.getDeals();

            // Delete loading message
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);

            if (!result.success) {
                await this.bot.sendMessage(chatId, `❌ ${result.error}`);
                return;
            }

            if (result.deals.length === 0) {
                const noDealsMessage = `
🎯 *No special deals found right now*

💡 *What you can do:*
• Try searching for specific products with /search
• Check back later for new deals
• Browse different categories

🛍️ *Popular categories to explore:*
${helpers.getSearchSuggestions().map(s => `• ${s}`).join('\n')}
                `;

                const keyboard = {
                    inline_keyboard: [
                        [{ text: '🔍 Search Products', switch_inline_query_current_chat: '/search ' }]
                    ]
                };

                await this.bot.sendMessage(chatId, noDealsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Send deals header
            const dealsHeader = `
🎉 *Latest Deals & Offers*

Found ${result.deals.length} products with great discounts!
💰 Save big on top brands and categories.
            `;

            await this.bot.sendMessage(chatId, dealsHeader, { parse_mode: 'Markdown' });

            // Send deal products
            for (const deal of result.deals.slice(0, 5)) {
                await this.sendProductMessage(chatId, deal, true);
                await helpers.sleep(500);
            }

            // Category deals keyboard
            const categoryKeyboard = {
                inline_keyboard: [
                    [
                        { text: '📱 Electronics Deals', callback_data: 'deals_category:electronics' },
                        { text: '👕 Fashion Deals', callback_data: 'deals_category:fashion' }
                    ],
                    [
                        { text: '🏠 Home Deals', callback_data: 'deals_category:home' },
                        { text: '📚 Books Deals', callback_data: 'deals_category:books' }
                    ],
                    [
                        { text: '🔄 Refresh Deals', callback_data: 'refresh_deals' }
                    ]
                ]
            };

            await this.bot.sendMessage(chatId, '🎯 *Browse deals by category:*', {
                parse_mode: 'Markdown',
                reply_markup: categoryKeyboard
            });

        } catch (error) {
            logger.error('Error in deals command:', error);
            
            try {
                await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            } catch (deleteError) {
                logger.error('Error deleting loading message:', deleteError);
            }

            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'deals'));
        }
    }

    // Status command handler
    async status(msg) {
        const chatId = msg.chat.id;

        try {
            const startTime = Date.now();
            
            // Get bot info
            const botInfo = await this.bot.getMe();
            
            // Check Flipkart service health
            const flipkartHealth = await flipkartService.healthCheck();
            
            const responseTime = Date.now() - startTime;
            const uptime = process.uptime();
            const memory = process.memoryUsage();

            const statusMessage = `
📊 *Bot Status Report*

🤖 *Bot Information:*
• Name: ${botInfo.first_name}
• Username: @${botInfo.username}
• Status: ✅ Active
• Response Time: ${responseTime}ms

⚡ *System Status:*
• Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m
• Memory Usage: ${Math.round(memory.heapUsed / 1024 / 1024)}MB
• Platform: ${process.platform}
• Node.js: ${process.version}

🛍️ *Flipkart Service:*
• Status: ${flipkartHealth.status === 'healthy' ? '✅' : flipkartHealth.status === 'warning' ? '⚠️' : '❌'} ${flipkartHealth.status}
• API Configured: ${flipkartHealth.hasCredentials ? '✅ Yes' : '❌ No'}
• Cache Size: ${flipkartHealth.cacheSize} items
${flipkartHealth.message ? `• Message: ${flipkartHealth.message}` : ''}

🌐 *Webhook:*
• URL: ${config.WEBHOOK_URL}
• Port: ${process.env.PORT || 8000}

📈 *Performance:*
• All systems operational
• Ready to serve requests
• Last updated: ${new Date().toLocaleString()}
            `;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh Status', callback_data: 'refresh_status' },
                        { text: '🏠 Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.bot.sendMessage(chatId, statusMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            logger.info(`Status command executed for chat ${chatId}`);

        } catch (error) {
            logger.error('Error in status command:', error);
            await this.bot.sendMessage(chatId, `❌ Could not retrieve status information.\nError: ${error.message}`);
        }
    }

    // Send formatted product message
    async sendProductMessage(chatId, product, isDeal = false) {
        try {
            const message = helpers.formatProductMessage(product);
            const keyboard = helpers.createProductKeyboard(product);

            // Add deal badge if it's a deal
            const finalMessage = isDeal ? `🔥 *DEAL* 🔥\n\n${message}` : message;

            // Send text message first
            await this.bot.sendMessage(chatId, finalMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Then send image at the bottom if available
            if (product.imageUrl) {
                try {
                    await this.bot.sendPhoto(chatId, product.imageUrl);
                } catch (imageError) {
                    logger.error('Error sending product image:', imageError);
                    // Image error is not critical, product info was already sent
                }
            }

        } catch (error) {
            logger.error('Error sending product message:', error);
            // Send basic error message
            await this.bot.sendMessage(chatId, `❌ Error displaying product: ${product.title || 'Unknown product'}`);
        }
    }

    // Send paginated product results
    async sendPaginatedResults(chatId, products, query, page = 1) {
        const resultsPerPage = 5;
        const totalPages = Math.ceil(products.length / resultsPerPage);
        const startIndex = (page - 1) * resultsPerPage;
        const endIndex = startIndex + resultsPerPage;
        const currentProducts = products.slice(startIndex, endIndex);

        // Send results summary
        const summaryMessage = `
🎉 *Found ${products.length} products for "${query}"*

Page ${page}/${totalPages} - Showing results ${startIndex + 1}-${Math.min(endIndex, products.length)}:
        `;

        await this.bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });

        // Send current page products
        for (const product of currentProducts) {
            await this.sendProductMessage(chatId, product);
            await helpers.sleep(500);
        }

        // Send pagination controls
        const paginationKeyboard = {
            inline_keyboard: []
        };

        // Navigation buttons row
        const navButtons = [];
        if (page > 1) {
            navButtons.push({ text: '⬅️ Previous', callback_data: `page:${query}:${page - 1}` });
        }
        if (page < totalPages) {
            navButtons.push({ text: '➡️ Next', callback_data: `page:${query}:${page + 1}` });
        }
        if (navButtons.length > 0) {
            paginationKeyboard.inline_keyboard.push(navButtons);
        }

        // Action buttons row
        const actionButtons = [
            { text: `📄 Page ${page}/${totalPages}`, callback_data: `page_info:${query}` },
            { text: '🔍 New Search', switch_inline_query_current_chat: '/search ' }
        ];
        paginationKeyboard.inline_keyboard.push(actionButtons);

        await this.bot.sendMessage(chatId, `📊 *Navigation Controls*`, {
            parse_mode: 'Markdown',
            reply_markup: paginationKeyboard
        });
    }

    // Set bot reference
    setBot(bot) {
        this.bot = bot;
    }
}

const commandHandlers = new CommandHandlers();

module.exports = {
    start: (msg) => commandHandlers.start(msg),
    help: (msg) => commandHandlers.help(msg),
    search: (msg, match) => commandHandlers.search(msg, match),
    deals: (msg) => commandHandlers.deals(msg),
    status: (msg) => commandHandlers.status(msg),
    setBot: (bot) => commandHandlers.setBot(bot)
};
