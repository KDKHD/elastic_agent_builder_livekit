# Knowledge Base Search Tool

## Description

Use this tool to search the knowledgebase.

## Configuration

```
type: ES|QL
toolId: knowledgebase.search
description: Use this tool to search the knowledgebase.
```

### Query

```
FROM knowledge_base
    METADATA _score
  | WHERE
      MATCH(title, ?query, {"boost": 0.6}) OR
        MATCH(content, ?query, {"boost": 0.4})
  | SORT _score DESC
  | LIMIT 20
  | RERANK ?query
        ON content
        WITH {"inference_id": ".rerank-v1-elasticsearch"}
  | LIMIT 5
```

## Parameters

- **query**: space separated keywords or natural language phrase to semantically search for in the knowledge base
