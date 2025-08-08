const config = require('../config/config');

class Logger {
    constructor() {
        this.enableLogging = config.ENABLE_LOGGING;
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
    }

    info(message, ...args) {
        if (this.enableLogging) {
            console.log(this.formatMessage('info', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this.enableLogging) {
            console.warn(this.formatMessage('warn', message, ...args));
        }
    }

    error(message, ...args) {
        if (this.enableLogging) {
            console.error(this.formatMessage('error', message, ...args));
        }
    }

    debug(message, ...args) {
        if (this.enableLogging && process.env.DEBUG) {
            console.debug(this.formatMessage('debug', message, ...args));
        }
    }
}

module.exports = new Logger();
