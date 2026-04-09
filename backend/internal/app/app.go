package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/amas-nghia/relayhq/backend/internal/httpapi"
)

type Config struct {
	Addr string
}

type App struct {
	server *http.Server
}

func New(cfg Config) *App {
	mux := httpapi.NewRouter()

	return &App{
		server: &http.Server{
			Addr:              cfg.Addr,
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
}

func (a *App) Run(ctx context.Context) error {
	errCh := make(chan error, 1)

	go func() {
		errCh <- a.server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := a.server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown http server: %w", err)
		}

		return ctx.Err()
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}
}
