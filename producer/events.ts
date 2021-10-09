import { ObjectId } from 'mongodb';
import _ from 'lodash';

type Events = {
  [index: string]: {
    routing_key: string
    probability: number
  }
}

export type Actor = {
  id: number,
  ride_id: number | undefined,
  name: string
}

export type Event = {
  type: any,
  payload: any
}

export const EVENTS: Events = {
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

export const SPECIAL_ACTORS = {
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
 * A actor updated his phone number
 *
 */
function phoneUpdateEvent(actor: Actor): Event {
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
function rideCreateEvent(actor: Actor): Event {
  const ride = {
    id: new ObjectId(),
    amount: 3 + Math.floor(Math.random() * 30 * 100) / 100,
    rider_id: actor.id
  };

  // Attach the ride id to the actor for completed or canceled
  actors.set(actor.id, {
    ...actor,
    ride_id: ride.id
  });

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
function rideCompletedEvent(actor: Actor): Event {
  const ride = {
    id: actor.ride_id || new ObjectId(),
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
 * A actor signed up
 *
 * @param {string} name actor name
 */
function actorCreateEvent(name: string | null = null): Event {
  const actor = {
    id: new ObjectId(),
    name: name || "John Doe"
  };

  actors.set(actor.id, actor);

  // Message publication...
  return {
    type: 'rider_signed_up',
    payload: actor
  }
}

export function actorCreateEvents(maxActors: number): Array<Event> {

  const events: Array<Event> = []
  // if our iteration larger then the total actors
  // then we can have a signup event
  if (actors.size < maxActors && Math.random() < EVENTS.rider_signed_up.probability) {
    events.push(actorCreateEvent());
  }

  // Special actors creation
  // Every iteration we can have a special actor sign up
  for (const name in SPECIAL_ACTORS) {
    if (Math.random() < SPECIAL_ACTORS[name].events.rider_signed_up.probability) {
      events.push(actorCreateEvent(name));

      // Unique special actor creation:
      SPECIAL_ACTORS[name].events.rider_signed_up.probability = 0;
    }
  }
}

/**
 * Rider actions to be taken each tic
 *
 * @param {Object} actor
 */
export function actorEvents(actor: Actor) {
  const probabilities = Object.assign({}, EVENTS, _.get(SPECIAL_ACTORS, `${actor.name}.events`, {}));
  const events: Array<Event> = []

  if (Math.random() < probabilities.rider_updated_phone_number.probability) {
    events.push(phoneUpdateEvent(actor));
  }

  if (Math.random() < probabilities.ride_created.probability) {
    logger.info({ event: rideCreateEvent(actor) })
    events.push(rideCreateEvent(actor));
  }

  if (Math.random() < probabilities.ride_completed.probability) {
    events.push(rideCompletedEvent(actor));
  }

  return events;
}

