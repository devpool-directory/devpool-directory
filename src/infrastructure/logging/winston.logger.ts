import winston from 'winston';
import { injectable } from 'inversify';
import path from 'path';
import fs from 'fs';

export interface LoggerConfig {
  level: string;
  format: 'json' | 'pretty';
  outputPath?: string;
}

@injectable()
export class WinstonLogger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig = { level: 'info', format: 'json' }) {
    this.logger = this.createLogger(config);
  }

  private createLogger(config: LoggerConfig): winston.Logger {
    const formats: winston.Logform.Format[] = [
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ];

    if (config.format === 'pretty') {
      formats.push(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      );
    } else {
      formats.push(winston.format.json());
    }

    const transports: winston.transport[] = [
      new winston.transports.Console()
    ];

    if (config.outputPath) {
      const logDir = path.dirname(config.outputPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      transports.push(
        new winston.transports.File({
          filename: config.outputPath,
          maxsize: 10485760,
          maxFiles: 5
        })
      );

      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 10485760,
          maxFiles: 5
        })
      );
    }

    return winston.createLogger({
      level: config.level,
      format: winston.format.combine(...formats),
      transports,
      exitOnError: false
    });
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }

  silly(message: string, meta?: any): void {
    this.logger.silly(message, meta);
  }

  profile(id: string, meta?: any): void {
    this.logger.profile(id, meta);
  }

  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.logger.info('Timer', { duration });
    };
  }

  child(meta: any): WinstonLogger {
    const childLogger = new WinstonLogger({ level: 'info', format: 'json' });
    childLogger.logger = this.logger.child(meta);
    return childLogger;
  }

  setLevel(level: string): void {
    this.logger.level = level;
  }

  getLogger(): winston.Logger {
    return this.logger;
  }
}