import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { log } from '../utils/logger.js';

const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
const KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true';

// Initialize Kafka client
const kafka = KAFKA_ENABLED ? new Kafka({
  clientId: 'ems-backend',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
  },
  requestTimeout: 30000,
  connectionTimeout: 3000,
}) : null;

let producer: Producer | null = null;
let consumer: Consumer | null = null;

/**
 * Initialize Kafka producer
 */
export async function initializeKafkaProducer(): Promise<void> {
  if (!kafka || !KAFKA_ENABLED) {
    log.info('Kafka is disabled');
    return;
  }

  try {
    producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      allowAutoTopicCreation: true,
    });

    await producer.connect();
    log.info('Kafka producer connected');
  } catch (error) {
    log.error('Failed to connect Kafka producer:', error);
    throw error;
  }
}

/**
 * Initialize Kafka consumer
 */
export async function initializeKafkaConsumer(
  groupId: string,
  topics: string[],
  messageHandler: (payload: EachMessagePayload) => Promise<void>
): Promise<void> {
  if (!kafka || !KAFKA_ENABLED) {
    log.info('Kafka is disabled');
    return;
  }

  try {
    consumer = kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 10485760, // 10MB
      minBytes: 1,
      maxBytes: 10485760,
      maxWaitTimeInMs: 5000,
    });

    await consumer.connect();
    log.info('Kafka consumer connected');

    // Subscribe to topics
    await consumer.subscribe({ topics, fromBeginning: false });

    // Start consuming
    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await messageHandler(payload);
        } catch (error) {
          log.error('Error processing Kafka message:', error);
          // Don't throw - continue processing other messages
        }
      },
    });

    log.info(`Kafka consumer started for topics: ${topics.join(', ')}`);
  } catch (error) {
    log.error('Failed to initialize Kafka consumer:', error);
    throw error;
  }
}

/**
 * Send data point to Kafka topic
 */
export async function sendDataPoint(
  deviceId: string,
  dataPoint: Record<string, any>
): Promise<void> {
  if (!producer || !KAFKA_ENABLED) {
    return;
  }

  try {
    const topic = `device-data-${deviceId}`;
    const message = {
      deviceId,
      timestamp: new Date().toISOString(),
      ...dataPoint,
    };

    await producer.send({
      topic,
      messages: [
        {
          key: deviceId,
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
      acks: 1, // Wait for leader acknowledgment
    });
  } catch (error) {
    log.error(`Failed to send data point to Kafka for device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Send batch of data points to Kafka
 */
export async function sendDataPointsBatch(
  deviceId: string,
  dataPoints: Record<string, any>[]
): Promise<void> {
  if (!producer || !KAFKA_ENABLED || dataPoints.length === 0) {
    return;
  }

  try {
    const topic = `device-data-${deviceId}`;
    const messages = dataPoints.map((dataPoint) => ({
      key: deviceId,
      value: JSON.stringify({
        deviceId,
        timestamp: new Date().toISOString(),
        ...dataPoint,
      }),
      timestamp: Date.now().toString(),
    }));

    await producer.send({
      topic,
      messages,
      acks: 1,
    });
  } catch (error) {
    log.error(`Failed to send batch to Kafka for device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Disconnect Kafka producer
 */
export async function disconnectKafkaProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    log.info('Kafka producer disconnected');
  }
}

/**
 * Disconnect Kafka consumer
 */
export async function disconnectKafkaConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    log.info('Kafka consumer disconnected');
  }
}

/**
 * Check if Kafka is enabled
 */
export function isKafkaEnabled(): boolean {
  return KAFKA_ENABLED && kafka !== null;
}

