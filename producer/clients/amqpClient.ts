import amqplib from 'amqplib';
import logger from 'chpr-logger';

type Options = {
  amqpUrl?: string,
  exchange?: string
}

export const initClient = async ({ amqpUrl, exchange }: Options) => {
  amqpUrl = (amqpUrl || process.env.AMQP_URL) as string
  exchange = (exchange || process.env.EXCHANGE) as string

  logger.info('> RabbitMQ initialization');
  logger.info(`exchange: ${exchange}, url: ${amqpUrl}`);

  const client = await amqplib.connect(amqpUrl);
  const channel = await client.createChannel();
  await channel.assertExchange(exchange, 'topic', {
    durable: true
  });
  return new AmqpClient(exchange, channel)
}

// interface Client extends EventEmitter extends IClient {
//   name: ClientName;
//   subscribeTicker(market: Market): void;
// }

// // https://github.com/altangent/ccxws/blob/master/src/BasicClient.ts
// // eslint-disable-next-line no-redeclare
// export interface BasicClient implements BasicClient {
//   new(): Client;
//   on: Client['on'];
// }

type Message = {
  [index: string]: any
}

export class AmqpClient {

  /**
   * AMQP client for messages publication
   */
  private channel: amqplib.Channel;
  private exchange: string;
  static readonly expirationInMilliseconds = 10000;

  constructor(
    exchange: string,
    channel: amqplib.Channel
  ) {
    this.exchange = exchange
    this.channel = channel
  }

  publish(routingKey: string, message: Message) {
    this.channel.publish(
      this.exchange,
      routingKey,
      new Buffer(JSON.stringify(message)), {
      persistent: false,
      expiration: AmqpClient.expirationInMilliseconds
    })
  }
}
