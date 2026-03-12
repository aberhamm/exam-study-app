deploy:
	./prod-server.sh deploy

start:
	./prod-server.sh start

stop:
	./prod-server.sh stop

logs:
	docker compose logs -f app

.PHONY: deploy start stop logs
