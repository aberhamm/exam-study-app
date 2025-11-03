/**
 * Portkey-aware OpenAI client
 *
 * This client routes OpenAI SDK calls through Portkey's AI Gateway,
 * enabling observability, fallback/routing, caching, and other Portkey features.
 * Uses Portkey SDK helpers for proper integration.
 *
 * Model Catalog mode: No virtual keys. Use PORTKEY_API_KEY for auth and
 * pass provider/model via the model string (e.g., "@openai-prod/gpt-4o").
 */

import OpenAI from 'openai';
import { createHeaders } from 'portkey-ai';
import { envConfig, buildPortkeyCustomHeaders } from '@/lib/env-config';

/**
 * Creates a Portkey-aware OpenAI client
 *
 * When feature flag is enabled, this client routes requests through Portkey.
 *
 * Portkey API key (PORTKEY_API_KEY) is required for authentication.
 *
 * Supports custom headers for enterprise/custom Portkey gateways via
 * PORTKEY_CUSTOM_HEADERS environment variable (format: key1:value1\nkey2:value2)
 *
 * Uses Portkey's recommended integration pattern with PORTKEY_GATEWAY_URL
 * and createHeaders helper for proper header configuration.
 */
export function portkeyClient(): OpenAI {
  const config = envConfig.portkey;

  if (!config.apiKey) {
    throw new Error(
      'Portkey API key is required. Set PORTKEY_API_KEY environment variable.'
    );
  }

  // Parse custom headers if provided (format: "key1:value1\nkey2:value2")
  const customHeaders = buildPortkeyCustomHeaders({
    headerString: config.customHeaders,
    provider: config.provider,
    apiKey: config.apiKey,
  });

  const client = new OpenAI({
    // No provider key here; Portkey authenticates via default headers
    // Point the SDK to Portkey Gateway instead of api.openai.com
    baseURL: config.baseUrl,
    // Use Portkey SDK helper to create proper headers, then merge custom headers
    defaultHeaders: {
      ...createHeaders({
        apiKey: config.apiKey, // Portkey API key for authentication
      }),
      ...customHeaders, // Custom headers for enterprise gateways (e.g., x-portkey-provider)
    },
  });

  return client;
}
