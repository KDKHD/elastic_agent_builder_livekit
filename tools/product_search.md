# Product Search Tool

## Description

Use this tool to search through the product catalogue by keywords.

## Configuration

```
type: ES|QL
toolId: products.search
description: Use this tool to search through the product catalogue by keywords.
```

### Query

```
FROM products
    METADATA _score
  | WHERE
      MATCH(name, ?query, {"boost": 0.6}) OR
        MATCH(description, ?query, {"boost": 0.4})
  | SORT _score DESC
  | LIMIT 20
  | RERANK ?query
        ON description
        WITH {"inference_id": ".rerank-v1-elasticsearch"}
  | LIMIT 5
```

## Parameters

- **query**: space separated keywords to search for in catalogue
