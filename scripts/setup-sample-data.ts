import { Client } from '@elastic/elasticsearch';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Product {
  sku: string;
  name: string;
  price: number;
  currency: string;
  image: string;
  description: string;
  category: string;
  subCategory: string;
  brand: string;
  sizes: (string | number)[];
  colors: string[];
  materials: string[];
}

interface Order {
  order_id: string;
  order_date: string;
  order_status: string;
  order_total: number;
  order_items: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
    size: string | number;
    color: string;
  }>;
  delivery_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_id: string;
  estimated_delivery_date: string;
}

interface KnowledgeBase {
  id: string;
  createdAt: string;
  title: string;
  content: string;
}

async function setupElserEndpoint(client: Client, endpointId: string): Promise<void> {
  console.log(`\nChecking ELSER inference endpoint "${endpointId}"...`);

  try {
    // Check if the endpoint already exists
    const endpointExists = await client.inference
      .get({
        inference_id: endpointId,
      })
      .then(() => true)
      .catch((error) => {
        if (error.statusCode === 404) {
          return false;
        }
        throw error;
      });

    if (endpointExists) {
      console.log(`✓ ELSER inference endpoint "${endpointId}" already exists.`);
      return;
    }

    // Create the ELSER inference endpoint
    console.log(`Creating ELSER inference endpoint "${endpointId}"...`);
    console.log('This will download and deploy the ELSER model (this may take a few minutes)...');

    await client.inference.put({
      inference_id: endpointId,
      task_type: 'sparse_embedding',
      body: {
        service: 'elasticsearch',
        service_settings: {
          adaptive_allocations: {
            enabled: true,
            min_number_of_allocations: 1,
            max_number_of_allocations: 10,
          },
          num_threads: 1,
          model_id: '.elser_model_2',
        },
      },
    });

    console.log(`✓ ELSER inference endpoint "${endpointId}" created successfully.`);
    console.log('  Model is being downloaded and deployed...');

    // Wait for the model to be fully deployed
    console.log('  Waiting for model deployment to complete...');
    let isDeployed = false;
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 5 minutes (60 * 5 seconds)

    while (!isDeployed && attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      try {
        const stats = await client.ml.getTrainedModelsStats({
          model_id: '.elser_model_2',
        });

        const modelStats = stats.trained_model_stats[0];
        if (
          modelStats &&
          modelStats.deployment_stats &&
          modelStats.deployment_stats.state === 'started'
        ) {
          isDeployed = true;
          console.log('  ✓ ELSER model deployed and ready!');
        } else {
          process.stdout.write('.');
        }
      } catch (error) {
        // Model stats not available yet, continue waiting
        process.stdout.write('.');
      }
    }

    if (!isDeployed) {
      console.log(
        '\n⚠️  Warning: Model deployment is taking longer than expected. Proceeding anyway...',
      );
    }
  } catch (error) {
    console.error('Error setting up ELSER endpoint:', error);
    throw error;
  }
}

async function setupOrdersIndex(client: Client) {
  const indexName = 'orders';

  try {
    // Check if index exists and delete it if it does (for clean setup)
    const indexExists = await client.indices.exists({ index: indexName });
    if (indexExists) {
      console.log(`Index "${indexName}" already exists. Deleting...`);
      await client.indices.delete({ index: indexName });
      console.log(`Index "${indexName}" deleted.`);
    }

    // Create index with mappings
    console.log(`Creating index "${indexName}" with mappings...`);
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            order_id: { type: 'long' },
            order_date: { type: 'date' },
            order_status: { type: 'keyword' },
            order_total: { type: 'float' },
            order_items: {
              type: 'object',
              properties: {
                sku: { type: 'keyword' },
                name: { type: 'text' },
                price: { type: 'float' },
                currency: { type: 'keyword' },
                size: { type: 'keyword' },
                color: { type: 'keyword' },
              },
            },
            delivery_address: {
              type: 'object',
              properties: {
                street: { type: 'text' },
                city: { type: 'keyword' },
                state: { type: 'keyword' },
                zip: { type: 'keyword' },
                country: { type: 'keyword' },
              },
            },
            customer_name: { type: 'text' },
            customer_email: { type: 'keyword' },
            customer_phone: { type: 'keyword' },
            customer_id: { type: 'long' },
            estimated_delivery_date: { type: 'date' },
          },
        },
      },
    });
    console.log(`Index "${indexName}" created successfully.`);

    // Read orders from JSON file
    const ordersPath = path.join(__dirname, '..', 'orders.ts');
    const ordersData = fs.readFileSync(ordersPath, 'utf-8');
    const orders: Order[] = JSON.parse(ordersData);

    console.log(`Found ${orders.length} orders to index.`);

    // Prepare bulk operations
    const bulkOperations = orders.flatMap((order) => [
      { index: { _index: indexName, _id: order.order_id } },
      order,
    ]);

    // Bulk insert orders
    console.log('Bulk indexing orders...');
    const bulkResponse = await client.bulk({
      refresh: true,
      body: bulkOperations,
    });

    if (bulkResponse.errors) {
      const erroredDocuments: any[] = [];
      bulkResponse.items.forEach((action: any, i: number) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: bulkOperations[i * 2],
            document: bulkOperations[i * 2 + 1],
          });
        }
      });
      console.error('Errors occurred during bulk indexing:');
      console.error(JSON.stringify(erroredDocuments, null, 2));
    } else {
      console.log(`Successfully indexed ${orders.length} orders.`);
    }

    // Verify the count
    const countResponse = await client.count({ index: indexName });
    console.log(`Total documents in index "${indexName}": ${countResponse.count}`);
  } catch (error) {
    console.error('Error setting up orders index:', error);
    throw error;
  }
}

async function setupKnowledgeBaseIndex(client: Client, elserEndpointId: string) {
  const indexName = 'knowledge_base';

  try {
    // Check if index exists and delete it if it does (for clean setup)
    const indexExists = await client.indices.exists({ index: indexName });
    if (indexExists) {
      console.log(`Index "${indexName}" already exists. Deleting...`);
      await client.indices.delete({ index: indexName });
      console.log(`Index "${indexName}" deleted.`);
    }

    // Create index with mappings
    console.log(`Creating index "${indexName}" with mappings...`);
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            createdAt: { type: 'date' },
            title: {
              type: 'semantic_text',
              inference_id: elserEndpointId,
            },
            content: {
              type: 'semantic_text',
              inference_id: elserEndpointId,
            },
          },
        },
      },
    });
    console.log(`Index "${indexName}" created successfully.`);

    // Read knowledge base from file
    const knowledgeBasePath = path.join(__dirname, '..', 'knowledgeBase.ts');
    const knowledgeBaseData = fs.readFileSync(knowledgeBasePath, 'utf-8');
    // Parse the array literal (remove any export statements if present)
    const knowledgeBase: KnowledgeBase[] = eval(knowledgeBaseData);

    console.log(`Found ${knowledgeBase.length} knowledge base entries to index.`);

    // Prepare bulk operations
    const bulkOperations = knowledgeBase.flatMap((entry) => [
      { index: { _index: indexName, _id: entry.id } },
      entry,
    ]);

    // Bulk insert knowledge base entries
    console.log('Bulk indexing knowledge base entries...');
    const bulkResponse = await client.bulk({
      refresh: true,
      body: bulkOperations,
    });

    if (bulkResponse.errors) {
      const erroredDocuments: any[] = [];
      bulkResponse.items.forEach((action: any, i: number) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: bulkOperations[i * 2],
            document: bulkOperations[i * 2 + 1],
          });
        }
      });
      console.error('Errors occurred during bulk indexing:');
      console.error(JSON.stringify(erroredDocuments, null, 2));
    } else {
      console.log(`Successfully indexed ${knowledgeBase.length} knowledge base entries.`);
    }

    // Verify the count
    const countResponse = await client.count({ index: indexName });
    console.log(`Total documents in index "${indexName}": ${countResponse.count}`);
  } catch (error) {
    console.error('Error setting up knowledge base index:', error);
    throw error;
  }
}

async function setupSampleData() {
  // Initialize Elasticsearch client
  const client = new Client({
    node: process.env.ELASTIC_SEARCH_BASE_URL || 'http://localhost:9200',
    auth: {
      username: process.env.ELASTIC_SEARCH_USERNAME || 'elastic',
      password: process.env.ELASTIC_SEARCH_PASSWORD || 'changeme',
    },
  });

  const indexName = 'products';
  const elserEndpointId = 'elser-v2-endpoint';

  try {
    // Set up ELSER inference endpoint first
    await setupElserEndpoint(client, elserEndpointId);

    // Check if index exists and delete it if it does (for clean setup)
    const indexExists = await client.indices.exists({ index: indexName });
    if (indexExists) {
      console.log(`Index "${indexName}" already exists. Deleting...`);
      await client.indices.delete({ index: indexName });
      console.log(`Index "${indexName}" deleted.`);
    }

    // Create index with mappings
    console.log(`Creating index "${indexName}" with mappings...`);
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              product_analyzer: {
                type: 'standard',
                stopwords: '_english_',
              },
            },
          },
        },
        mappings: {
          properties: {
            sku: { type: 'keyword' },
            name: {
              type: 'semantic_text',
              inference_id: 'elser-v2-endpoint',
            },
            price: { type: 'float' },
            currency: { type: 'keyword' },
            image: { type: 'keyword', index: false },
            description: {
              type: 'semantic_text',
              inference_id: 'elser-v2-endpoint',
            },
            category: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
              },
            },
            subCategory: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
              },
            },
            brand: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
              },
            },
            sizes: { type: 'keyword' },
            colors: { type: 'keyword' },
            materials: { type: 'keyword' },
          },
        },
      },
    });
    console.log(`Index "${indexName}" created successfully.`);

    // Read products from JSON file
    const productsPath = path.join(__dirname, '..', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf-8');
    const products: Product[] = JSON.parse(productsData);

    console.log(`Found ${products.length} products to index.`);

    // Prepare bulk operations
    const bulkOperations = products.flatMap((product) => [
      { index: { _index: indexName, _id: product.sku } },
      product,
    ]);

    // Bulk insert products
    console.log('Bulk indexing products...');
    const bulkResponse = await client.bulk({
      refresh: true,
      body: bulkOperations,
    });

    if (bulkResponse.errors) {
      const erroredDocuments: any[] = [];
      bulkResponse.items.forEach((action: any, i: number) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: bulkOperations[i * 2],
            document: bulkOperations[i * 2 + 1],
          });
        }
      });
      console.error('Errors occurred during bulk indexing:');
      console.error(JSON.stringify(erroredDocuments, null, 2));
    } else {
      console.log(`Successfully indexed ${products.length} products.`);
    }

    // Verify the count
    const countResponse = await client.count({ index: indexName });
    console.log(`Total documents in index "${indexName}": ${countResponse.count}`);

    // Set up orders index
    console.log('\n=== Setting up Orders Index ===');
    await setupOrdersIndex(client);

    // Set up knowledge base index
    console.log('\n=== Setting up Knowledge Base Index ===');
    await setupKnowledgeBaseIndex(client, elserEndpointId);

    // Create index pattern in Kibana (optional)
    console.log('\nNote: To create index patterns in Kibana:');
    console.log('1. Go to Stack Management > Index Patterns');
    console.log('2. Create new index patterns with names: products, orders, knowledge_base');
    console.log('3. For orders, you can use order_date as the time field');
    console.log('4. For knowledge_base, you can use createdAt as the time field');

    console.log('\n✅ Setup complete!');
    console.log(
      `   - ELSER inference endpoint "${elserEndpointId}" is ready for semantic search`,
    );
    console.log(`   - Products index "products" created with ${countResponse.count} documents`);
    console.log('   - Orders index "orders" created and populated');
    console.log('   - Knowledge base index "knowledge_base" created and populated');
  } catch (error) {
    console.error('Error setting up indices:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run the setup
setupSampleData().catch((error) => {
  console.error('Failed to setup indices:', error);
  process.exit(1);
});

