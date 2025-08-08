const flipkartService = require('../services/flipkart');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class MessageHandlers {
    constructor() {
        this.bot = null;
    }

    // Handle regular messages
    async handleMessage(msg) {
        try {
            const chatId = msg.chat.id;
            const text = msg.text;

            // Skip if it's a command (starts with /)
            if (text && text.startsWith('/')) {
                return;
            }

            // Skip if message is too old (more than 5 minutes)
            const messageAge = Date.now() / 1000 - msg.date;
            if (messageAge > 300) {
                return;
            }

            // Handle product search from text
            if (text && text.length > 2) {
                const searchSuggestionMessage = `
🔍 *Want to search for "${text}"?*

You can search for products using the search command:

\`/search ${text}\`

Or use the button below for quick search!
                `;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: `🔍 Search "${helpers.truncateText(text, 20)}"`, callback_data: `search:${text}` }
                        ],
                        [
                            { text: '💡 How to Use', callback_data: 'show_help' },
                            { text: '🎯 View Deals', callback_data: 'get_deals' }
                        ]
                    ]
                };

                await this.bot.sendMessage(chatId, searchSuggestionMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } catch (error) {
            logger.error('Error handling message:', error);
        }
    }

    // Handle callback queries (inline keyboard button presses)
    async handleCallbackQuery(callbackQuery) {
        try {
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const data = callbackQuery.data;

            // Acknowledge the callback query
            await this.bot.answerCallbackQuery(callbackQuery.id);

            logger.info(`Callback query received: ${data}`);

            // Parse callback data
            const [action, ...params] = data.split(':');
            const param = params.join(':');

            switch (action) {
                case 'search':
                    await this.handleSearchCallback(chatId, messageId, param);
                    break;

                case 'search_category':
                    await this.handleCategorySearch(chatId, messageId, param);
                    break;

                case 'get_deals':
                    await this.handleGetDeals(chatId, messageId);
                    break;

                case 'deals_category':
                    await this.handleCategoryDeals(chatId, messageId, param);
                    break;

                case 'more_results':
                    await this.handleMoreResults(chatId, messageId, param);
                    break;

                case 'search_similar':
                    await this.handleSearchSimilar(chatId, messageId, param);
                    break;

                case 'add_wishlist':
                    await this.handleAddToWishlist(chatId, messageId, param);
                    break;

                case 'show_help':
                    await this.handleShowHelp(chatId, messageId);
                    break;

                case 'bot_status':
                    await this.handleBotStatus(chatId, messageId);
                    break;

                case 'main_menu':
                    await this.handleMainMenu(chatId, messageId);
                    break;

                case 'refresh_deals':
                    await this.handleRefreshDeals(chatId, messageId);
                    break;

                case 'refresh_status':
                    await this.handleRefreshStatus(chatId, messageId);
                    break;

                case 'page':
                    const [pageQuery, pageNum] = param.split(':');
                    await this.handlePageNavigation(chatId, messageId, pageQuery, parseInt(pageNum));
                    break;

                case 'page_info':
                    await this.handlePageInfo(chatId, messageId, param);
                    break;

                default:
                    await this.bot.sendMessage(chatId, '❌ Unknown action. Please try again.');
            }

        } catch (error) {
            logger.error('Error handling callback query:', error);
            try {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: 'Sorry, something went wrong. Please try again.',
                    show_alert: true
                });
            } catch (ackError) {
                logger.error('Error acknowledging callback query:', ackError);
            }
        }
    }

    // Handle search callback
    async handleSearchCallback(chatId, messageId, query) {
        const validation = helpers.validateSearchQuery(query);
        if (!validation.valid) {
            await this.bot.sendMessage(chatId, `❌ ${validation.error}`);
            return;
        }

        const searchingMsg = await this.bot.sendMessage(chatId, `🔍 Searching for "${validation.query}"...`);

        try {
            const result = await flipkartService.searchProducts(validation.query);
            
            await this.bot.deleteMessage(chatId, searchingMsg.message_id);

            if (!result.success || result.products.length === 0) {
                await this.bot.sendMessage(chatId, `😔 No products found for "${validation.query}". Try different keywords.`);
                return;
            }

            await this.bot.sendMessage(chatId, `🎉 Found ${result.products.length} products for "${validation.query}"`);

            for (const product of result.products.slice(0, 3)) {
                await this.sendProductMessage(chatId, product);
                await helpers.sleep(500);
            }

        } catch (error) {
            logger.error('Error in search callback:', error);
            await this.bot.deleteMessage(chatId, searchingMsg.message_id);
            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'search'));
        }
    }

    // Handle category search
    async handleCategorySearch(chatId, messageId, category) {
        const categoryQueries = {
            electronics: 'smartphones laptops electronics',
            fashion: 'clothing fashion shoes accessories',
            books: 'books education learning',
            home: 'home kitchen appliances furniture'
        };

        const query = categoryQueries[category] || category;
        await this.handleSearchCallback(chatId, messageId, query);
    }

    // Handle get deals
    async handleGetDeals(chatId, messageId) {
        const loadingMsg = await this.bot.sendMessage(chatId, '🎯 Loading deals...');

        try {
            const result = await flipkartService.getDeals();
            
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);

            if (!result.success || result.deals.length === 0) {
                await this.bot.sendMessage(chatId, '😔 No deals available right now. Try searching for specific products.');
                return;
            }

            await this.bot.sendMessage(chatId, `🎉 Found ${result.deals.length} great deals!`);

            for (const deal of result.deals.slice(0, 3)) {
                await this.sendProductMessage(chatId, deal, true);
                await helpers.sleep(500);
            }

        } catch (error) {
            logger.error('Error getting deals:', error);
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'deals'));
        }
    }

    // Handle category deals
    async handleCategoryDeals(chatId, messageId, category) {
        const loadingMsg = await this.bot.sendMessage(chatId, `🎯 Loading ${category} deals...`);

        try {
            const result = await flipkartService.getDeals(category);
            
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);

            if (!result.success || result.deals.length === 0) {
                await this.bot.sendMessage(chatId, `😔 No ${category} deals available right now.`);
                return;
            }

            await this.bot.sendMessage(chatId, `🎉 Found ${result.deals.length} ${category} deals!`);

            for (const deal of result.deals.slice(0, 3)) {
                await this.sendProductMessage(chatId, deal, true);
                await helpers.sleep(500);
            }

        } catch (error) {
            logger.error('Error getting category deals:', error);
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'category deals'));
        }
    }

    // Handle more results
    async handleMoreResults(chatId, messageId, query) {
        await this.bot.sendMessage(chatId, `For more results, please use: /search ${query}`);
    }

    // Handle search similar
    async handleSearchSimilar(chatId, messageId, productId) {
        await this.bot.sendMessage(chatId, '🔍 To find similar products, try searching with specific keywords or brand names.');
    }

    // Handle add to wishlist
    async handleAddToWishlist(chatId, messageId, productId) {
        await this.bot.sendMessage(chatId, '❤️ Wishlist feature coming soon! For now, you can bookmark the product link.');
    }

    // Handle show help
    async handleShowHelp(chatId, messageId) {
        const helpMessage = `
📖 *Quick Help*

🔍 *Search:* \`/search <product name>\`
🎯 *Deals:* \`/deals\`
📊 *Status:* \`/status\`
💡 *Help:* \`/help\`

💫 *Tips:*
• Be specific in your searches
• Try different keywords if no results
• Check deals regularly for best offers
        `;

        await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    }

    // Handle bot status
    async handleBotStatus(chatId, messageId) {
        const health = await flipkartService.healthCheck();
        const statusMessage = `
📊 *Quick Status*

🤖 Bot: ✅ Active
🛍️ Search: ${health.status === 'healthy' ? '✅' : '⚠️'} ${health.status}
⚡ Response: Fast
🕒 ${new Date().toLocaleTimeString()}
        `;

        await this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    }

    // Handle main menu
    async handleMainMenu(chatId, messageId) {
        const menuMessage = `
🏠 *Main Menu*

What would you like to do?
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
                    { text: '📊 Status', callback_data: 'bot_status' }
                ]
            ]
        };

        await this.bot.sendMessage(chatId, menuMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Handle refresh deals
    async handleRefreshDeals(chatId, messageId) {
        await this.handleGetDeals(chatId, messageId);
    }

    // Handle refresh status
    async handleRefreshStatus(chatId, messageId) {
        await this.handleBotStatus(chatId, messageId);
    }

    // Handle page navigation
    async handlePageNavigation(chatId, messageId, query, page) {
        const loadingMsg = await this.bot.sendMessage(chatId, `🔄 Loading page ${page}...`);
        
        try {
            const result = await flipkartService.searchProducts(query);
            
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            
            if (!result.success || result.products.length === 0) {
                await this.bot.sendMessage(chatId, `😔 No products found for "${query}".`);
                return;
            }
            
            // Use command handler's pagination method
            await this.sendPaginatedResults(chatId, result.products, query, page);
            
        } catch (error) {
            logger.error('Error in page navigation:', error);
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            await this.bot.sendMessage(chatId, helpers.formatErrorMessage(error, 'page navigation'));
        }
    }

    // Handle page info
    async handlePageInfo(chatId, messageId, query) {
        const infoMessage = `
📄 *Search Results Info*

🔍 Query: "${query}"
📈 Results per page: 5
📊 Use ⬅️➡️ buttons to navigate

💡 *Tips:*
• Try specific brand names
• Use price ranges like "under 20000"
• Add model numbers for exact matches
        `;
        
        await this.bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown' });
    }

    // Send paginated product results (reuse from commands)
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

    // Send product message helper
    async sendProductMessage(chatId, product, isDeal = false) {
        try {
            const message = helpers.formatProductMessage(product);
            const keyboard = helpers.createProductKeyboard(product);

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
            await this.bot.sendMessage(chatId, `❌ Error displaying product information.`);
        }
    }

    // Set bot reference
    setBot(bot) {
        this.bot = bot;
    }
}

const messageHandlers = new MessageHandlers();

module.exports = {
    handleMessage: (msg) => messageHandlers.handleMessage(msg),
    handleCallbackQuery: (callbackQuery) => messageHandlers.handleCallbackQuery(callbackQuery),
    setBot: (bot) => messageHandlers.setBot(bot)
};
