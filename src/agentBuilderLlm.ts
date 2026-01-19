import { APIConnectOptions, llm } from '@livekit/agents';
import { AGENT_ID, CONNECTOR_ID, type KibanaClient } from './kibanaClient';

export class AgentBuilderLlm extends llm.LLM {
  private kibanaClient: KibanaClient;
  private conversationId: string | undefined;
  private agentId: string;

  constructor(kibanaClient: KibanaClient, agentId: string = AGENT_ID) {
    super();
    this.kibanaClient = kibanaClient;
    this.agentId = agentId;
    this.conversationId = undefined;
  }

  override label(): string {
    return 'agent-builder-llm';
  }

  override get model(): string {
    return this.agentId;
  }

  override chat({
    chatCtx,
    toolCtx,
    connOptions,
    parallelToolCalls,
    toolChoice,
    extraKwargs,
  }: {
    chatCtx: llm.ChatContext;
    toolCtx?: llm.ToolContext;
    connOptions?: APIConnectOptions;
    parallelToolCalls?: boolean;
    toolChoice?: llm.ToolChoice;
    extraKwargs?: Record<string, any>;
  }): AgentBuilderLlmStream {
    // Default connection options if not provided
    const defaultConnOptions = new APIConnectOptions({
      timeoutMs: 30000,
      maxRetry: 3,
    });

    const streamOptions: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    } = {
      chatCtx,
      connOptions: connOptions || defaultConnOptions,
    };

    if (toolCtx !== undefined) {
      streamOptions.toolCtx = toolCtx;
    }

    return new AgentBuilderLlmStream(
      this,
      this.kibanaClient,
      this.agentId,
      streamOptions,
      (conversationId: string) => {
        this.conversationId = conversationId;
      },
      () => this.conversationId,
    );
  }
}

export class AgentBuilderLlmStream extends llm.LLMStream {
  private kibanaClient: KibanaClient;
  private agentId: string;
  private setConversationId: (conversationId: string) => void;
  private getConversationId: () => string | undefined;

  constructor(
    llm: llm.LLM,
    kibanaClient: KibanaClient,
    agentId: string,
    options: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    },
    setConversationId: (conversationId: string) => void,
    getConversationId: () => string | undefined,
  ) {
    const superOptions: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    } = {
      chatCtx: options.chatCtx,
      connOptions: options.connOptions,
    };

    if (options.toolCtx !== undefined) {
      superOptions.toolCtx = options.toolCtx;
    }

    super(llm, superOptions);
    this.kibanaClient = kibanaClient;
    this.agentId = agentId;
    this.setConversationId = setConversationId;
    this.getConversationId = getConversationId;
  }

  protected override async run(): Promise<void> {
    // Get the last user message from the chat context
    const items = this.chatCtx.items;
    const lastItem = items[items.length - 1];

    if (!lastItem || lastItem.type !== 'message') {
      throw new Error('No user message found in chat context');
    }

    const lastMessage = lastItem as llm.ChatMessage;

    // Extract text from the message content
    let userInput: string = '';
    const content = lastMessage.content;

    if (typeof content === 'string') {
      userInput = content;
    } else if (Array.isArray(content)) {
      // Content can be an array of strings or objects
      userInput = content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          } else if (typeof item === 'object' && item && 'text' in item) {
            return String(item.text);
          }
          return '';
        })
        .join(' ')
        .trim();
    }

    if (!userInput || userInput.trim().length === 0) {
      throw new Error('User message is empty');
    }
    const conversationId = this.getConversationId();

    // Stream the conversation with Kibana Agent Builder
    let messageId = `msg-${Date.now()}`;
    let hasEmittedContent = false;

    try {
      for await (const event of this.kibanaClient.converseStream({
        input: userInput,
        agentId: this.agentId,
        conversationId: conversationId,
        connectorId: CONNECTOR_ID,
      })) {
        // Check if stream was aborted
        if (this.abortController.signal.aborted) {
          break;
        }

        switch (event.event) {
          case 'conversation_id_set':
            // Store the conversation ID for future requests
            this.setConversationId(event.data.data.conversation_id);
            this.logger.debug(`conversation_id set to ${event.data.data.conversation_id}`);
            break;

          case 'reasoning':
            // Reasoning event - log for debugging
            this.logger.debug('reasoning event received');
            break;

          case 'tool_call':
            // Tool call initiated
            this.logger.debug(
              `tool_call: ${event.data.data.tool_id} (${event.data.data.tool_call_id})`,
            );
            break;

          case 'tool_progress':
            // Emit tool progress messages to the stream
            const progressMessage = event.data.data.message;

            // If we haven't emitted any content yet, emit the role first
            if (!hasEmittedContent) {
              this.queue.put({
                id: messageId,
                delta: {
                  role: 'assistant',
                  content: '',
                },
              });
              hasEmittedContent = true;
            }

            // Emit the progress message
            this.queue.put({
              id: messageId,
              delta: {
                role: 'assistant',
                content: progressMessage,
              },
            });

            this.logger.debug(
              `tool_progress: ${event.data.data.tool_call_id} - ${progressMessage}`,
            );
            break;

          case 'tool_result':
            // Tool execution completed
            this.logger.debug(
              `tool_result: ${event.data.data.tool_id} (${event.data.data.tool_call_id})`,
            );
            break;

          case 'message_complete':
            // Emit the assistant message content as a chat chunk
            messageId = event.data.data.message_id;
            const content = event.data.data.message_content;

            // If we haven't emitted any content yet, emit the role first
            if (!hasEmittedContent) {
              this.queue.put({
                id: messageId,
                delta: {
                  role: 'assistant',
                  content: '',
                },
              });
              hasEmittedContent = true;
            }

            // Emit the full content as a single chunk
            this.queue.put({
              id: messageId,
              delta: {
                role: 'assistant',
                content: content,
              },
            });
            break;

          case 'round_complete':
            // Round is complete - could log or handle additional metadata
            this.logger.debug(`round complete: ${event.data.data.round.id}`);
            break;

          case 'conversation_created':
            // Conversation created with a title
            this.logger.debug(`conversation created: ${event.data.data.title}`);
            break;

          case 'conversation_updated':
            // Conversation title updated
            this.logger.debug(`conversation updated: ${event.data.data.title}`);
            break;

          case 'error':
            // Handle error events from the API
            throw new Error(`Kibana Agent Builder error: ${event.data.error.message}`);
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Error streaming from Kibana Agent Builder');
      throw error;
    }
  }
}
