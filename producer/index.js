const _ = require('lodash');
const amqplib = require('amqplib');
const logger = require('chpr-logger');
const { ObjectID } = require('mongodb');

/**
 * Several events are produced:
 * - rider signup
 * - rider phone update
 * - ride created
 * - ride completed
 *
 * Errors production:
 * - some events are sent twice
 * - some events are sent with wrong schema
 * - some events are sent with wrong value (ride amount = -2 €)
 * - some events are in the wrong order (ride create before rider signup)
 *
 * Special riders exist and send more events than others: these riders are the
 * keys of the test.
 */

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events';
const EVENTS = {
  rider_signed_up: {
    routing_key: 'rider.signup',
    probability: 0.3
  },
  rider_updated_phone_number: {
    routing_key: 'rider.phone_update',
    probability: 0.05
  },
  ride_created: {
    routing_key: 'ride.create',
    probability: 0.2
  },
  ride_completed: {
    routing_key: 'ride.completed',
    probability: 0.2
  }
};
const ERRORS = {
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
const SPECIAL_RIDERS = {
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
 * Full list of riders
 */
const riders = new Map();

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
 * Publish message with possible error applied
 *
 * @param {Object} message AMQP message
 * @param {String} message.type message type from EVENTS
 * @param {Object} message.payload message content
 */
async function publish(message) {
  const errors = _.mapValues(ERRORS, (error, key) => Math.random() < error.probability);
  logger.debug({ errors }, 'Message publication applied errors');
  if (errors.multiple_publication) {
    await publish(message);
  }

  if (errors.missing_publication) {
    // Skipped
    return;
  }

  if (errors.wrong_schema) {
    // Apply wrong schema (keep only one random value from message payload)
    message = Object.assign(
      {},
      { type: message.type },
      { payload: _.sample(message.payload) }
    );
  }

  if (errors.wrong_value) {
    // Apply wrong value to an always-present value
    message.payload.id = "undefined";
  }

  logger.debug({
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
 * A rider signed up
 *
 * @param {string} name rider name
 */
async function riderSignup(name) {
  const rider = {
    id: ObjectID(),
    name: name || "John Doe"
  };

  riders.set(rider.id, rider);

  // Message publication...
  await publish({
    type: 'rider_signed_up',
    payload: rider
  });
}

/**
 * A rider updated his phone number
 *
 * @param {Object} rider
 */
async function riderPhoneUpdate(rider) {
  // Message publication...
  await publish({
    type: 'rider_updated_phone_number',
    payload: {
      ..._.pick(rider, 'id'),
      phone_number: `+336${Math.random().toString().slice(2,11)}`
    }
  });
}

/**
 * A rider ordered a ride
 *
 * @param {Object} rider
 */
async function riderRideCreate(rider) {
  const ride = {
    id: ObjectID(),
    amount: 3 + Math.floor(Math.random() * 30 * 100) / 100,
    rider_id: rider.id
  };

  // Attach the ride id to the rider for completed or canceled
  riders.set(rider.id, {
    ...rider,
    ride_id: ride.id
  });

  // Message publication...
  await publish({
    type: 'ride_created',
    payload: ride
  });
}

/**
 * A rider completed a ride
 *
 * @param {Object} rider
 */
async function riderRideCompleted(rider) {
  const ride = {
    id: rider.ride_id || ObjectID(),
    amount: 3 + Math.floor(Math.random() * 30 * 100) / 100,
    rider_id: rider.id
  };

  // Message publication...
  await publish({
    type: 'ride_completed',
    payload: ride
  });
}

/**
 * Rider lifecycle tic method
 *
 * @param {Object} rider
 */
async function riderTic(rider) {
  const probabilities = Object.assign({}, EVENTS, _.get(SPECIAL_RIDERS, `${rider.name}.events`, {}));

  if (Math.random() < probabilities.rider_updated_phone_number.probability) {
    riderPhoneUpdate(rider);
  }

  if (Math.random() < probabilities.ride_created.probability) {
    riderRideCreate(rider);
  }

  if (Math.random() < probabilities.ride_completed.probability) {
    riderRideCompleted(rider);
  }
}

/**
 * Global test tic method
 *
 * @param {Number} n number of riders
 */
async function tic(n) {
  logger.debug('tic');
  if (n > riders.size && Math.random() < EVENTS.rider_signed_up.probability) {
    riderSignup();
  }

  // Special riders creation
  for (const name in SPECIAL_RIDERS) {
    if (Math.random() < SPECIAL_RIDERS[name].events.rider_signed_up.probability) {
      riderSignup(name);

      // Unique special rider creation:
      SPECIAL_RIDERS[name].events.rider_signed_up.probability = 0;
    }
  }

  const tics = [];
  riders.forEach(rider => tics.push(riderTic(rider)));
  logger.debug({ tics_length: tics.length }, 'Riders tic length');
  logger.info({ tics: tics.length }, 'Number of riders tics');
  await Promise.all(tics);
}

/**
 * Main function of the script
 * @param {number} [n=10] Number of riders to start
 * @param {number} [interval=1000] Time interval (ms) before increasing the messages rate
 */
async function main(n = 10, interval = 1000) {
  logger.info('> Riders initialization...');
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
