.PHONY: backend-dev backend-cli backend-test frontend-dev frontend-build

backend-dev:
	cd backend && go run ./cmd/relayhq-api

backend-cli:
	cd backend && go run ./cmd/relayhq

backend-test:
	cd backend && go test ./...

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
