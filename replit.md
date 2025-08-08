# Overview

This is a real-time Telegram bot that serves as a Flipkart shopping assistant with live product scraping capabilities. The bot helps users search for actual products on Flipkart, discover current deals, and get detailed product information with authentic images directly through Telegram chat. Features pagination, Docker support, web dashboard, and 24/7 operation. Built using Node.js and Express with integrated web scraping for real-time product data.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture
- **Framework**: Express.js server handling HTTP requests and webhook endpoints
- **Bot Framework**: node-telegram-bot-api for Telegram Bot API integration
- **Webhook Pattern**: Uses webhook-based message handling instead of polling for better performance and reliability
- **Modular Design**: Organized into separate modules for commands, handlers, services, and utilities

## Message Processing Flow
- **Webhook Endpoint**: Receives updates from Telegram at `/webhook/{bot_token}`
- **Command Routing**: Separate handlers for bot commands (`/start`, `/search`, `/deals`, etc.)
- **Message Processing**: Handles both direct commands and regular text messages with intelligent suggestions
- **Interactive Elements**: Uses inline keyboards for enhanced user interaction

## Service Layer
- **Real-time Product Scraping**: Live product data extraction from Flipkart with authentic images and pricing
- **Flipkart Integration**: Multi-tier approach - live scraping first, then API fallback, then sample data
- **Webhook Service**: Manages webhook configuration and status monitoring for production deployment
- **Caching Strategy**: In-memory caching with TTL (2 minutes for live data, 5 minutes for API data)
- **Rate Limiting**: Built-in delays between requests to respect service limits and avoid blocking
- **Pagination System**: 25 products per search with 5 results per page navigation

## Error Handling & Monitoring
- **Custom Logger**: Configurable logging system with different levels (info, warn, error, debug)
- **Health Monitoring**: Health check endpoint (`/health`) providing system status and metrics
- **Bot Status**: Dedicated endpoint (`/bot-status`) for monitoring bot configuration and webhook status
- **Graceful Degradation**: Continues operation even when Flipkart API credentials are unavailable

## Configuration Management
- **Environment-based Config**: Centralized configuration using environment variables
- **Validation**: Startup validation for required environment variables
- **Flexible Deployment**: Auto-detection of webhook URLs for platforms like Replit

## Data Flow Architecture
1. User sends message → Telegram → Webhook/Polling endpoint
2. Message processing → Command/Handler routing
3. Live product scraping (Flipkart website) → Data extraction & formatting
4. Pagination processing → Product images from Flipkart CDN
5. Response generation with navigation controls → Telegram delivery
6. Caching, error handling and logging throughout the pipeline

# External Dependencies

## Core Dependencies
- **node-telegram-bot-api**: Telegram Bot API client library
- **express**: Web framework for handling HTTP requests, webhooks, and web dashboard
- **axios**: HTTP client for making API requests and web scraping
- **cheerio**: Server-side HTML parsing for product data extraction
- **puppeteer-core**: Browser automation capabilities for advanced scraping
- **dotenv**: Environment variable management
- **trafilatura**: Python-based web content extraction (fallback)
- **beautifulsoup4**: Python HTML parsing library (fallback)

## Telegram Bot API
- **Purpose**: Primary interface for bot communication
- **Integration**: Webhook-based message processing
- **Features**: Message handling, inline keyboards, callback queries

## Flipkart Data Sources
- **Primary**: Real-time website scraping for authentic product data, images, and pricing
- **Secondary**: Flipkart Affiliate API (requires affiliate ID and token)
- **Fallback**: High-quality sample data for demonstration purposes
- **Product Images**: Original Flipkart CDN images (25+ authentic product photos)
- **Categories**: Smart categorization (Mobile, Laptop, Electronics, Fashion, Books, etc.)

## Deployment Platform
- **Multi-Platform Support**: Replit, Docker, standalone Node.js deployment
- **Web Dashboard**: Real-time status monitoring at port 5000 with live system metrics
- **Docker Ready**: Complete Dockerfile with health checks and optimization
- **Webhook Support**: Production-ready webhook configuration for 24/7 operation
- **Health Monitoring**: Multiple endpoints (/health, /bot-status, /) for comprehensive monitoring
- **Environment Configuration**: Automatic detection and flexible setup for any deployment environment