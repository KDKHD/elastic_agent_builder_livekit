# Agent Builder Voice Pipeline

A voice AI agent integrated with Elasticsearch for product search, order management, and knowledge base queries. Built for "Elastic Sport", a fictional sports equipment company, this agent demonstrates real-time voice interactions with semantic search capabilities.

## How It Works

This project implements a complete voice pipeline that bridges real-time communication with Kibana's Agent Builder platform. The key is a **custom LLM node** (`AgentBuilderLlm`) that seamlessly integrates voice agents with Kibana's Agent Builder.

### Architecture Overview

1. **Voice Pipeline**: Users interact with the agent through voice using a web interface (playground). Speech-to-text (STT) converts audio to text, text-to-speech (TTS) converts responses back to audio.

2. **Custom LLM Integration**: The `AgentBuilderLlm` class extends the standard LLM interface to communicate with Kibana's Agent Builder API. Instead of calling OpenAI or Anthropic directly, it:
   - Sends user messages to Kibana's Agent Builder via streaming API
   - Receives and processes server-sent events (SSE) including tool calls, reasoning steps, and responses
   - Maintains conversation state across multiple turns
   - Streams tool progress messages in real-time for better user experience

3. **Agent Builder Backend**: In Kibana, you configure agents with:
   - Instructions and personality
   - Tools for searching products, orders, and knowledge base
   - Elasticsearch integrations for semantic search (ELSER)
   - LLM provider selection (OpenAI, Anthropic, etc.)

4. **Data Layer**: Three Elasticsearch indices power the agent:
   - **Products**: Semantic search using ELSER for natural language queries
   - **Orders**: Customer order tracking and status updates
   - **Knowledge Base**: Company policies, FAQs, and procedures

### Custom LLM Node Details

The `AgentBuilderLlm` class implements the LLM interface by:

```typescript
// Extends base LLM to integrate with Agent Builder
export class AgentBuilderLlm extends llm.LLM {
  // Communicates with Kibana's Agent Builder API
  private kibanaClient: KibanaClient;
  
  // Maintains conversation context
  private conversationId: string | undefined;
}
```

The streaming implementation handles multiple event types from Agent Builder:
- `conversation_id_set`: Tracks conversation state
- `tool_call`: Logs when tools are invoked
- `tool_progress`: Streams real-time progress to the user
- `tool_result`: Processes tool execution results
- `message_complete`: Delivers the final agent response

This architecture allows you to leverage all of Agent Builder's capabilities (tool management, prompt engineering, LLM selection) while providing a natural voice interface for end users.

## Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0
- Elasticsearch 8.x
- Kibana

## Setup

### 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Kibana Configuration
KIBANA_BASE_URL=https://your-kibana-instance.kb.us-east-1.cloud.es.io
KIBANA_API_KEY=your-kibana-api-key-here

# Elasticsearch Configuration
ELASTIC_SEARCH_BASE_URL=https://your-elasticsearch-instance.es.us-east-1.cloud.es.io
ELASTIC_SEARCH_USERNAME=elastic
ELASTIC_SEARCH_PASSWORD=your-elasticsearch-password

# Server Configuration (for local development)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

#### Getting Your Credentials

**Elasticsearch & Kibana:**
- Sign up for Elastic Cloud at https://cloud.elastic.co
- Create a deployment (select the region closest to you)
- Copy the Elasticsearch endpoint URL to `ELASTIC_SEARCH_BASE_URL`
- Copy the Kibana endpoint URL to `KIBANA_BASE_URL`
- Use your elastic user password for `ELASTIC_SEARCH_PASSWORD`
- Generate a Kibana API key:
  1. In Kibana, go to Stack Management > API Keys
  2. Create API key with appropriate permissions
  3. Copy the encoded key to `KIBANA_API_KEY`

**Server Credentials:**
- For local development, use the default values shown above
- The local server will be started in the next step

Alternativly, you can run this modified version of Kibana: https://github.com/KDKHD/kibana/tree/on-week-agent-builder that contains an additonal agent mode optimised for this project (lower latency, interim tool messages, etc...). DISCLAIMER: The voice agent optimised version is not being updated with the latest Agent Builder features.

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Elasticsearch Indices

This project uses three Elasticsearch indices:
- **products**: Product catalog with semantic search (ELSER)
- **orders**: Customer orders
- **knowledge_base**: Company policies and information

Run the setup script to create these indices and populate them with sample data:

```bash
pnpm setup-sample-data
```

This script will:
1. Set up the ELSER inference endpoint for semantic search (first time may take 5-10 minutes)
2. Create the `products` index with product data
3. Create the `orders` index with sample orders
4. Create the `knowledge_base` index with company policies
5. Populate all indices with sample data

**Note:** The ELSER model deployment is required for semantic search. The first run will download and deploy the model, which can take several minutes. Subsequent runs will be much faster.

### 4. Build the Agent

```bash
pnpm build
```

## Running the Agent

### 1. Start Local Server

Start a local server using the LiveKit CLI:

```bash
# Install CLI (if not already installed)
brew update && brew install livekit

# Starts local server (with API key: devkey and API secret: secret)
livekit-server --dev
```

**Note:** Keep this terminal running. The server needs to be active for the agent to connect.

### 2. Start the Agent

In a new terminal, start your agent in development mode:

```bash
pnpm dev
```

The agent will connect to your local server and wait for participants to join.

### 3. Test the Agent with Playground

The [Agents Playground](https://github.com/livekit/agents-playground) provides a web interface to interact with your agent via voice, video, and chat.

**Set up the playground:**

```bash
# Clone the playground repository
git clone https://github.com/livekit/agents-playground.git
cd agents-playground

# Install dependencies
npm install

# Create .env file with your server credentials
cat > .env << EOF
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
EOF

# Start the playground
npm run dev
```

The playground will be available at http://localhost:3000. Connect to a room and your agent will automatically join and interact with you.

## Testing the Agent

Try these sample conversations:

- **Product Search:** "Do you have running shoes?"
- **Order Status:** "What's the status of order 1001?"
- **Returns:** "How do I return a product?"
- **General Info:** "What are your business hours?"

## Development

### Available Scripts

- `pnpm dev` - Run agent in development mode with hot reload
- `pnpm build` - Build the TypeScript project
- `pnpm start` - Start the built agent
- `pnpm test` - Run tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm lint` - Lint the codebase
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Prettier
- `pnpm setup-sample-data` - Set up Elasticsearch indices with sample data

## Troubleshooting

### ELSER Model Takes Too Long to Deploy

The first time you run the setup script, ELSER may take 5-10 minutes to download and deploy. If it times out, the script will continue anyway. You can check the deployment status in Kibana:

1. Go to Stack Management > Machine Learning > Trained Models
2. Find `.elser_model_2`
3. Wait for deployment state to be "started"
4. Re-run the setup script once deployment is complete

### Agent Can't Connect to Server

- Verify that the server is running in a separate terminal
- Check that ports 7880, 7881, and 7882 are not already in use
- Ensure your `.env.local` has `LIVEKIT_URL=ws://localhost:7880`
- Verify `LIVEKIT_API_KEY=devkey` and `LIVEKIT_API_SECRET=secret` match your server config

### Elasticsearch Connection Failed

- Verify your Elasticsearch URL and credentials
- Check that your Elasticsearch instance is accessible
- Ensure your Elastic Cloud deployment is running

## Learn More

- [Voice Agents Documentation](https://docs.livekit.io/agents/)
- [Node.js Agents SDK](https://docs.livekit.io/agents/quickstart/)
- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [ELSER Semantic Search](https://www.elastic.co/guide/en/machine-learning/current/ml-nlp-elser.html)


