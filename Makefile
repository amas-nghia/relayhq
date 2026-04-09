.PHONY: backend-dev backend-test frontend-dev frontend-build

backend-dev:
	cd backend && go run ./cmd/relayhq-api

backend-test:
	cd backend && go test ./...

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
