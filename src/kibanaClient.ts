import axios, { type AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export const APIKEY = process.env.KIBANA_API_KEY as string;
export const BASEURL = process.env.KIBANA_BASE_URL as string;
export const AGENT_ID = 'customer_support_voice_agent';
export const CONNECTOR_ID = 'groq'

// Base event structure
interface BaseSSEEvent<T extends string, D> {
  event: T;
  data: {
    data: D;
  };
}

// Specific event types
export interface ConversationIdSetEvent
  extends BaseSSEEvent<
    'conversation_id_set',
    {
      conversation_id: string;
    }
  > {}

export interface MessageCompleteEvent
  extends BaseSSEEvent<
    'message_complete',
    {
      message_id: string;
      message_content: string;
    }
  > {}

export interface RoundCompleteEvent
  extends BaseSSEEvent<
    'round_complete',
    {
      round: {
        id: string;
        input: {
          message: string;
          attachments: any[];
        };
        steps: any[];
        response: {
          message: string;
        };
      };
    }
  > {}

export interface ConversationCreatedEvent
  extends BaseSSEEvent<
    'conversation_created',
    {
      conversation_id: string;
      title: string;
    }
  > {}

export interface ConversationUpdatedEvent
  extends BaseSSEEvent<
    'conversation_updated',
    {
      conversation_id: string;
      title: string;
    }
  > {}

export interface ReasoningEvent
  extends BaseSSEEvent<
    'reasoning',
    {
      reasoning?: string;
      [key: string]: any;
    }
  > {}

export interface ToolCallEvent
  extends BaseSSEEvent<
    'tool_call',
    {
      tool_call_id: string;
      tool_id: string;
      params: Record<string, any>;
    }
  > {}

export interface ToolProgressEvent
  extends BaseSSEEvent<
    'tool_progress',
    {
      message: string;
      tool_call_id: string;
    }
  > {}

export interface ToolResultEvent
  extends BaseSSEEvent<
    'tool_result',
    {
      tool_call_id: string;
      tool_id: string;
      results: Array<{
        type: string;
        data: any;
        tool_result_id: string;
      }>;
    }
  > {}

export interface ErrorEvent {
  event: 'error';
  data: {
    error: {
      code: string;
      message: string;
    };
  };
}

// Union type of all possible events
export type SSEEvent =
  | ConversationIdSetEvent
  | MessageCompleteEvent
  | RoundCompleteEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolProgressEvent
  | ToolResultEvent
  | ErrorEvent;

export class KibanaClient {
  client: AxiosInstance;
  baseUrl: string;
  apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000, // Increased timeout for streaming
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${apiKey}`,
        'kbn-xsrf': 'true',
      },
    });
  }

  /**
   * Parse Server-Sent Events (SSE) stream format
   */
  private parseSSE(text: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = text.split('\n');

    let currentEvent: { event?: string; data?: any } = {};

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent.event = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        const dataStr = line.substring(6).trim();
        try {
          currentEvent.data = JSON.parse(dataStr);
        } catch {
          currentEvent.data = dataStr;
        }
      } else if (line.trim() === '' && currentEvent.event && currentEvent.data) {
        // Empty line signals end of event
        // Cast to SSEEvent - we trust the API to send correct event types
        events.push(currentEvent as SSEEvent);
        currentEvent = {};
      }
    }

    return events;
  }

  /**
   * Stream the conversation response as an async generator
   */
  async *converseStream({
    input,
    agentId,
    conversationId,
    connectorId = CONNECTOR_ID,
  }:
    {input: string,
    agentId: string,
    conversationId?: string | undefined,
    connectorId?: string | undefined,}
  ): AsyncGenerator<SSEEvent> {
    const response = await fetch(`${this.baseUrl}/api/agent_builder/converse/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${this.apiKey}`,
        'kbn-xsrf': 'true',
      },
      body: JSON.stringify({
        input,
        agent_id: agentId,
        conversation_id: conversationId,
        connector_id: connectorId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent: { event?: string; data?: any } = {};

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent.event = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            try {
              currentEvent.data = JSON.parse(dataStr);
            } catch {
              currentEvent.data = dataStr;
            }
          } else if (line.trim() === '' && currentEvent.event && currentEvent.data) {
            // Empty line signals end of event
            // Cast to SSEEvent - we trust the API to send correct event types
            yield currentEvent as SSEEvent;
            currentEvent = {};
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Legacy method - returns all events as a parsed array
   */
  async converse(input: string, agentId: string, conversationId?: string) {
    const response = await this.client.post('/api/agent_builder/converse/async', {
      input,
      agent_id: agentId,
      conversation_id: conversationId,
    });

    // Parse SSE format if it's a string
    if (typeof response.data === 'string') {
      return this.parseSSE(response.data);
    }

    return response.data;
  }
}
