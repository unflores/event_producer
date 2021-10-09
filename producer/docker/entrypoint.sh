#!/bin/sh
if [ -f tmp/pids/server.pid ]; then
  rm tmp/pids/server.pid
fi

# make an infinite process so we can enter containers
tail -f /dev/null
