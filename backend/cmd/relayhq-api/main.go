package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/amas-nghia/relayhq/backend/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := app.Config{Addr: envOrDefault("RELAYHQ_ADDR", ":8081")}
	server := app.New(cfg)

	if err := server.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Fatalf("relayhq api exited: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
