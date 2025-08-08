const axios = require('axios');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const FlipkartLiveScraper = require('../scrapers/flipkart_live');

class FlipkartService {
    constructor() {
        this.baseURL = config.FLIPKART_API_BASE;
        this.affiliateId = config.FLIPKART_AFFILIATE_ID;
        this.affiliateToken = config.FLIPKART_AFFILIATE_TOKEN;
        this.cache = new Map();
        this.rateLimitDelay = 1000; // 1 second between requests
        this.lastRequestTime = 0;
        this.liveScraper = new FlipkartLiveScraper();
    }

    // Rate limiting
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            await helpers.sleep(this.rateLimitDelay - timeSinceLastRequest);
        }
        
        this.lastRequestTime = Date.now();
    }

    // Check if API credentials are available
    hasApiCredentials() {
        return this.affiliateId && this.affiliateToken;
    }

    // Get cached results
    getCachedResults(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < config.CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    // Cache results
    setCachedResults(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });

        // Clean old cache entries (simple cleanup)
        if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    // Search products using Flipkart API
    async searchProducts(query, limit = config.MAX_RESULTS) {
        try {
            // Check cache first
            const cacheKey = `search:${query}:${limit}`;
            const cached = this.getCachedResults(cacheKey);
            if (cached) {
                return cached;
            }

            // Try real-time scraping first
            const liveResults = await this.scrapeLiveProducts(query, limit);
            if (liveResults.success && liveResults.products.length > 0) {
                return liveResults;
            }
            
            // Fallback to API if available
            if (!this.hasApiCredentials()) {
                logger.info('Using sample data as fallback');
                return this.getSampleProducts(query, limit);
            }

            await this.enforceRateLimit();

            const params = {
                query: query,
                resultCount: limit,
                format: 'json'
            };

            const headers = {
                'Fk-Affiliate-Id': this.affiliateId,
                'Fk-Affiliate-Token': this.affiliateToken,
                'Content-Type': 'application/json',
                'User-Agent': 'FlipkartBot/1.0'
            };

            logger.info('Searching Flipkart for:', query);

            const response = await axios.get(config.FLIPKART_PRODUCT_API, {
                params,
                headers,
                timeout: 10000
            });

            if (!response.data || !response.data.products) {
                return {
                    success: false,
                    products: [],
                    error: 'No products found'
                };
            }

            const products = this.formatProducts(response.data.products);
            const result = {
                success: true,
                products,
                total: products.length,
                query
            };

            // Cache the results
            this.setCachedResults(cacheKey, result);

            logger.info(`Found ${products.length} products for query: ${query}`);
            return result;

        } catch (error) {
            logger.error('Flipkart search error:', error);

            if (error.response?.status === 429) {
                return {
                    success: false,
                    products: [],
                    error: 'Rate limit exceeded. Please try again in a few moments.'
                };
            }

            if (error.response?.status === 401) {
                return {
                    success: false,
                    products: [],
                    error: 'Invalid API credentials. Please contact support.'
                };
            }

            return {
                success: false,
                products: [],
                error: error.message.includes('credentials') ? error.message : 'Search service temporarily unavailable. Please try again later.'
            };
        }
    }

    // Get deals and offers
    async getDeals(category = '', limit = config.MAX_RESULTS) {
        try {
            const cacheKey = `deals:${category}:${limit}`;
            const cached = this.getCachedResults(cacheKey);
            if (cached) {
                return cached;
            }

            // Try live scraping for deals
            const categoryQueries = {
                'electronics': 'electronics offer',
                'fashion': 'fashion sale',
                'mobile': 'mobile deals',
                'laptop': 'laptop offers'
            };
            
            const searchQuery = categoryQueries[category] || 'deals offers sale';
            const liveDeals = await this.scrapeLiveProducts(searchQuery, limit);
            
            if (liveDeals.success && liveDeals.products.length > 0) {
                return {
                    success: true,
                    deals: liveDeals.products.filter(p => p.discount > 10),
                    total: liveDeals.products.length,
                    category: category || 'all',
                    source: 'live_scraping'
                };
            }
            
            if (!this.hasApiCredentials()) {
                return this.getSampleDeals(category, limit);
            }

            // For deals, we can search for popular categories with high discounts
            const searchQueries = category ? [category] : [
                'smartphones sale',
                'laptop deals',
                'fashion sale',
                'electronics offers',
                'home appliances discount'
            ];

            const allDeals = [];

            for (const query of searchQueries.slice(0, 2)) { // Limit to 2 queries to avoid rate limits
                const searchResult = await this.searchProducts(query, Math.floor(limit / searchQueries.length));
                if (searchResult.success) {
                    // Filter products with good discounts (>10%)
                    const dealsFromSearch = searchResult.products.filter(product => {
                        const discount = helpers.calculateDiscount(product.mrp, product.sellingPrice);
                        return discount >= 10;
                    });
                    allDeals.push(...dealsFromSearch);
                }
                
                // Small delay between searches
                await helpers.sleep(500);
            }

            const result = {
                success: true,
                deals: allDeals.slice(0, limit),
                total: allDeals.length,
                category: category || 'all'
            };

            this.setCachedResults(cacheKey, result);
            return result;

        } catch (error) {
            logger.error('Get deals error:', error);
            return {
                success: false,
                deals: [],
                error: 'Unable to fetch deals at the moment. Please try again later.'
            };
        }
    }

    // Format products from API response
    formatProducts(rawProducts) {
        if (!Array.isArray(rawProducts)) {
            return [];
        }

        return rawProducts.map(product => {
            try {
                return {
                    productId: product.productId || product.fskuId,
                    title: product.productTitle || product.title,
                    description: product.productDescription || product.description,
                    sellingPrice: product.sellingPrice || product.price,
                    mrp: product.mrp || product.maximumRetailPrice,
                    discount: product.discountPercentage,
                    inStock: product.inStock !== false,
                    rating: product.rating,
                    reviewCount: product.reviewCount,
                    url: product.productUrl || product.url,
                    flipkartUrl: product.flipkartUrl || product.productUrl,
                    imageUrl: product.imageUrls?.[0] || product.productImages?.[0] || product.image,
                    category: product.categoryPath || product.category,
                    brand: product.productBrand || product.brand,
                    availability: product.availability || (product.inStock ? 'In Stock' : 'Out of Stock')
                };
            } catch (error) {
                logger.error('Error formatting product:', error);
                return null;
            }
        }).filter(product => product !== null);
    }

    // Get product details by ID
    async getProductDetails(productId) {
        try {
            if (!this.hasApiCredentials()) {
                throw new Error('API credentials not configured');
            }

            const cacheKey = `product:${productId}`;
            const cached = this.getCachedResults(cacheKey);
            if (cached) {
                return cached;
            }

            await this.enforceRateLimit();

            // Note: Flipkart API doesn't have a direct product details endpoint
            // We'll need to search for the product
            const result = {
                success: false,
                product: null,
                error: 'Product details feature not available with current API version'
            };

            return result;

        } catch (error) {
            logger.error('Get product details error:', error);
            return {
                success: false,
                product: null,
                error: helpers.formatErrorMessage(error, 'getProductDetails')
            };
        }
    }

    // Get Flipkart original product image URL
    getProductImageUrl(query, index, color) {
        // Use original Flipkart product image URLs from their CDN
        const flipkartImages = [
            'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/h/d/9/-original-imagtc2qzgnnuhxh.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/x/b/u/-original-imagz4qhrcgqgtmj.jpeg', 
            'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/4/h/e/-original-imagzm8hwzrahd2z.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/l/7/j/-original-imagq2v5ggqh2hrh.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/g/b/x/-original-imagtt4h4ptmxgpx.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/computer/u/y/t/-original-imagfdf4bmtka6mu.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/computer/x/m/y/-original-imagqktbejf6erzw.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/headphone/h/k/z/-original-imagqyft7erduspp.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/shoe/k/u/4/-original-imaghzgwbxzp2rzw.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/watch/z/r/z/-original-imagpgr9yhqpz2zr.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/tablet/k/y/s/-original-imagqjhzrfadbyde.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/camera/n/r/n/eos-r100-24-1-eos-r100-canon-original-imagqnpchgwzmnfz.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/television/g/r/h/-original-imagqz4xpsg8dth2.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/air-conditioner-new/o/f/k/-original-imaghx4ttznpchzs.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/refrigerator-new/w/t/u/-original-imaghz8n8ahkhz94.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/washing-machine-new/a/l/f/-original-imagqmq7hfuvzthc.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/book/i/s/w/the-psychology-of-money-original-imafu6qvtgmwyzgr.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/t-shirt/w/z/o/m-tsrt-catalog-05-veirdo-original-imagqfx8kz4xr2fg.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/kurta/g/6/k/m-sksh-dt1105-pcbl-sanganeri-creation-original-imagqfvybgzwqmhs.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/shopsy-shoe/k/4/r/6-white-306-asian-white-original-imafzg7wgytahs7n.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/bag/y/h/w/trendy-15-6-inch-laptop-backpack-backpack-kara-45-original-imagqmy8fkzjhz9z.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/power-bank/l/4/h/22-5w-fast-charging-10000-mah-pb-n83-realme-original-imagppz8vgskwehu.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/speaker/mobile-tablet-speaker/r/q/r/party-rockerz-402-boat-original-imagqb9hfphffkh4.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/gaming-console/z/y/s/no-1-tb-playstation-5-slim-console-digital-edition-sony-original-imah24frhzabh4cg.jpeg',
            'https://rukminim2.flixcart.com/image/312/312/xif0q/action-figure/s/h/m/4-funko-pop-movies-the-batman-the-batman-vinyl-figure-1192-original-imagm8hhk8z2frvy.jpeg'
        ];
        
        // Get category-specific images based on search query
        const category = this.getCategoryFromQuery(query.toLowerCase());
        const categoryImages = this.getImagesByCategory(category, flipkartImages);
        
        return categoryImages[index % categoryImages.length];
    }
    
    // Get category from search query
    getCategoryFromQuery(query) {
        if (query.includes('phone') || query.includes('mobile') || query.includes('smartphone') || query.includes('redmi') || query.includes('iphone') || query.includes('samsung')) {
            return 'mobile';
        } else if (query.includes('laptop') || query.includes('computer') || query.includes('pc')) {
            return 'laptop';
        } else if (query.includes('headphone') || query.includes('earphone') || query.includes('speaker')) {
            return 'audio';
        } else if (query.includes('shoe') || query.includes('footwear') || query.includes('sneaker')) {
            return 'shoes';
        } else if (query.includes('watch') || query.includes('smart watch')) {
            return 'watch';
        } else if (query.includes('tv') || query.includes('television')) {
            return 'tv';
        } else if (query.includes('book')) {
            return 'books';
        } else if (query.includes('shirt') || query.includes('clothing') || query.includes('fashion')) {
            return 'fashion';
        } else {
            return 'electronics';
        }
    }
    
    // Get images by category
    getImagesByCategory(category, allImages) {
        const categoryMap = {
            mobile: allImages.slice(0, 5),
            laptop: allImages.slice(5, 7), 
            audio: allImages.slice(7, 9),
            shoes: allImages.slice(9, 10),
            watch: allImages.slice(10, 11),
            tv: allImages.slice(12, 13),
            books: allImages.slice(16, 17),
            fashion: allImages.slice(17, 19),
            electronics: allImages // Default to all images
        };
        
        return categoryMap[category] || allImages;
    }

    // Get sample products when API credentials are not available
    getSampleProducts(query, limit = 25) {
        const sampleProducts = [];
        const colors = ['4285f4', '34a853', 'ea4335', 'ff9800', '9c27b0', 'e91e63', '607d8b', '795548', '009688', '3f51b5'];
        
        // Generate 25 sample products for pagination demo
        for (let i = 1; i <= 25; i++) {
            const price = Math.floor(Math.random() * 50000) + 5000;
            const mrp = price + Math.floor(Math.random() * 20000) + 2000;
            const discount = Math.round(((mrp - price) / mrp) * 100);
            const rating = (Math.random() * 2 + 3).toFixed(1); // 3.0 to 5.0
            const reviews = Math.floor(Math.random() * 5000) + 100;
            const color = colors[i % colors.length];
            
            sampleProducts.push({
                productId: `sample${i}`,
                title: `${query} Model ${i} - ${i <= 5 ? 'Premium' : i <= 10 ? 'Standard' : i <= 15 ? 'Budget' : i <= 20 ? 'Pro' : 'Special'} Edition`,
                description: `High-quality ${query} with excellent features, great performance and value for money. Model ${i} specifications.`,
                sellingPrice: price,
                mrp: mrp,
                discount: discount,
                inStock: Math.random() > 0.1, // 90% in stock
                rating: parseFloat(rating),
                reviewCount: reviews,
                url: 'https://www.flipkart.com',
                flipkartUrl: 'https://www.flipkart.com',
                imageUrl: this.getProductImageUrl(query, i, color),
                category: 'Electronics',
                brand: ['Samsung', 'Apple', 'Xiaomi', 'OnePlus', 'Realme', 'Vivo', 'Oppo', 'Nokia', 'Motorola', 'Sony'][i % 10],
                availability: Math.random() > 0.1 ? 'In Stock' : 'Limited Stock'
            });
        }

        const result = {
            success: true,
            products: sampleProducts.slice(0, limit),
            total: sampleProducts.length,
            query,
            note: 'Demo mode: Connect Flipkart API for real products'
        };

        // Cache the sample results
        const cacheKey = `search:${query}:${limit}`;
        this.setCachedResults(cacheKey, result);

        logger.info(`Returning ${result.products.length} sample products for query: ${query}`);
        return result;
    }

    // Get sample deals when API credentials are not available
    getSampleDeals(category = '', limit = config.MAX_RESULTS) {
        const sampleDeals = [
            {
                productId: 'deal1',
                title: 'Smartphone Festival Sale',
                description: 'Latest smartphones with huge discounts and exciting offers.',
                sellingPrice: 18999,
                mrp: 25999,
                discount: 27,
                inStock: true,
                rating: 4.4,
                reviewCount: 1876,
                url: 'https://www.flipkart.com',
                flipkartUrl: 'https://www.flipkart.com',
                imageUrl: 'https://rukminim2.flixcart.com/image/312/312/xif0q/mobile/h/d/9/-original-imagtc2qzgnnuhxh.jpeg',
                category: 'Electronics',
                brand: 'Popular Brand',
                availability: 'In Stock'
            },
            {
                productId: 'deal2',
                title: 'Laptop Mega Deal',
                description: 'High-performance laptops at unbeatable prices with warranty.',
                sellingPrice: 45999,
                mrp: 59999,
                discount: 23,
                inStock: true,
                rating: 4.6,
                reviewCount: 967,
                url: 'https://www.flipkart.com',
                flipkartUrl: 'https://www.flipkart.com',
                imageUrl: 'https://rukminim2.flixcart.com/image/312/312/xif0q/computer/u/y/t/-original-imagfdf4bmtka6mu.jpeg',
                category: 'Electronics',
                brand: 'Tech Brand',
                availability: 'In Stock'
            },
            {
                productId: 'deal3',
                title: 'Fashion Week Special',
                description: 'Trendy clothing and accessories with amazing discounts.',
                sellingPrice: 1299,
                mrp: 1999,
                discount: 35,
                inStock: true,
                rating: 4.2,
                reviewCount: 543,
                url: 'https://www.flipkart.com',
                flipkartUrl: 'https://www.flipkart.com',
                imageUrl: 'https://rukminim2.flixcart.com/image/312/312/xif0q/t-shirt/w/z/o/m-tsrt-catalog-05-veirdo-original-imagqfx8kz4xr2fg.jpeg',
                category: 'Fashion',
                brand: 'Style Brand',
                availability: 'In Stock'
            }
        ];

        const result = {
            success: true,
            deals: sampleDeals.slice(0, limit),
            total: sampleDeals.length,
            category: category || 'all',
            note: 'Demo mode: Connect Flipkart API for real deals'
        };

        const cacheKey = `deals:${category}:${limit}`;
        this.setCachedResults(cacheKey, result);

        logger.info(`Returning ${result.deals.length} sample deals for category: ${category || 'all'}`);
        return result;
    }

    // Scrape live products from Flipkart using Node.js
    async scrapeLiveProducts(query, limit = 25) {
        try {
            // Check cache first
            const cacheKey = `live_search:${query}:${limit}`;
            const cached = this.getCachedResults(cacheKey);
            if (cached) {
                logger.info(`Returning cached live results for: ${query}`);
                return cached;
            }

            logger.info(`Starting live scraping for: ${query}`);
            
            // Rate limiting for scraping
            await this.enforceRateLimit();
            
            const result = await this.liveScraper.searchProducts(query, limit);
            
            if (result.success && result.products.length > 0) {
                // Cache the live results with shorter TTL (2 minutes for live data)
                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
                
                logger.info(`Live scraping successful: ${result.products.length} products for "${query}"`);
                return result;
            } else {
                logger.warn(`No live products found for: ${query} - ${result.error || 'Unknown reason'}`);
                return {
                    success: false,
                    products: [],
                    error: result.error || 'No products found',
                    query
                };
            }
            
        } catch (error) {
            logger.error('Error in scrapeLiveProducts:', error);
            return {
                success: false,
                products: [],
                error: error.message,
                query
            };
        }
    }

    // Health check for the service
    async healthCheck() {
        try {
            if (!this.hasApiCredentials()) {
                return {
                    status: 'warning',
                    message: 'API credentials not configured',
                    hasCredentials: false
                };
            }

            // Try a simple search to test API connectivity
            const testResult = await this.searchProducts('test', 1);
            
            return {
                status: testResult.success ? 'healthy' : 'error',
                message: testResult.success ? 'API is working' : testResult.error,
                hasCredentials: true,
                cacheSize: this.cache.size
            };

        } catch (error) {
            return {
                status: 'error',
                message: helpers.formatErrorMessage(error, 'healthCheck'),
                hasCredentials: this.hasApiCredentials(),
                cacheSize: this.cache.size
            };
        }
    }
}

module.exports = new FlipkartService();
