FROM node:14.15.1-alpine3.10

RUN apk update && apk add --no-cache bash \
    bash-completion \
    build-base \
    python

ENV APP_HOME /var/www

# working dir
WORKDIR $APP_HOME
# hook up source
ADD . $APP_HOME

RUN npm install --production

CMD tail -f /dev/null
