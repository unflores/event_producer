import _ from 'lodash';
import amqplib from 'amqplib';
import logger from 'chpr-logger';
import { ObjectID } from 'mongodb';
import { EVENTS, ERRORS } from './events'
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

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events';

const SPECIAL_ACTORS = {
  'Hubert Sacrin': {
    events: {
      rider_signed_up: {
        probability: 0.5
      },
      ride_created: {
        probability: 0.5
      },
      ride_completed: {
        probability: 0.5
      }
    }
  },
  'Hubert Cestnul': {
    events: {
      rider_signed_up: {
        probability: 0.5
      },
      ride_created: {
        probability: 0.5
      },
      ride_completed: {
        probability: 0.5
      }
    }
  },
  'Marcel Bofbof': {
    events: {
      rider_signed_up: {
        probability: 0.5
      },
      ride_created: {
        probability: 0.5
      },
      ride_completed: {
        probability: 0.5
      }
    }
  }
};

/**
 * AMQP client for messages publication
 */
let client;

/**
 * Full list of actors
 */
const actors = new Map();

/**
 * Publish message with possible error applied
 *
 * @param {Object} message AMQP message
 * @param {String} message.type message type from EVENTS
 * @param {Object} message.payload message content
 */
async function publish(message) {
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
    message = Object.assign(
      {},
      { type: message.type },
      { payload: { [keptKey]: message.payload[keptKey] } }
    );
  }

  if (errors.wrong_value) {
    // Apply wrong value to payload id
    message.payload.id = "undefined";
  }
  logger.info({
    exchange: EXCHANGE,
    routing_key: EVENTS[message.type].routing_key,
    message
  }, 'Message publications');

  client.channel.publish(
    EXCHANGE,
    EVENTS[message.type].routing_key,
    new Buffer(JSON.stringify(message)), {
    persistent: false,
    expiration: 10000 // ms
  });
}

/**
 * A actor signed up
 *
 * @param {string} name actor name
 */
function actorSignup(name) {
  const actor = {
    id: ObjectID(),
    name: name || "John Doe"
  };

  actors.set(actor.id, actor);

  // Message publication...
  return {
    type: 'rider_signed_up',
    payload: actor
  }
}

/**
 * A actor updated his phone number
 *
 * @param {Object} actor
 */
function actorPhoneUpdate(actor) {
  // Message publication...
  return {
    type: 'rider_updated_phone_number',
    payload: {
      ..._.pick(actor, 'id'),
      phone_number: `+336${Math.random().toString().slice(2, 11)}`
    }
  }
}

/**
 * A actor ordered a ride
 *
 * @param {Object} actor
 */
function actorRideCreate(actor) {
  const ride = {
    id: ObjectID(),
    amount: 3 + Math.floor(Math.random() * 30 * 100) / 100,
    rider_id: actor.id
  };

  // Attach the ride id to the actor for completed or canceled
  actors.set(actor.id, {
    ...actor,
    ride_id: ride.id
  });
  logger.info("yo what'sup")

  // Message publication...
  return {
    type: 'ride_created',
    payload: ride
  };
}

/**
 * A actor completed a ride
 *
 * @param {Object} actor
 */
function actorRideCompleted(actor) {
  const ride = {
    id: actor.ride_id || ObjectID(),
    amount: 3 + Math.floor(Math.random() * 30 * 100) / 100,
    rider_id: actor.id
  };

  // Message publication...
  return {
    type: 'ride_completed',
    payload: ride
  };
}

/**
 * Rider actions to be taken each tic
 *
 * @param {Object} actor
 */
async function actorActions(actor) {
  const probabilities = Object.assign({}, EVENTS, _.get(SPECIAL_ACTORS, `${actor.name}.events`, {}));

  if (Math.random() < probabilities.rider_updated_phone_number.probability) {
    await publish(actorPhoneUpdate(actor));
  }

  if (Math.random() < probabilities.ride_created.probability) {
    logger.info({ event: actorRideCreate(actor) })
    await publish(actorRideCreate(actor));
  }

  if (Math.random() < probabilities.ride_completed.probability) {
    await publish(actorRideCompleted(actor));
  }
}

/**
 * Global test tic method
 *
 * @param {Number} n number of actors
 */
async function tic(n) {
  logger.debug('tic');

  // if our iteration larger then the total actors
  // then we can have a signup event
  if (n > actors.size && Math.random() < EVENTS.rider_signed_up.probability) {
    actorSignup();
  }

  // Special actors creation
  // Every iteration we can have a special actor sign up
  for (const name in SPECIAL_ACTORS) {
    if (Math.random() < SPECIAL_ACTORS[name].events.rider_signed_up.probability) {
      actorSignup(name);

      // Unique special actor creation:
      SPECIAL_ACTORS[name].events.rider_signed_up.probability = 0;
    }
  }

  // For every iteration our actors to run their events
  const tics = [];
  actors.forEach(actor => tics.push(actorActions(actor)));
  logger.info({ tics_length: tics.length }, 'Riders tic length');
  logger.info({ tics: tics.length }, 'Number of actors tics');
  await Promise.all(tics);
}

/**
 * Initialize the AMQP connection and setup
 *
 * @returns {void}
 */
async function init() {
  logger.info('> RabbitMQ initialization');
  client = await amqplib.connect(AMQP_URL);
  client.channel = await client.createChannel();
  await client.channel.assertExchange(EXCHANGE, 'topic', {
    durable: true
  });
}

/**
 * Main function of the script
 * @param {number} [n=10] Number of actors to start
 * @param {number} [interval=1000] Time interval (ms) before increasing the messages rate
 */
async function main(n = 10, interval = 1000) {

  await init();

  while (true) {
    await Promise.all([
      tic(n),
      new Promise(resolve => setTimeout(resolve, interval))
    ]);
  }
}

main(process.env.N, process.env.TIC)
  .then(() => {
    logger.info('> Worker stopped');
    process.exit(0);
  }).catch(err => {
    logger.error({
      err
    }, '! Worker stopped unexpectedly');
    process.exit(1);
  });
