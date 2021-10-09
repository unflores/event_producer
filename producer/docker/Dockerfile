FROM node:14.15.1-alpine3.10

RUN apk update && apk add --no-cache bash \
    bash-completion \
    build-base \
    python

ENV NODE_OPTIONS --max_old_space_size=4096
ENV LANG C.UTF-8

ENV APP_HOME /var/www

# working dir
WORKDIR $APP_HOME
# hook up source
ADD . $APP_HOME
ENV PATH $APP_HOME/bin:$PATH

RUN npm install --production

RUN touch /root/.bashrc
RUN echo "PS1='\u@\h:\w\$ '" >> /root/.bashrc

# webpack is greedy
RUN echo "fs.inotify.max_user_watches = 999999" >> /etc/sysctl.conf
RUN echo "fs.inotify.max_queued_events = 999999" >> /etc/sysctl.conf
RUN echo "fs.inotify.max_user_instances = 999999" >> /etc/sysctl.conf

