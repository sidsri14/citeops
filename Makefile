.PHONY: run stop test

run:
	docker compose -f track_2b/docker-compose.yml up --build

stop:
	docker compose -f track_2b/docker-compose.yml down

test:
	cd track_2b && npm test
