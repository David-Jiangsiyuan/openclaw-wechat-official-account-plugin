/**
 * OpenClaw 微信公众号插件 - 日志工具
 * 
 * 使用winston进行结构化日志输出
 */

import winston from "winston";
import path from "path";

// 日志级别
export type LogLevel = "error" | "warn" | "info" | "debug" | "verbose";

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // 综合日志文件
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// 导出logger
export { logger };

// 便捷方法
export function logInfo(message: string, meta?: any): void {
  logger.info(message, meta);
}

export function logWarn(message: string, meta?: any): void {
  logger.warn(message, meta);
}

export function logError(message: string, meta?: any): void {
  logger.error(message, meta);
}

export function logDebug(message: string, meta?: any): void {
  logger.debug(message, meta);
}

export default logger;
