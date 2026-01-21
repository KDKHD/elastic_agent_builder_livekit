# Order Search Tool

## Description

Use this tool to retrieve order by their ID.

## Configuration

```
type: ES|QL
toolId: order.search
description: Use this tool to retrieve order by their ID.
```

### Query

```
FROM orders
    METADATA _score
  | WHERE order_id == ?order_id
  | SORT _score DESC
  | LIMIT 1
```

## Parameters

- **order_id**: the ID of the order

