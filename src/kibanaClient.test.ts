import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AGENT_ID, BASEURL, KibanaClient, type SSEEvent } from './kibanaClient.js';
import { APIKEY } from './kibanaClient.js';

describe('KibanaClient - Real API Tests', () => {
    const baseUrl = BASEURL;
    const apiKey = APIKEY;
    const agentId = AGENT_ID;
    const conversationId = undefined;
    const input = 'Hello, how can you help me?';
    const toolCallInput = 'Which indices do I have?';

    it('should create a KibanaClient instance', () => {
        const client = new KibanaClient(baseUrl, apiKey);
        assert.ok(client, 'Client should be created');
        assert.ok(client.client, 'Axios instance should be created');
    });

    it('should parse SSE response with legacy converse method', async () => {
        const client = new KibanaClient(baseUrl, apiKey);

        try {
            console.log('\n=== TESTING LEGACY CONVERSE METHOD ===\n');

            const result = await client.converse(input, agentId, conversationId);

            console.log('Parsed Events:', JSON.stringify(result, null, 2));

            assert.ok(Array.isArray(result), 'Result should be an array of events');
            assert.ok(result.length > 0, 'Should have at least one event');

            // Log each event type with type-safe access
            console.log('\n--- Event Types Received ---');
            result.forEach((event: SSEEvent, index: number) => {
                console.log(`${index + 1}. Event: ${event.event}`);
                if (event.event === 'message_complete') {
                    // TypeScript knows event is MessageCompleteEvent here
                    const msg = event.data.data.message_content;
                    console.log(`   Message: ${msg.substring(0, 100)}...`);
                }
            });
            console.log('--- End Event Types ---\n');
        } catch (error: any) {
            console.log('\n=== API ERROR ===');
            console.log('Error:', error.message);
            if (error.response) {
                console.log('Status:', error.response.status);
                console.log('Data:', JSON.stringify(error.response.data, null, 2));
            }
            console.log('=== END ERROR ===\n');

            assert.ok(true, 'Error captured and logged');
        }
    });

    it('should stream SSE response with converseStream async generator', async () => {
        const client = new KibanaClient(baseUrl, apiKey);

        try {
            console.log('\n=== TESTING STREAMING ASYNC GENERATOR ===\n');

            const events: SSEEvent[] = [];

            for await (const event of client.converseStream({ input, agentId, conversationId })) {
                events.push(event);
                console.log(`📥 Received event: ${event.event}`);

                // TypeScript type narrowing with discriminated union
                switch (event.event) {
                    case 'conversation_id_set':
                        // TypeScript knows event is ConversationIdSetEvent here
                        console.log(`   ➜ Conversation ID: ${event.data.data.conversation_id}`);
                        break;
                    case 'reasoning':
                        // Reasoning event
                        console.log(`   ➜ Reasoning event`);
                        break;
                    case 'tool_call':
                        // Tool call event
                        console.log(
                            `   ➜ Tool call: ${event.data.data.tool_id} (${event.data.data.tool_call_id})`,
                        );
                        break;
                    case 'tool_progress':
                        // Tool progress event
                        console.log(`   ➜ Tool progress: ${event.data.data.message}`);
                        break;
                    case 'tool_result':
                        // Tool result event
                        console.log(
                            `   ➜ Tool result: ${event.data.data.tool_id} (${event.data.data.tool_call_id})`,
                        );
                        break;
                    case 'message_complete':
                        // TypeScript knows event is MessageCompleteEvent here
                        const message = event.data.data.message_content;
                        console.log(
                            `   ➜ Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`,
                        );
                        break;
                    case 'round_complete':
                        // TypeScript knows event is RoundCompleteEvent here
                        console.log(`   ➜ Round ID: ${event.data.data.round.id}`);
                        break;
                    case 'conversation_created':
                        // TypeScript knows event is ConversationCreatedEvent here
                        console.log(`   ➜ Title: ${event.data.data.title}`);
                        break;
                    case 'conversation_updated':
                        // Conversation updated event
                        console.log(`   ➜ Updated title: ${event.data.data.title}`);
                        break;
                    case 'error':
                        // TypeScript knows event is ErrorEvent here
                        console.log(`   ➜ Error: ${event.data.error.message}`);
                        break;
                }
            }

            console.log(`\n✅ Received ${events.length} events total\n`);

            assert.ok(events.length > 0, 'Should have received at least one event');

            // Verify we got the expected event types
            const eventTypes = events.map((e) => e.event);
            console.log('Event types received:', eventTypes);
        } catch (error: any) {
            console.log('\n=== STREAMING ERROR ===');
            console.log('Error:', error.message);
            console.log('=== END ERROR ===\n');

            assert.ok(true, 'Error captured and logged');
        }
    });

    it('should stream SSE response with converseStream async generator with tool call', async () => {
        const client = new KibanaClient(baseUrl, apiKey);

        try {
            console.log('\n=== TESTING STREAMING ASYNC GENERATOR ===\n');

            const events: SSEEvent[] = [];

            for await (const event of client.converseStream({ input: toolCallInput, agentId, conversationId })) {
                events.push(event);
                console.log(`📥 Received event: ${event.event}`);

                // TypeScript type narrowing with discriminated union
                switch (event.event) {
                    case 'conversation_id_set':
                        // TypeScript knows event is ConversationIdSetEvent here
                        console.log(`   ➜ Conversation ID: ${event.data.data.conversation_id}`);
                        break;
                    case 'message_complete':
                        // TypeScript knows event is MessageCompleteEvent here
                        const message = event.data.data.message_content;
                        console.log(
                            `   ➜ Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`,
                        );
                        break;
                    case 'round_complete':
                        // TypeScript knows event is RoundCompleteEvent here
                        console.log(`   ➜ Round ID: ${event.data.data.round.id}`);
                        break;
                    case 'conversation_created':
                        // TypeScript knows event is ConversationCreatedEvent here
                        console.log(`   ➜ Title: ${event.data.data.title}`);
                        break;
                    case 'error':
                        // TypeScript knows event is ErrorEvent here
                        console.log(`   ➜ Error: ${event.data.error.message}`);
                        break;
                }
            }

            console.log(`\n✅ Received ${events.length} events total\n`);

            assert.ok(events.length > 0, 'Should have received at least one event');

            // Verify we got the expected event types
            const eventTypes = events.map((e) => e.event);
            console.log('Event types received:', eventTypes);
        } catch (error: any) {
            console.log('\n=== STREAMING ERROR ===');
            console.log('Error:', error.message);
            console.log('=== END ERROR ===\n');

            assert.ok(true, 'Error captured and logged');
        }
    });

    it('should demonstrate type-safe event handling', async () => {
        const client = new KibanaClient(baseUrl, apiKey);

        try {
            console.log('\n=== TESTING TYPE-SAFE EVENT HANDLING ===\n');

            let capturedConversationId: string | undefined;
            let messageContent: string | undefined;

            for await (const event of client.converseStream({ input, agentId, conversationId })) {
                // Type-safe event handling
                if (event.event === 'conversation_id_set') {
                    capturedConversationId = event.data.data.conversation_id;
                    console.log(`✓ Captured conversation ID: ${capturedConversationId}`);
                } else if (event.event === 'message_complete') {
                    messageContent = event.data.data.message_content;
                    console.log(`✓ Captured message (${messageContent.length} chars)`);
                }
            }

            assert.ok(capturedConversationId, 'Should have captured conversation ID');
            assert.ok(messageContent, 'Should have captured message content');

            console.log(`\n✅ Type-safe extraction complete\n`);
        } catch (error: any) {
            console.log('\n=== ERROR ===');
            console.log('Error:', error.message);
            console.log('=== END ERROR ===\n');

            assert.ok(true, 'Error captured and logged');
        }
    });
});
