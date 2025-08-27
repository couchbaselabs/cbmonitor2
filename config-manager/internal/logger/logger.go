package logger

import (
	"log/slog"
	"os"
	"strings"
)

var globalLogger *slog.Logger

// InitLogger initializes the global logger with the specified log level
func InitLogger(level string) {
	var logLevel slog.Level

	switch strings.ToLower(level) {
	case "debug":
		logLevel = slog.LevelDebug
	case "info":
		logLevel = slog.LevelInfo
	case "warn", "warning":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}

	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	})
	globalLogger = slog.New(handler)

	// Set as default logger
	slog.SetDefault(globalLogger)
}

// GetLogger returns the global logger instance
func GetLogger() *slog.Logger {
	if globalLogger == nil {
		// Fallback to default if not initialized
		InitLogger("info")
	}
	return globalLogger
}

// Debug logs a debug message
func Debug(msg string, args ...any) {
	GetLogger().Debug(msg, args...)
}

// Info logs an info message
func Info(msg string, args ...any) {
	GetLogger().Info(msg, args...)
}

// Warn logs a warning message
func Warn(msg string, args ...any) {
	GetLogger().Warn(msg, args...)
}

// Error logs an error message
func Error(msg string, args ...any) {
	GetLogger().Error(msg, args...)
}

// With returns a logger with the given attributes
func With(args ...any) *slog.Logger {
	return GetLogger().With(args...)
}
