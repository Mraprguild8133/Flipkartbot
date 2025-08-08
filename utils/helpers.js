const logger = require('./logger');

class Helpers {
    // Format price with currency symbol
    formatPrice(price, currency = '₹') {
        if (!price) return 'Price not available';
        return `${currency}${Number(price).toLocaleString('en-IN')}`;
    }

    // Calculate discount percentage
    calculateDiscount(originalPrice, sellingPrice) {
        if (!originalPrice || !sellingPrice) return 0;
        const discount = ((originalPrice - sellingPrice) / originalPrice) * 100;
        return Math.round(discount);
    }

    // Truncate text to specified length
    truncateText(text, maxLength = 100) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // Format product message for Telegram
    formatProductMessage(product) {
        const title = this.truncateText(product.title || product.productTitle, 50);
        const price = this.formatPrice(product.sellingPrice || product.price);
        const originalPrice = product.mrp || product.originalPrice;
        const discount = originalPrice ? this.calculateDiscount(originalPrice, product.sellingPrice || product.price) : 0;
        
        let message = `🛍️ *${title}*\n\n`;
        
        if (discount > 0) {
            message += `💰 *Price:* ${price} `;
            message += `~${this.formatPrice(originalPrice)}~ `;
            message += `(${discount}% OFF)\n`;
        } else {
            message += `💰 *Price:* ${price}\n`;
        }

        if (product.inStock !== undefined) {
            message += `📦 *Stock:* ${product.inStock ? '✅ Available' : '❌ Out of Stock'}\n`;
        }

        if (product.rating && product.rating > 0) {
            message += `⭐ *Rating:* ${product.rating}/5\n`;
        }

        if (product.description) {
            message += `\n📝 *Description:*\n${this.truncateText(product.description, 200)}\n`;
        }

        return message;
    }

    // Create inline keyboard for product
    createProductKeyboard(product, includeSearch = true) {
        const keyboard = [];
        
        if (product.url || product.productUrl) {
            keyboard.push([{
                text: '🔗 View Product',
                url: product.url || product.productUrl
            }]);
        }

        if (product.flipkartUrl) {
            keyboard.push([{
                text: '🛒 Buy on Flipkart',
                url: product.flipkartUrl
            }]);
        }

        if (includeSearch) {
            keyboard.push([
                {
                    text: '🔍 Search Similar',
                    callback_data: `search_similar:${product.productId || product.id || 'unknown'}`
                },
                {
                    text: '❤️ Add to Wishlist',
                    callback_data: `add_wishlist:${product.productId || product.id || 'unknown'}`
                }
            ]);
        }

        return { inline_keyboard: keyboard };
    }

    // Validate search query
    validateSearchQuery(query) {
        if (!query || typeof query !== 'string') {
            return { valid: false, error: 'Search query is required' };
        }

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            return { valid: false, error: 'Search query must be at least 2 characters long' };
        }

        if (trimmed.length > 100) {
            return { valid: false, error: 'Search query is too long (max 100 characters)' };
        }

        return { valid: true, query: trimmed };
    }

    // Generate search suggestions
    getSearchSuggestions() {
        return [
            'smartphones', 'laptops', 'headphones', 'shoes', 'clothing',
            'books', 'electronics', 'home appliances', 'furniture', 'sports equipment'
        ];
    }

    // Format error message for users
    formatErrorMessage(error, context = '') {
        logger.error(`Error in ${context}:`, error);
        
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return '🔌 Connection error. Please try again later.';
        }
        
        if (error.response && error.response.status === 429) {
            return '⏰ Too many requests. Please wait a moment and try again.';
        }
        
        if (error.response && error.response.status === 401) {
            return '🔐 Authentication error. Please contact support.';
        }
        
        return '❌ Something went wrong. Please try again later.';
    }

    // Sleep utility for rate limiting
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Extract product ID from URL
    extractProductId(url) {
        if (!url) return null;
        
        const matches = url.match(/\/p\/([^\/\?]+)/);
        return matches ? matches[1] : null;
    }
}

module.exports = new Helpers();
