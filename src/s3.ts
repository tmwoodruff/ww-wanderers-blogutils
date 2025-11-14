import { S3Client, S3ClientConfig, ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { Config, getConfig } from "./config";

let cachedClient: S3Client | null = null;
let cachedConfig: Config | null = null;


export class S3Error extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "S3Error";
  }

  static isAuthError(error: any): boolean {
    return (
      error?.code === "Forbidden" ||
      error?.code === "Unauthorized" ||
      error?.$metadata?.httpStatusCode === 403 ||
      error?.$metadata?.httpStatusCode === 401
    );
  }

  static isRetryable(error: any): boolean {
    return (
      error?.code === "TooManyRequests" ||
      error?.$metadata?.httpStatusCode === 429 ||
      (error?.$metadata?.httpStatusCode >= 500 &&
        error?.$metadata?.httpStatusCode < 600)
    );
  }
}

export function getS3Client(forceNew = false): S3Client {
  const currentConfig = getConfig();

  // Return cached client if config hasn't changed
  if (
    !forceNew &&
    cachedClient &&
    cachedConfig &&
    configsEqual(currentConfig, cachedConfig)
  ) {
    return cachedClient;
  }

  // Create new client
  const clientConfig: S3ClientConfig = {
    region: currentConfig.region,
    forcePathStyle: currentConfig.forcePathStyle,
    // Configure for better R2 compatibility
    maxAttempts: 3,
    requestHandler: {
      requestTimeout: 30000, // 30 seconds
      connectionTimeout: 5000, // 5 seconds
    },
  };

  if (currentConfig.s3EndpointUrl) {
    clientConfig.endpoint = currentConfig.s3EndpointUrl;
  }

  if (currentConfig.accessKeyId && currentConfig.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: currentConfig.accessKeyId,
      secretAccessKey: currentConfig.secretAccessKey,
    };
  }

  clearClientCache();
  cachedClient = new S3Client(clientConfig);
  cachedConfig = { ...currentConfig };

  return cachedClient;
}

function configsEqual(a: Config, b: Config): boolean {
  return (
    a.s3EndpointUrl === b.s3EndpointUrl &&
    a.region === b.region &&
    a.accessKeyId === b.accessKeyId &&
    a.secretAccessKey === b.secretAccessKey &&
    a.forcePathStyle === b.forcePathStyle
  );
}

function getCachedConfig(): Config {
  if (!cachedConfig) {
    throw new Error("Config is unexpectely null");
  }
  return cachedConfig;
}

export function clearClientCache(): void {
  if (cachedClient) {
    cachedClient.destroy();
    cachedClient = null;
    cachedConfig = null;
  }
}

export async function testConnection(): Promise<void> {
  const client = getS3Client();
  const config = getCachedConfig();

  try {
    await listKeys(config.imagesBucket, config.imagesPrefix, 10);
  } catch (error: any) {
    if (S3Error.isAuthError(error)) {
      throw new S3Error(
        "Authentication failed. Please check your access credentials.",
        error.code,
        error.$metadata?.httpStatusCode,
        false
      );
    }

    if (error.code === "NetworkingError" || error.code === "ENOTFOUND") {
      throw new S3Error(
        `Cannot connect to endpoint: ${config.s3EndpointUrl
        }. Please verify the URL is correct.`,
        error.code,
        undefined,
        true
      );
    }

    throw new S3Error(
      `Connection test failed: ${error.message}`,
      error.code,
      error.$metadata?.httpStatusCode,
      S3Error.isRetryable(error)
    );
  }
}

export async function listKeys(bucket: string, prefix: string, maxKeys: number) {
  const client = getS3Client();
  const config = getCachedConfig();
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const remainingKeys = Math.max(maxKeys - keys.length, 0);

    const response: ListObjectsV2CommandOutput = await withRetry(
      () => client.send(new ListObjectsV2Command({
        Bucket: config.imagesBucket,
        Delimiter: "/",
        Prefix: prefix,
        MaxKeys: Math.min(remainingKeys, 1000),
        ContinuationToken: continuationToken
      })));

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          keys.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken && keys.length < maxKeys);

  return keys;
}

export async function listDirectories(bucket: string, prefix: string) {
  const maxDirs = 10000;
  const client = getS3Client();
  const config = getCachedConfig();
  const dirs: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const remainingKeys = Math.max(maxDirs - dirs.length, 0);

    const response: ListObjectsV2CommandOutput = await withRetry(
      () => client.send(new ListObjectsV2Command({
        Bucket: config.imagesBucket,
        Delimiter: "/",
        Prefix: config.imagesPrefix,
        MaxKeys: Math.min(remainingKeys, 1000),
        ContinuationToken: continuationToken
      })));

    if (response.CommonPrefixes) {
      for (const obj of response.CommonPrefixes) {
        if (obj.Prefix) {
          dirs.push(obj.Prefix);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken && dirs.length < maxDirs);

  return dirs;
}


// Utility function to handle retries with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries || !S3Error.isRetryable(error)) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
