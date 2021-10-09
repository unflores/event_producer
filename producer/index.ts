import _ from 'lodash';

import logger from 'chpr-logger';
import { ObjectId } from 'mongodb';
import {
  EVENTS,
  Actor,
  actorEvents,
  actorCreateEvents
} from './events'
import { initClient, AmqpClient } from './clients/amqpClient';

/**
 * Several events are produced:
 * - actor signup
 * - actor phone update
 * - ride created
 * - ride completed
 *
 * Errors production:
 * - some events are sent twice
 * - some events are sent with wrong schema
 * - some events are sent with wrong value (ride amount = -2 €)
 * - some events are in the wrong order (ride create before actor signup)
 *
 * Special actors exist and send more events than others: these actors are the
 * keys of the test.
 */


let client: AmqpClient


/**
 * Full list of actors
 */
const actors = new Map<number, Actor>();

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
    routing_key: EVENTS[message.type].routing_key,
    message
  }, 'Message publications');

  client.publish(
    EVENTS[message.type].routing_key,
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
 * @param {Number} n number of actors
 */
async function tic(maxActors: number) {
  logger.debug('tic');
  // For every iteration our actors to run their events
  const tics: Array<Promise<void>> = [];

  const events = actorCreateEvents(maxActors)
  events.forEach(event => tics.push(publish(event)))

  actors.forEach(actor => {
    actorEvents(actor).map((event) => tics.push(publish(event)))
  })
  logger.info({ tics_length: tics.length }, 'Riders tic length');
  logger.info({ tics: tics.length }, 'Number of actors tics');
  await Promise.all(tics);
}
const totalRiders = process.env.N as unknown as number
const ticIntervalInMilliseconds = process.env.TIC as unknown as number

/**
 * Main function of the script
 * @param {number} [n=10] Number of actors to start
 * @param {number} [interval=1000] Time interval (ms) before increasing the messages rate
 */
async function main(numberOfActors = 10, interval = 1000) {
  client = await initClient({})

  while (true) {
    await Promise.all([
      tic(numberOfActors),
      new Promise(resolve => setTimeout(resolve, interval))
    ]);
  }
}

main(totalRiders, ticIntervalInMilliseconds)
  .then(() => {
    logger.info('> Worker stopped');
    process.exit(0);
  }).catch(err => {
    logger.error({
      err
    }, '! Worker stopped unexpectedly');
    process.exit(1);
  });
