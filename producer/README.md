# Producer

Requirements:
- [Docker](https://docs.docker.com/engine/installation/)
- [nvm](https://github.com/creationix/nvm#installation) or node 8.12

## Docker

```bash
docker-compose build
docker-compose up # starts images
docker-compose exec producer yarn # install dependencies
docker-compose exec producer yarn start # starts producing
```
