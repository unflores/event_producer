import _ from 'lodash';

import logger from 'chpr-logger';
import { ObjectId } from 'mongodb';
import * as simulator from './events'
import { initClient, AmqpClient } from './clients/amqpClient';

let client: AmqpClient

type Message = {
  type: string
  payload: {
    [index: string]: string | number | ObjectId
  }
}

/**
 * Publish message with possible error applied
 *
 * @param {Object} message AMQP message
 * @param {String} message.type message type from EVENTS
 * @param {Object} message.payload message content
 */
async function publish(message: Message) {
  const errors = _.mapValues(ERRORS, (error, _key) => Math.random() < error.probability);
  logger.info({ errors }, 'Message publication applied errors');
  if (errors.multiple_publication) {
    await publish(message);
  }

  if (errors.missing_publication) {
    // Skipped
    return;
  }

  if (errors.wrong_schema) {
    // Remove all but one key
    const keptKey = _.sample(Object.keys(message.payload))

    if (typeof keptKey === 'string') {
      message = Object.assign(
        {},
        { type: message.type },
        { payload: { [keptKey]: message.payload[keptKey] } }
      );
    }
  }

  if (errors.wrong_value) {
    // Apply wrong value to payload id
    message.payload.id = "undefined";
  }

  logger.info({
    routing_key: simulator.EVENTS[message.type].routing_key,
    message
  }, 'Message publications');

  client.publish(
    simulator.EVENTS[message.type].routing_key,
    message
  );
}
type Errors = {
  [index: string]: {
    probability: number
  }
}

export const ERRORS: Errors = {
  wrong_schema: {
    probability: 0.05
  },
  wrong_value: {
    probability: 0.05
  },
  missing_publication: {
    probability: 0.05
  },
  multiple_publication: {
    probability: 0.1
  }
};

/**
 * Global test tic method
 *
 * @param {Number} n max number of actors
 */
async function tic(maxActors: number) {
  logger.debug('tic');
  // For every iteration our actors to run their events
  const tics: Array<Promise<void>> = [];

  const events = simulator.buildActorCreateEvents(maxActors)
  events.forEach(event => tics.push(publish(event)))

  const actorEvents = simulator.buildActorEvents();
  actorEvents.forEach(event => tics.push(publish(event)))

  logger.info({ tics_length: tics.length }, 'Riders tic length');
  logger.info({ tics: tics.length }, 'Number of actors tics');
  await Promise.all(tics);
}
const maximumActors = process.env.MAXIMUM_ACTORS as unknown as number
const ticIntervalInMilliseconds = process.env.INTERVAL_TIME_IN_MS as unknown as number

/**
 * Main function of the script
 * @param {number} [maximumActors] Number of actors to start
 * @param {number} [intervalInMilliseconds] Time interval (ms) before increasing the messages rate
 */
async function main(maximumActors: number, intervalInMilliseconds: number) {
  client = await initClient({})

  while (true) {
    await Promise.all([
      tic(maximumActors),
      new Promise(resolve => setTimeout(resolve, intervalInMilliseconds))
    ]);
  }
}

main(maximumActors, ticIntervalInMilliseconds)
  .then(() => {
    logger.info('> Worker stopped');
    process.exit(0);
  }).catch(err => {
    logger.error({
      err
    }, '! Worker stopped unexpectedly');
    process.exit(1);
  });
