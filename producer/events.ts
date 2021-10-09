export const EVENTS = {
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

export const ERRORS = {
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
